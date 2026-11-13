package kernel

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"text/template"
	"time"

	"github.com/gotd/td/tg"
	"github.com/iyear/tdl/core/dcpool"
	"github.com/iyear/tdl/core/downloader"
	coretclient "github.com/iyear/tdl/core/tclient"
	"github.com/iyear/tdl/core/tmedia"
	"github.com/iyear/tdl/core/util/tutil"
	"github.com/iyear/tdl/pkg/tplfunc"
	"golang.org/x/sync/errgroup"
)

const (
	downloadQueued  = "queued"
	downloadActive  = "active"
	downloadPaused  = "paused"
	downloadDone    = "done"
	downloadFailed  = "failed"
	downloadTempExt = ".tmp"
)

type DownloadTaskDTO struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Chat      string `json:"chat"`
	ChatID    string `json:"chatId"`
	MessageID int    `json:"messageId"`
	MediaKind string `json:"mediaKind,omitempty"`
	Size      string `json:"size"`
	Progress  int    `json:"progress"`
	Speed     string `json:"speed,omitempty"`
	ETA       string `json:"eta,omitempty"`
	Status    string `json:"status"`
	Ext       string `json:"ext"`
	Color     string `json:"color"`
	Error     string `json:"error,omitempty"`
	Path      string `json:"path,omitempty"`
}

// DownloadOptions carries the tdl download settings the client exposes in
// Settings → Downloads. Zero values are normalized to tdl's own defaults.
type DownloadOptions struct {
	Threads          int  `json:"threads"`
	Pool             int  `json:"pool"`
	Limit            int  `json:"limit"`
	SkipSame         bool `json:"skipSame"`
	RewriteExt       bool `json:"rewriteExt"`
	Takeout          bool `json:"takeout"`
	ReconnectSeconds int  `json:"reconnectSeconds"`
}

func normalizeDownloadOptions(options DownloadOptions) DownloadOptions {
	if options.Threads < 1 {
		options.Threads = 4
	}
	if options.Threads > 16 {
		options.Threads = 16
	}
	if options.Pool < 1 {
		options.Pool = 8
	}
	if options.Pool > 16 {
		options.Pool = 16
	}
	if options.Limit < 1 {
		options.Limit = 2
	}
	if options.Limit > 8 {
		options.Limit = 8
	}
	if options.ReconnectSeconds < 30 {
		options.ReconnectSeconds = 300
	}
	if options.ReconnectSeconds > 3600 {
		options.ReconnectSeconds = 3600
	}
	return options
}

type DownloadEvent struct {
	Task    *DownloadTaskDTO `json:"task,omitempty"`
	Removed bool             `json:"removed,omitempty"`
}

type downloadTask struct {
	dto DownloadTaskDTO

	chatID     string
	messageID  int
	proxy      string
	ntp        string
	dir        string
	template   string
	threads    int
	poolSize   int
	limit      int
	skipSame   bool
	rewriteExt bool
	takeout    bool
	reconnect  time.Duration
	mediaKind  string

	ctx        context.Context
	cancel     context.CancelFunc
	generation int
	done       chan struct{}

	total      int64
	downloaded int64
	tempPath   string
	created    int64
}

func (s *Service) SetDownloadEventSink(sink func(DownloadEvent)) {
	s.downloadMu.Lock()
	s.downloadSink = sink
	s.downloadMu.Unlock()
}

func (s *Service) emitDownload(event DownloadEvent) {
	s.downloadMu.Lock()
	sink := s.downloadSink
	s.downloadMu.Unlock()
	if sink != nil {
		sink(event)
	}
}

