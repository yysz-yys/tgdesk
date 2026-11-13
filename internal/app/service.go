package app

import (
	"strings"

	"github.com/wailsapp/wails/v3/pkg/application"

	"tgdesk/internal/kernel"
)

// Service is the Wails-facing adapter. It only translates binding calls into
// kernel calls; Telegram, storage and task logic must stay out of this package.
type Service struct {
	kernel *kernel.Service
}

func New(k *kernel.Service) *Service {
	k.SetEventSink(func(event kernel.AuthEvent) {
		app := application.Get()
		if app == nil {
			return
		}
		app.Event.Emit("auth:event", event)
	})
	k.SetDownloadEventSink(func(event kernel.DownloadEvent) {
		app := application.Get()
		if app == nil {
			return
		}
		app.Event.Emit("download:event", event)
	})
	k.SetChatEventSink(func(event kernel.ChatEvent) {
		app := application.Get()
		if app == nil {
			return
		}
		app.Event.Emit("chat:event", event)
	})
	k.SetUploadEventSink(func(event kernel.UploadEvent) {
		app := application.Get()
		if app == nil {
			return
		}
		app.Event.Emit("upload:event", event)
	})
	return &Service{kernel: k}
}

func (s *Service) GetPaths() kernel.PortablePaths {
	return s.kernel.Paths()
}

func (s *Service) RefreshUser(proxy, ntp string) (*kernel.AuthUser, error) {
	return s.kernel.RefreshUser(proxy, ntp)
}

func (s *Service) GetChats(proxy, ntp string, limit int, force bool) ([]kernel.ChatDTO, error) {
	return s.kernel.GetChats(proxy, ntp, limit, force)
}

func (s *Service) GetArchivedChats(proxy, ntp string, limit int, force bool) ([]kernel.ChatDTO, error) {
	return s.kernel.GetArchivedChats(proxy, ntp, limit, force)
}

// GetCachedChats returns the last local dialog snapshot for instant paint.
func (s *Service) GetCachedChats() []kernel.ChatDTO {
	return s.kernel.GetCachedChats()
}

// GetCachedMessages returns the last local message snapshot for instant paint.
func (s *Service) GetCachedMessages(chatID string) []kernel.MessageDTO {
	return s.kernel.GetCachedMessages(chatID)
}

func (s *Service) GetFolders(proxy, ntp string) ([]kernel.ChatFolderDTO, error) {
	return s.kernel.GetFolders(proxy, ntp)
}

func (s *Service) SetChatArchived(
	chatID string,
	archived bool,
	proxy, ntp string,
) error {
	return s.kernel.SetChatArchived(chatID, archived, proxy, ntp)
}

func (s *Service) GetMessages(chatID, proxy, ntp string, limit int) ([]kernel.MessageDTO, error) {
	return s.kernel.GetMessages(chatID, proxy, ntp, limit)
}

func (s *Service) GetNewMessages(
	chatID string,
	afterID int,
	proxy, ntp string,
) ([]kernel.MessageDTO, error) {
	return s.kernel.GetNewMessages(chatID, afterID, proxy, ntp)
}

func (s *Service) GetChatMembers(
	chatID, proxy, ntp string,
	limit int,
) ([]kernel.ChatMemberDTO, error) {
	return s.kernel.GetChatMembers(chatID, proxy, ntp, limit)
}

// GetChatInfo resolves which chat-info tabs a peer has using the same
// messages.getSearchCounters call as Telegram Web.
func (s *Service) GetChatInfo(
	chatID, kind, proxy, ntp string,
) (*kernel.ChatInfoDTO, error) {
	return s.kernel.GetChatInfo(chatID, kind, proxy, ntp)
}

// GetSharedMedia loads one paginated page of a chat-info media tab.
func (s *Service) GetSharedMedia(
	chatID, section, proxy, ntp string,
	beforeID, limit int,
) (*kernel.SharedMediaPageDTO, error) {
	return s.kernel.GetSharedMedia(chatID, section, proxy, ntp, beforeID, limit)
}

// GetChatMembersPage loads one paginated page of a group's member list.
func (s *Service) GetChatMembersPage(
	chatID, proxy, ntp string,
	offset, limit int,
) (*kernel.ChatMembersPageDTO, error) {
	return s.kernel.GetChatMembersPage(chatID, proxy, ntp, offset, limit)
}

func (s *Service) GetOlderMessages(
	chatID string,
	beforeID int,
	proxy, ntp string,
	limit int,
) ([]kernel.MessageDTO, error) {
	return s.kernel.GetOlderMessages(chatID, beforeID, proxy, ntp, limit)
}

func (s *Service) SendMessage(chatID, text string, replyToID int, proxy, ntp string) error {
	return s.kernel.SendMessage(chatID, text, replyToID, proxy, ntp)
}

func (s *Service) EditMessage(chatID string, messageID int, text, proxy, ntp string) error {
	return s.kernel.EditMessage(chatID, messageID, text, proxy, ntp)
}

func (s *Service) DeleteMessages(
	chatID string,
	messageIDs []int,
	revoke bool,
	proxy, ntp string,
) error {
	return s.kernel.DeleteMessages(chatID, messageIDs, revoke, proxy, ntp)
}

