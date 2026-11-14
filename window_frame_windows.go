//go:build windows

package main

import (
	"syscall"
	"unsafe"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// WebView2 can leave its first opaque composition surface un-clipped by the
// Windows 11 DWM rounded window frame: until something invalidates the window
// (a resize, or a screen-capture tool touching the desktop) the four square
// surface corners remain visible around the rounded frame. Re-applying the
// rounded corner preference and forcing one frame recalculation after the
// window is shown reproduces the invalidation that makes the artifact go away.
const (
	dwmwaWindowCornerPreference = 33
	dwmwcpRound                 = 2

	swpNoSize       = 0x0001
	swpNoMove       = 0x0002
	swpNoZOrder     = 0x0004
	swpNoActivate   = 0x0010
	swpFrameChanged = 0x0020
	rdwInvalidate   = 0x0001
	rdwErase        = 0x0004
	rdwAllChildren  = 0x0080
	rdwUpdateNow    = 0x0100
	rdwFrame        = 0x0400
)

var (
	user32Frame = syscall.NewLazyDLL("user32.dll")
	dwmapiFrame = syscall.NewLazyDLL("dwmapi.dll")

	procSetWindowPos     = user32Frame.NewProc("SetWindowPos")
	procRedrawWindow     = user32Frame.NewProc("RedrawWindow")
	procDwmSetWindowAttr = dwmapiFrame.NewProc("DwmSetWindowAttribute")
	procDwmFlush         = dwmapiFrame.NewProc("DwmFlush")
)

// polishWindowFrame asks DWM to use rounded corners and invalidates the frame
// so WebView2 repaints its composition surface inside the rounded clip.
func polishWindowFrame(window *application.WebviewWindow) {
	if window == nil || window.NativeWindow() == nil {
		return
	}
	hwnd := uintptr(window.NativeWindow())

	preference := int32(dwmwcpRound)
	_, _, _ = procDwmSetWindowAttr.Call(
		hwnd,
		dwmwaWindowCornerPreference,
		uintptr(unsafe.Pointer(&preference)),
		unsafe.Sizeof(preference),
	)
	_, _, _ = procSetWindowPos.Call(
		hwnd,
		0,
		0, 0, 0, 0,
		swpNoMove|swpNoSize|swpNoZOrder|swpNoActivate|swpFrameChanged,
	)
	_, _, _ = procRedrawWindow.Call(
		hwnd,
		0,
		0,
		rdwInvalidate|rdwErase|rdwFrame|rdwAllChildren|rdwUpdateNow,
	)
	_, _, _ = procDwmFlush.Call()
}