// StartDownload queues one task per message. Downloads share the long-lived
// Telegram session and run at most two at a time.
func (s *Service) StartDownload(
	chatID, chatTitle string,
	messageIDs []int,
	proxy, ntp, dir, fileNameTemplate string,
	options DownloadOptions,
) ([]string, error) {
	if len(messageIDs) == 0 {
		return nil, fmt.Errorf("no messages selected")
	}
	dir = strings.TrimSpace(dir)
	if dir == "" {
		return nil, fmt.Errorf("download folder is empty")
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, fmt.Errorf("create download folder: %w", err)
	}
	options = normalizeDownloadOptions(options)
	threads := options.Threads
	if strings.TrimSpace(fileNameTemplate) == "" {
		fileNameTemplate = "{{ .DialogID }}_{{ .MessageID }}_{{ filenamify .FileName }}"
	}

	// Fail before creating tasks when the session/proxy cannot connect.
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	_, err := s.ensureSession(ctx, proxy, ntp)
	cancel()
	if err != nil {
		return nil, err
	}

	var (
		ids    []string
		start  []*downloadTask
		queued []DownloadEvent
	)
	seen := make(map[int]struct{}, len(messageIDs))

	s.downloadMu.Lock()
	if s.downloadTasks == nil {
		s.downloadTasks = make(map[string]*downloadTask)
	}
	if s.downloadSem == nil || cap(s.downloadSem) != options.Limit {
		// tdl's --limit is the number of concurrently transferring items. A new
		// limit applies to tasks that start from now on; already running tasks
		// keep the channel they acquired.
		s.downloadSem = make(chan struct{}, options.Limit)
	}
	for _, messageID := range messageIDs {
		if messageID <= 0 {
			continue
		}
		if _, duplicate := seen[messageID]; duplicate {
			continue
		}
		seen[messageID] = struct{}{}
		// Never run two downloads of the same message: a second click would
		// otherwise open (and later rename) the same .tmp concurrently.
		if existing := s.findDownloadTaskLocked(chatID, messageID); existing != nil {
			switch existing.dto.Status {
			case downloadActive, downloadQueued, downloadPaused:
				ids = append(ids, existing.dto.ID)
				continue
			}
		}
		s.downloadCounter++
		id := fmt.Sprintf("dl-%d", s.downloadCounter)
		task := &downloadTask{
			dto: DownloadTaskDTO{
				ID:        id,
				Name:      fmt.Sprintf("Message %d", messageID),
				Chat:      chatTitle,
				ChatID:    chatID,
				MessageID: messageID,
				Status:    downloadQueued,
				Color:     "#f0a04b",
			},
			chatID:     chatID,
			messageID:  messageID,
			proxy:      proxy,
			ntp:        ntp,
			dir:        dir,
			template:   fileNameTemplate,
			threads:    threads,
			poolSize:   options.Pool,
			limit:      options.Limit,
			skipSame:   options.SkipSame,
			rewriteExt: options.RewriteExt,
			takeout:    options.Takeout,
			reconnect:  time.Duration(options.ReconnectSeconds) * time.Second,
			created:    time.Now().Unix(),
		}
		s.downloadTasks[id] = task
		s.downloadOrder = append(s.downloadOrder, id)
		ids = append(ids, id)
		queued = append(queued, DownloadEvent{Task: cloneTask(task.dto)})
	}
	s.downloadMu.Unlock()

	for _, event := range queued {
		s.emitDownload(event)
	}

	s.downloadMu.Lock()
	for _, id := range ids {
		task := s.downloadTasks[id]
		if task == nil {
			continue
		}
		ctx, cancel := context.WithCancel(context.Background())
		task.ctx = ctx
		task.cancel = cancel
		task.generation++
		task.done = make(chan struct{})
		start = append(start, task)
	}
	s.persistDownloadsLocked(true)
	s.downloadMu.Unlock()

	for _, task := range start {
		go s.runDownload(task, task.ctx, task.generation, task.done)
	}
	return ids, nil
}

// findDownloadTaskLocked returns the live task for a peer message, if any.
// The caller must hold s.downloadMu.
func (s *Service) findDownloadTaskLocked(chatID string, messageID int) *downloadTask {
	for _, task := range s.downloadTasks {
		if task.chatID == chatID && task.messageID == messageID {
			return task
		}
	}
	return nil
}

func (s *Service) GetDownloads() []DownloadTaskDTO {
	s.downloadMu.Lock()
	defer s.downloadMu.Unlock()

	// A completed task is only a cache of where the file was delivered. If the
	// file disappeared (deleted in Explorer, drive removed, ...), forget the
	// record like Telegram Desktop forgets a downloaded path: the message
	// button goes back to "download" and no stale "completed" row is kept.
	changed := false
	for _, id := range append([]string(nil), s.downloadOrder...) {
		task := s.downloadTasks[id]
		if task == nil || task.dto.Status != downloadDone || task.dto.Path == "" {
			continue
		}
		if _, err := os.Stat(task.dto.Path); err != nil {
			delete(s.downloadTasks, id)
			changed = true
		}
	}
	if changed {
		order := make([]string, 0, len(s.downloadTasks))
		for _, id := range s.downloadOrder {
			if _, ok := s.downloadTasks[id]; ok {
				order = append(order, id)
			}
		}
		s.downloadOrder = order
		s.persistDownloadsLocked(true)
	}

	result := make([]DownloadTaskDTO, 0, len(s.downloadOrder))
	for _, id := range s.downloadOrder {
		if task := s.downloadTasks[id]; task != nil {
			result = append(result, task.dto)
		}
	}
	return result
}