func (s *Service) ForwardMessages(
	fromChatID, toChatID string,
	messageIDs []int,
	proxy, ntp string,
) error {
	return s.kernel.ForwardMessages(fromChatID, toChatID, messageIDs, proxy, ntp)
}

func (s *Service) SendReaction(chatID string, messageID int, emoji, customEmojiID, proxy, ntp string) error {
	return s.kernel.SendReaction(chatID, messageID, emoji, customEmojiID, proxy, ntp)
}

func (s *Service) MarkChatsRead(chatIDs []string, proxy, ntp string) error {
	return s.kernel.MarkChatsRead(chatIDs, proxy, ntp)
}

func (s *Service) SendAttachment(
	chatID, filePath, caption string,
	replyToID int,
	proxy, ntp string,
) error {
	return s.kernel.SendAttachment(chatID, filePath, caption, replyToID, proxy, ntp)
}

// ChooseFiles opens the native multi-file picker. An empty slice means the user
// cancelled; the caller keeps the composer state unchanged.
func (s *Service) ChooseFiles(title string) ([]string, error) {
	app := application.Get()
	if app == nil {
		return nil, nil
	}
	selected, err := app.Dialog.OpenFile().
		CanChooseFiles(true).
		CanChooseDirectories(false).
		SetTitle(title).
		PromptForMultipleSelection()
	if err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "cancel") {
			return nil, nil
		}
		return nil, err
	}
	return selected, nil
}

func (s *Service) StartDownload(
	chatID, chatTitle string,
	messageIDs []int,
	proxy, ntp, dir, fileNameTemplate string,
	options kernel.DownloadOptions,
) ([]string, error) {
	return s.kernel.StartDownload(chatID, chatTitle, messageIDs, proxy, ntp, dir, fileNameTemplate, options)
}

func (s *Service) GetSelfAvatarURL(proxy, ntp string) (string, error) {
	return s.kernel.GetSelfAvatarURL(proxy, ntp)
}

func (s *Service) GetMessageMedia(
	chatID string,
	messageID int,
	proxy, ntp string,
) (string, error) {
	return s.kernel.GetMessageMedia(chatID, messageID, proxy, ntp)
}

func (s *Service) GetVideoStream(
	chatID string,
	messageID int,
	proxy, ntp string,
	useTDL bool,
) (string, error) {
	return s.kernel.GetVideoStream(chatID, messageID, proxy, ntp, useTDL)
}

func (s *Service) GetDownloads() []kernel.DownloadTaskDTO {
	return s.kernel.GetDownloads()
}

func (s *Service) ValidateDownload(id string) (bool, error) {
	return s.kernel.ValidateDownload(id)
}

func (s *Service) PauseDownload(id string) error {
	return s.kernel.PauseDownload(id)
}

func (s *Service) ResumeDownload(id, proxy, ntp string) error {
	return s.kernel.ResumeDownload(id, proxy, ntp)
}

func (s *Service) CancelDownload(id string) error {
	return s.kernel.CancelDownload(id)
}

func (s *Service) ClearCompletedDownloads() error {
	return s.kernel.ClearCompletedDownloads()
}

func (s *Service) OpenDownloadFolder(path string) error {
	return s.kernel.OpenDownloadFolder(path)
}

// ChooseDownloadFolder opens the native directory picker and returns the
// selected path, or an empty string when the dialog is cancelled.
func (s *Service) ChooseDownloadFolder(currentDirectory, title string) (string, error) {
	app := application.Get()
	if app == nil {
		return "", nil
	}
	selected, err := app.Dialog.OpenFile().
		CanChooseFiles(false).
		CanChooseDirectories(true).
		CanCreateDirectories(true).
		SetTitle(title).
		SetDirectory(currentDirectory).
		PromptForSingleSelection()
	if err != nil {
		// The Wails folder dialog reports a cancellation as an error. It is not
		// a failure the user needs to see.
		if strings.Contains(strings.ToLower(err.Error()), "cancel") {
			return "", nil
		}
		return "", err
	}
	if selected == "" || selected == "." {
		return "", nil
	}
	return selected, nil
}

func (s *Service) GetAuthStatus() kernel.AuthStatus {
	return s.kernel.AuthStatus()
}

func (s *Service) StartQR(proxy, ntp string) error {
	return s.kernel.StartQR(proxy, ntp)
}

func (s *Service) StartPhone(phone, proxy, ntp string) error {
	return s.kernel.StartPhone(phone, proxy, ntp)
}

func (s *Service) SubmitCode(code string) error {
	return s.kernel.SubmitCode(code)
}

func (s *Service) ResendCode() error {
	return s.kernel.ResendCode()
}

func (s *Service) SubmitPassword(password string) error {
	return s.kernel.SubmitPassword(password)
}

func (s *Service) ExportTData() (*kernel.TDataExport, error) {
	return s.kernel.ExportTData()
}

func (s *Service) CancelLogin() error {
	return s.kernel.CancelLogin()
}

func (s *Service) Logout() error {
	return s.kernel.Logout()
}
