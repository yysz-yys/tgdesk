package app

import (
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
	return &Service{kernel: k}
}

func (s *Service) GetStatus() kernel.Status {
	return s.kernel.Status()
}

func (s *Service) GetPaths() kernel.PortablePaths {
	return s.kernel.Paths()
}

func (s *Service) RefreshUser(proxy, ntp string) (*kernel.AuthUser, error) {
	return s.kernel.RefreshUser(proxy, ntp)
}

func (s *Service) GetSpikeChecklist() []kernel.ChecklistItem {
	return s.kernel.Checklist()
}

func (s *Service) GetChats(proxy, ntp string, limit int) ([]kernel.ChatDTO, error) {
	return s.kernel.GetChats(proxy, ntp, limit)
}

func (s *Service) GetMessages(chatID, proxy, ntp string, limit int) ([]kernel.MessageDTO, error) {
	return s.kernel.GetMessages(chatID, proxy, ntp, limit)
}

func (s *Service) SendMessage(chatID, text, proxy, ntp string) error {
	return s.kernel.SendMessage(chatID, text, proxy, ntp)
}

func (s *Service) StartDownload(
	chatID, chatTitle string,
	messageIDs []int,
	proxy, ntp, dir, fileNameTemplate string,
	threads int,
) ([]string, error) {
	return s.kernel.StartDownload(chatID, chatTitle, messageIDs, proxy, ntp, dir, fileNameTemplate, threads)
}

func (s *Service) GetDownloads() []kernel.DownloadTaskDTO {
	return s.kernel.GetDownloads()
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

func (s *Service) SubmitPassword(password string) error {
	return s.kernel.SubmitPassword(password)
}

func (s *Service) CancelLogin() error {
	return s.kernel.CancelLogin()
}

func (s *Service) Logout() error {
	return s.kernel.Logout()
}