// ValidateDownload re-checks a delivered task against the filesystem. It is
// called when the user clicks a downloaded badge: false means the file was
// removed and the caller should start a fresh transfer. A missing file drops
// the stale done task, matching Telegram Desktop's downloaded-path behaviour.
func (s *Service) ValidateDownload(id string) (bool, error) {
	s.downloadMu.Lock()
	task := s.downloadTasks[id]
	if task == nil {
		s.downloadMu.Unlock()
		return false, nil
	}
	path := task.dto.Path
	if task.dto.Status != downloadDone || path == "" {
		s.downloadMu.Unlock()
		return false, nil
	}
	if _, err := os.Stat(path); err == nil {
		s.downloadMu.Unlock()
		return true, nil
	}
	delete(s.downloadTasks, id)
	for index, orderID := range s.downloadOrder {
		if orderID == id {
			s.downloadOrder = append(s.downloadOrder[:index], s.downloadOrder[index+1:]...)
			break
		}
	}
	s.persistDownloadsLocked(true)
	s.downloadMu.Unlock()
	s.emitDownload(DownloadEvent{Removed: true})
	return false, nil
}

func (s *Service) PauseDownload(id string) error {
	s.downloadMu.Lock()
	task := s.downloadTasks[id]
	if task == nil {
		s.downloadMu.Unlock()
		return fmt.Errorf("task not found")
	}
	if task.dto.Status == downloadDone || task.dto.Status == downloadPaused {
		s.downloadMu.Unlock()
		return nil
	}
	task.dto.Status = downloadPaused
	task.dto.Speed = ""
	task.dto.ETA = ""
	cancel := task.cancel
	done := task.done
	event := DownloadEvent{Task: cloneTask(task.dto)}
	s.persistDownloadsLocked(true)
	s.downloadMu.Unlock()

	if cancel != nil {
		cancel()
	}
	s.emitDownload(event)
	if done != nil {
		select {
		case <-done:
		case <-time.After(2 * time.Second):
		}
	}
	return nil
}

func (s *Service) ResumeDownload(id, proxy, ntp string) error {
	s.downloadMu.Lock()
	task := s.downloadTasks[id]
	if task == nil {
		s.downloadMu.Unlock()
		return fmt.Errorf("task not found")
	}
	if task.dto.Status == downloadActive || task.dto.Status == downloadQueued {
		s.downloadMu.Unlock()
		return nil
	}
	task.proxy = proxy
	task.ntp = ntp
	ctx, cancel := context.WithCancel(context.Background())
	task.ctx = ctx
	task.cancel = cancel
	task.generation++
	task.done = make(chan struct{})
	task.dto.Status = downloadQueued
	task.dto.Error = ""
	task.dto.Speed = ""
	task.dto.ETA = ""
	generation := task.generation
	done := task.done
	event := DownloadEvent{Task: cloneTask(task.dto)}
	s.persistDownloadsLocked(true)
	s.downloadMu.Unlock()

	s.emitDownload(event)
	go s.runDownload(task, ctx, generation, done)
	return nil
}

func (s *Service) CancelDownload(id string) error {
	s.downloadMu.Lock()
	task := s.downloadTasks[id]
	if task == nil {
		s.downloadMu.Unlock()
		return nil
	}
	cancel := task.cancel
	done := task.done
	tempPath := task.tempPath
	if tempPath == "" && task.dto.Path != "" {
		tempPath = task.dto.Path + downloadTempExt
	}
	if cancel != nil {
		task.cancel()
	}
	delete(s.downloadTasks, id)
	next := s.downloadOrder[:0]
	for _, item := range s.downloadOrder {
		if item != id {
			next = append(next, item)
		}
	}
	s.downloadOrder = next
	s.persistDownloadsLocked(true)
	s.downloadMu.Unlock()

	s.emitDownload(DownloadEvent{Removed: true, Task: &DownloadTaskDTO{ID: id}})

	// The download goroutine may still be closing its file. Wait for it before
	// deleting the partial file, otherwise a removed task leaves an orphan that
	// a later download of the same message would wrongly resume from.
	if tempPath != "" {
		if done != nil {
			select {
			case <-done:
			case <-time.After(5 * time.Second):
			}
		}
		_ = os.Remove(tempPath)
	}
	return nil
}

func (s *Service) ClearCompletedDownloads() error {
	return s.clearDownloadsByStatus(downloadDone)
}

func (s *Service) ClearFailedDownloads() error {
	return s.clearDownloadsByStatus(downloadFailed)
}

func (s *Service) clearDownloadsByStatus(status string) error {
	s.downloadMu.Lock()
	next := s.downloadOrder[:0]
	for _, id := range s.downloadOrder {
		task := s.downloadTasks[id]
		if task == nil || task.dto.Status != status {
			next = append(next, id)
		} else {
			delete(s.downloadTasks, id)
		}
	}
	s.downloadOrder = next
	s.persistDownloadsLocked(true)
	s.downloadMu.Unlock()
	return nil
}

func (s *Service) OpenDownloadFolder(path string) error {
	path = strings.TrimSpace(path)
	if path == "" {
		return fmt.Errorf("empty download path")
	}
	if info, err := os.Stat(path); err == nil && !info.IsDir() {
		path = filepath.Dir(path)
	}
	return exec.Command("explorer.exe", path).Start()
}

func (s *Service) cancelAllDownloads() {
	s.downloadMu.Lock()
	var (
		temps []string
		dones []chan struct{}
	)
	for _, task := range s.downloadTasks {
		if task.cancel != nil {
			task.cancel()
		}
		if task.done != nil {
			dones = append(dones, task.done)
		}
		temp := task.tempPath
		if temp == "" && task.dto.Path != "" {
			temp = task.dto.Path + downloadTempExt
		}
		if temp != "" {
			temps = append(temps, temp)
		}
	}
	s.downloadTasks = make(map[string]*downloadTask)
	s.downloadOrder = nil
	s.persistDownloadsLocked(true)
	s.downloadMu.Unlock()

	if len(temps) > 0 {
		go func() {
			deadline := time.After(3 * time.Second)
			for _, done := range dones {
				select {
				case <-done:
				case <-deadline:
				}
			}
			for _, temp := range temps {
				_ = os.Remove(temp)
			}
		}()
	}
}

func (s *Service) runDownload(task *downloadTask, ctx context.Context, generation int, done chan struct{}) {
	defer close(done)

	s.downloadMu.Lock()
	sem := s.downloadSem
	s.downloadMu.Unlock()
	if sem == nil {
		sem = make(chan struct{}, normalizeDownloadOptions(DownloadOptions{}).Limit)
	}
	select {
	case sem <- struct{}{}:
	case <-ctx.Done():
		return
	}
	defer func() { <-sem }()

	if !s.activateTask(task.dto.ID, generation) {
		return
	}

	client, err := s.ensureSession(ctx, task.proxy, task.ntp)
	if err != nil {
		s.failDownload(task.dto.ID, generation, err)
		return
	}
	peer, err := parsePeerID(task.chatID)
	if err != nil {
		s.failDownload(task.dto.ID, generation, err)
		return
	}
	msg, err := tutil.GetSingleMessage(ctx, client.API(), peer, task.messageID)
	if err != nil {
		s.failDownload(task.dto.ID, generation, err)
		return
	}
	media, ok := tmedia.GetMedia(msg)
	if !ok {
		s.failDownload(task.dto.ID, generation, fmt.Errorf("message has no downloadable media"))
		return
	}
	mediaKind := messageMediaKind(msg)
	task.mediaKind = mediaKind
	task.dto.MediaKind = mediaKind

	finalPath := task.dto.Path
	freshPath := finalPath == ""
	if freshPath {
		finalPath, err = taskPath(task, media, msg, mediaKind)
		if err != nil {
			s.failDownload(task.dto.ID, generation, err)
			return
		}
	}
	// tdl's --skip-same: a same-named file with the exact media size already on
	// disk is delivered as-is instead of downloaded again.
	if task.skipSame {
		if info, statErr := os.Stat(finalPath); statErr == nil && info.Size() == media.Size {
			s.completeDownload(task, generation, finalPath, media.Size, mediaKind, true)
			return
		}
	}
	// Telegram Desktop never overwrites an unrelated file that happens to sit at
	// the rendered name; a fresh task gets "name (2).ext" instead.
	if freshPath {
		if _, statErr := os.Stat(finalPath); statErr == nil {
			finalPath = uniqueDownloadPath(finalPath)
		}
	}
	if err := os.MkdirAll(filepath.Dir(finalPath), 0o755); err != nil {
		s.failDownload(task.dto.ID, generation, fmt.Errorf("create download folder: %w", err))
		return
	}
	// Only a task that already owns a partial file may resume from it. A fresh
	// task (and any task whose store entry was removed) must start from zero so
	// an orphaned .tmp from a removed download can never be stitched into the
	// new file.
	resumeTemp := task.tempPath
	tempPath := resumeTemp
	if tempPath == "" {
		tempPath = finalPath + downloadTempExt
	}
	defer func() {
		s.downloadMu.Lock()
		_, stillListed := s.downloadTasks[task.dto.ID]
		s.downloadMu.Unlock()
		if !stillListed {
			_ = os.Remove(tempPath)
		}
	}()

	startSize := int64(0)
	if resumeTemp != "" {
		if info, statErr := os.Stat(resumeTemp); statErr == nil {
			startSize = info.Size()
			if startSize > media.Size {
				startSize = 0
			}
			// Resume on a 4 KiB boundary so Telegram accepts the offset.
			const align = int64(4096)
			startSize = startSize / align * align
			if startSize > 0 {
				if err := os.Truncate(tempPath, startSize); err != nil {
					s.failDownload(task.dto.ID, generation, fmt.Errorf("resume file: %w", err))
					return
				}
			}
		}
	}
	if startSize == 0 {
		// Drop any stale partial before opening; O_TRUNC alone would keep a
		// same-named orphan around if opening or writing fails.
		_ = os.Remove(tempPath)
	}
	flags := os.O_CREATE | os.O_WRONLY
	if startSize == 0 {
		flags |= os.O_TRUNC
	}
	file, err := os.OpenFile(tempPath, flags, 0o644)
	if err != nil {
		s.failDownload(task.dto.ID, generation, fmt.Errorf("create file: %w", err))
		return
	}

	name := filepath.Base(finalPath)
	ext := strings.ToUpper(strings.TrimPrefix(filepath.Ext(name), "."))
	progress := int64(0)
	if media.Size > 0 {
		progress = startSize * 100 / media.Size
	}
	if !s.prepareDownloadTask(task, generation, finalPath, tempPath, media.Size, startSize, name, ext, int(progress)) {
		_ = file.Close()
		return
	}

	// Match tdl's own download defaults (pool 8, threads 4+): fresh files use
	// tdl's multi-connection downloader and resumed ranges use the same pool.
	pool := dcpool.NewPool(client, int64(task.poolSize), coretclient.NewDefaultMiddlewares(ctx, task.reconnect)...)
	taskProgress := &downloadProgress{
		service:    s,
		id:         task.dto.ID,
		generation: generation,
		lastTime:   time.Now(),
		last:       startSize,
		total:      media.Size,
	}

	var downloadErr error
	if startSize > 0 {
		downloadErr = s.downloadRange(ctx, pool, media, file, startSize, taskProgress, task.threads, task.takeout)
		if errors.Is(downloadErr, errCDNRedirect) {
			// CDN files cannot be fetched with the simple range call. Fall
			// back to gotd's full downloader and restart this file.
			if truncateErr := file.Truncate(0); truncateErr != nil {
				downloadErr = truncateErr
			} else {
				_ = s.updateTask(task.dto.ID, generation, func(dto *DownloadTaskDTO) {
					dto.Progress = 0
					dto.Speed = ""
					dto.ETA = ""
				})
				taskProgress.Reset()
				downloadErr = s.downloadFresh(ctx, pool, media, file, task, taskProgress)
			}
		}
	} else {
		downloadErr = s.downloadFresh(ctx, pool, media, file, task, taskProgress)
	}
	_ = file.Close()
	_ = pool.Close()

	if downloadErr == nil && taskProgress.Err() != nil {
		downloadErr = taskProgress.Err()
	}
	if downloadErr != nil {
		if ctx.Err() != nil {
			s.downloadMu.Lock()
			current := s.downloadTasks[task.dto.ID]
			paused := current != nil && current.generation == generation && current.dto.Status == downloadPaused
			s.downloadMu.Unlock()
			if paused {
				return
			}
		}
		s.failDownload(task.dto.ID, generation, downloadErr)
		return
	}

	// A resumed or multi-threaded write must have produced exactly the media
	// size before the file is delivered; otherwise leave it as a failed task
	// instead of renaming a short/corrupt file into place.
	if info, statErr := os.Stat(tempPath); statErr != nil || (media.Size > 0 && info.Size() != media.Size) {
		actual := int64(-1)
		if info != nil {
			actual = info.Size()
		}
		s.failDownload(task.dto.ID, generation, fmt.Errorf("downloaded file has wrong size (%d/%d)", actual, media.Size))
		return
	}

	if err := os.Rename(tempPath, finalPath); err != nil {
		s.failDownload(task.dto.ID, generation, fmt.Errorf("rename download: %w", err))
		return
	}
	if task.rewriteExt {
		finalPath = rewriteFileExtension(finalPath)
		if media.Date > 0 {
			_ = os.Chtimes(finalPath, time.Now(), time.Unix(media.Date, 0))
		}
	}

	s.completeDownload(task, generation, finalPath, media.Size, mediaKind, false)
}

// completeDownload marks a task delivered. skipped is true for --skip-same,
// where the already-present file is adopted without a transfer.
func (s *Service) completeDownload(
	task *downloadTask,
	generation int,
	finalPath string,
	size int64,
	mediaKind string,
	skipped bool,
) {
	s.downloadMu.Lock()
	current := s.downloadTasks[task.dto.ID]
	if current == nil || current.generation != generation {
		s.downloadMu.Unlock()
		return
	}
	current.dto.Status = downloadDone
	current.dto.Progress = 100
	current.dto.Speed = ""
	current.dto.ETA = ""
	current.dto.Size = humanSize(size)
	current.dto.Path = finalPath
	current.dto.MediaKind = mediaKind
	if skipped {
		current.dto.Error = ""
	}
	current.tempPath = ""
	current.total = size
	current.downloaded = size
	s.persistDownloadsLocked(true)
	event := DownloadEvent{Task: cloneTask(current.dto)}
	s.downloadMu.Unlock()
	s.emitDownload(event)
}

func (s *Service) prepareDownloadTask(
	task *downloadTask,
	generation int,
	finalPath, tempPath string,
	total, downloaded int64,
	name, ext string,
	progress int,
) bool {
	s.downloadMu.Lock()
	current := s.downloadTasks[task.dto.ID]
	if current == nil || current.generation != generation || current.dto.Status == downloadPaused {
		s.downloadMu.Unlock()
		return false
	}
	current.tempPath = tempPath
	current.total = total
	current.downloaded = downloaded
	current.dto.Name = name
	current.dto.Size = humanSize(total)
	current.dto.Ext = ext
	current.dto.Color = downloadColor(name)
	current.dto.Path = finalPath
	current.dto.Progress = progress
	current.dto.Error = ""
	s.persistDownloadsLocked(true)
	event := DownloadEvent{Task: cloneTask(current.dto)}
	s.downloadMu.Unlock()
	s.emitDownload(event)
	return true
}

func (s *Service) downloadFresh(
	ctx context.Context,
	pool dcpool.Pool,
	media *tmedia.Media,
	file *os.File,
	task *downloadTask,
	progress *downloadProgress,
) error {
	element := &downloadElement{media: media, to: file, takeout: task.takeout}
	dl := downloader.New(downloader.Options{
		Pool:     pool,
		Threads:  task.threads,
		Iter:     &singleIter{elem: element},
		Progress: progress,
	})
	err := dl.Download(ctx, 1)
	if err == nil && progress.Err() != nil {
		err = progress.Err()
	}
	return err
}

var errCDNRedirect = errors.New("CDN download requires full transfer")

// downloadRange downloads the missing tail of a paused file with the same
// multi-connection strategy as the tdl downloader: several workers pull
// independent 1 MiB ranges through tdl's DC pool and write them with WriteAt.
// The previous sequential loop was the only place downloads stopped using the
// tdl core, and it made every resumed file single-connection slow.
func (s *Service) downloadRange(
	ctx context.Context,
	pool dcpool.Pool,
	media *tmedia.Media,
	file *os.File,
	start int64,
	progress *downloadProgress,
	threads int,
	takeout bool,
) error {
	const partSize = int64(1024 * 1024)
	const maxThreads = 16
	if threads < 1 {
		threads = 4
	}
	if threads > maxThreads {
		threads = maxThreads
	}
	if start >= media.Size {
		return nil
	}

	var next atomic.Int64
	next.Store(start)
	var downloaded atomic.Int64

	group, groupCtx := errgroup.WithContext(ctx)
	for worker := 0; worker < threads; worker++ {
		group.Go(func() error {
			client := pool.Client(groupCtx, media.DC)
			if takeout {
				client = pool.Takeout(groupCtx, media.DC)
			}
			for {
				offset := next.Add(partSize) - partSize
				if offset >= media.Size {
					return nil
				}
				remaining := media.Size - offset
				// Always request a 4 KiB-aligned part; the server returns a short
				// chunk at EOF, which is trimmed below.
				result, err := client.UploadGetFile(groupCtx, &tg.UploadGetFileRequest{
					Location: media.InputFileLoc,
					Offset:   offset,
					Limit:    int(partSize),
					Precise:  true,
				})
				if err != nil {
					return fmt.Errorf("resume download: %w", err)
				}
				data, err := uploadFileData(result, remaining)
				if err != nil {
					return err
				}
				if _, err := file.WriteAt(data, offset); err != nil {
					return fmt.Errorf("write resumed file: %w", err)
				}
				progress.Report(start+downloaded.Add(int64(len(data))), media.Size)
			}
		})
	}
	return group.Wait()
}

// uploadFileData extracts the bytes of an upload.getFile answer and trims the
// last part to the bytes that are actually still missing.
func uploadFileData(result tg.UploadFileClass, remaining int64) ([]byte, error) {
	switch value := result.(type) {
	case *tg.UploadFile:
		data := value.Bytes
		if len(data) == 0 {
			return nil, fmt.Errorf("resume download returned no data")
		}
		if int64(len(data)) > remaining {
			data = data[:remaining]
		}
		return data, nil
	case *tg.UploadFileCDNRedirect:
		return nil, errCDNRedirect
	default:
		return nil, fmt.Errorf("unexpected upload.getFile result %T", result)
	}
}

func (s *Service) activateTask(id string, generation int) bool {
	s.downloadMu.Lock()
	task := s.downloadTasks[id]
	if task == nil || task.generation != generation || task.dto.Status == downloadPaused {
		s.downloadMu.Unlock()
		return false
	}
	task.dto.Status = downloadActive
	event := DownloadEvent{Task: cloneTask(task.dto)}
	s.persistDownloadsLocked(true)
	s.downloadMu.Unlock()
	s.emitDownload(event)
	return true
}

func (s *Service) updateTask(id string, generation int, fn func(*DownloadTaskDTO)) bool {
	s.downloadMu.Lock()
	task := s.downloadTasks[id]
	if task == nil || task.generation != generation {
		s.downloadMu.Unlock()
		return false
	}
	fn(&task.dto)
	s.persistDownloadsLocked(false)
	event := DownloadEvent{Task: cloneTask(task.dto)}
	s.downloadMu.Unlock()
	s.emitDownload(event)
	return true
}

func (s *Service) failDownload(id string, generation int, err error) {
	s.downloadMu.Lock()
	task := s.downloadTasks[id]
	if task == nil || task.generation != generation {
		s.downloadMu.Unlock()
		return
	}
	if task.dto.Status == downloadPaused {
		s.downloadMu.Unlock()
		return
	}
	task.dto.Status = downloadFailed
	task.dto.Speed = ""
	task.dto.ETA = ""
	task.dto.Error = err.Error()
	s.persistDownloadsLocked(true)
	event := DownloadEvent{Task: cloneTask(task.dto)}
	s.downloadMu.Unlock()
	s.emitDownload(event)
}

func cloneTask(task DownloadTaskDTO) *DownloadTaskDTO {
	copy := task
	return &copy
}

type downloadElement struct {
	media   *tmedia.Media
	to      io.WriterAt
	takeout bool
}

func (d *downloadElement) File() downloader.File { return d }
func (d *downloadElement) To() io.WriterAt       { return d.to }
func (d *downloadElement) AsTakeout() bool       { return d.takeout }
func (d *downloadElement) Location() tg.InputFileLocationClass {
	return d.media.InputFileLoc
}
func (d *downloadElement) Size() int64 { return d.media.Size }
func (d *downloadElement) DC() int     { return d.media.DC }

type singleIter struct {
	elem downloader.Elem
	done bool
	err  error
}

func (i *singleIter) Next(context.Context) bool {
	if i.done {
		return false
	}
	i.done = true
	return true
}
func (i *singleIter) Value() downloader.Elem { return i.elem }
func (i *singleIter) Err() error             { return i.err }

type downloadProgress struct {
	service    *Service
	id         string
	generation int

	mu       sync.Mutex
	doneErr  error
	lastTime time.Time
	last     int64
	total    int64
}

func (p *downloadProgress) OnAdd(elem downloader.Elem) {
	p.total = elem.File().Size()
	_ = p.service.updateTask(p.id, p.generation, func(dto *DownloadTaskDTO) {
		dto.Size = humanSize(p.total)
	})
}

func (p *downloadProgress) OnDownload(_ downloader.Elem, state downloader.ProgressState) {
	p.Report(state.Downloaded, state.Total)
}

func (p *downloadProgress) Report(downloaded, total int64) {
	now := time.Now()
	p.mu.Lock()
	elapsed := now.Sub(p.lastTime).Seconds()
	delta := downloaded - p.last
	speed := 0.0
	if elapsed > 0 {
		speed = float64(delta) / elapsed
	}
	if elapsed < 0.2 && downloaded < total {
		p.mu.Unlock()
		return
	}
	p.last = downloaded
	p.lastTime = now
	p.mu.Unlock()

	progress := 0
	if total > 0 {
		progress = int(downloaded * 100 / total)
		if progress > 100 {
			progress = 100
		}
	}
	speedText := ""
	etaText := ""
	if speed > 0 {
		speedText = humanSize(int64(speed)) + "/s"
		if total > downloaded {
			seconds := int(float64(total-downloaded) / speed)
			etaText = formatETA(seconds)
		}
	}
	_ = p.service.updateTask(p.id, p.generation, func(dto *DownloadTaskDTO) {
		dto.Progress = progress
		dto.Speed = speedText
		dto.ETA = etaText
		dto.Size = humanSize(total)
	})
}

func (p *downloadProgress) Reset() {
	p.mu.Lock()
	p.last = 0
	p.lastTime = time.Now()
	p.mu.Unlock()
}

func (p *downloadProgress) OnDone(_ downloader.Elem, err error) {
	p.mu.Lock()
	p.doneErr = err
	p.mu.Unlock()
}

func (p *downloadProgress) Err() error {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.doneErr
}

type downloadTemplateData struct {
	DialogID     int64
	MessageID    int
	MessageDate  int64
	FileName     string
	FileCaption  string
	FileSize     string
	DownloadDate int64
}

func taskPath(task *downloadTask, media *tmedia.Media, msg *tg.Message, mediaKind string) (string, error) {
	id, err := peerRawID(task.chatID)
	if err != nil {
		return "", err
	}
	tpl, err := template.New("filename").Funcs(tplfunc.FuncMap(tplfunc.All...)).Parse(task.template)
	if err != nil {
		return "", fmt.Errorf("parse file template: %w", err)
	}

	var rendered strings.Builder
	err = tpl.Execute(&rendered, &downloadTemplateData{
		DialogID:     id,
		MessageID:    msg.ID,
		MessageDate:  int64(msg.Date),
		FileName:     media.Name,
		FileCaption:  msg.Message,
		FileSize:     humanSize(media.Size),
		DownloadDate: time.Now().Unix(),
	})
	if err != nil {
		return "", fmt.Errorf("render file template: %w", err)
	}

	name := strings.TrimSpace(rendered.String())
	if name == "" {
		name = fmt.Sprintf("%d_%d_%s", id, msg.ID, media.Name)
	}
	name = filepath.Clean(name)
	if filepath.IsAbs(name) || name == "." || strings.HasPrefix(name, "..") {
		name = fmt.Sprintf("%d_%d_%s", id, msg.ID, media.Name)
	}

	targetDir := filepath.Join(task.dir, downloadCategoryFolder(mediaKind))
	finalPath := filepath.Join(targetDir, name)
	rel, err := filepath.Rel(task.dir, finalPath)
	if err != nil || strings.HasPrefix(rel, "..") {
		return "", fmt.Errorf("invalid download path")
	}
	return finalPath, nil
}

// downloadCategoryFolder groups downloads the way Telegram mobile does
// (Images/Video/Audio/Documents) while keeping filesystem names stable and
// language-neutral for every UI language.
func downloadCategoryFolder(kind string) string {
	switch kind {
	case "photo":
		return "Images"
	case "video", "video_note":
		return "Videos"
	case "animation":
		return "GIFs"
	case "audio":
		return "Audio"
	case "voice":
		return "Voice"
	case "sticker":
		return "Stickers"
	default:
		return "Files"
	}
}

func messageMediaKind(msg tg.MessageClass) string {
	if message, ok := msg.(*tg.Message); ok {
		if media := mapMedia(message.Media); media != nil {
			return media.Kind
		}
	}
	return ""
}

// uniqueDownloadPath returns "name (2).ext", "name (3).ext", ... like Telegram
// Desktop when a different file already occupies the rendered destination.
func uniqueDownloadPath(path string) string {
	ext := filepath.Ext(path)
	base := strings.TrimSuffix(path, ext)
	for index := 2; index < 1000; index++ {
		candidate := fmt.Sprintf("%s (%d)%s", base, index, ext)
		if _, err := os.Stat(candidate); os.IsNotExist(err) {
			return candidate
		}
	}
	return fmt.Sprintf("%s (%d)%s", base, time.Now().UnixNano(), ext)
}

// rewriteFileExtension mirrors tdl's --rewrite-ext: sniff the delivered file's
// header and rename it when the extension does not match the MIME type.
func rewriteFileExtension(path string) string {
	file, err := os.Open(path)
	if err != nil {
		return path
	}
	header := make([]byte, 512)
	n, _ := file.Read(header)
	_ = file.Close()
	if n == 0 {
		return path
	}
	ext := extensionForMIME(http.DetectContentType(header[:n]))
	if ext == "" || strings.EqualFold(filepath.Ext(path), ext) {
		return path
	}
	target := strings.TrimSuffix(path, filepath.Ext(path)) + ext
	if _, err := os.Stat(target); err == nil {
		return path
	}
	if err := os.Rename(path, target); err != nil {
		return path
	}
	return target
}

func extensionForMIME(mime string) string {
	switch strings.ToLower(strings.TrimSpace(strings.Split(mime, ";")[0])) {
	case "image/jpeg":
		return ".jpg"
	case "image/png":
		return ".png"
	case "image/gif":
		return ".gif"
	case "image/webp":
		return ".webp"
	case "video/mp4":
		return ".mp4"
	case "video/webm":
		return ".webm"
	case "video/quicktime":
		return ".mov"
	case "audio/mpeg":
		return ".mp3"
	case "audio/ogg":
		return ".ogg"
	case "audio/mp4":
		return ".m4a"
	case "application/pdf":
		return ".pdf"
	case "application/zip":
		return ".zip"
	default:
		return ""
	}
}

func peerRawID(chatID string) (int64, error) {
	parts := strings.Split(chatID, ":")
	if len(parts) != 3 {
		return 0, fmt.Errorf("invalid chat id")
	}
	return strconv.ParseInt(parts[1], 10, 64)
}

func downloadColor(name string) string {
	switch strings.ToLower(filepath.Ext(name)) {
	case ".jpg", ".jpeg", ".png", ".webp", ".gif":
		return "#65aadd"
	case ".mp4", ".mov", ".mkv", ".webm":
		return "#e05a8a"
	case ".mp3", ".ogg", ".m4a", ".wav", ".flac":
		return "#7bc862"
	default:
		return "#f0a04b"
	}
}

func formatETA(seconds int) string {
	if seconds < 0 {
		return ""
	}
	if seconds < 60 {
		return fmt.Sprintf("00:%02d", seconds)
	}
	minutes := seconds / 60
	seconds %= 60
	if minutes < 60 {
		return fmt.Sprintf("%02d:%02d", minutes, seconds)
	}
	hours := minutes / 60
	minutes %= 60
	return fmt.Sprintf("%d:%02d:%02d", hours, minutes, seconds)
}
