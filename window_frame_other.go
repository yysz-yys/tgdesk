//go:build !windows

package main

import "github.com/wailsapp/wails/v3/pkg/application"

// Frameless-window rounding is a Windows/DWM concern; other backends keep
// their native decoration behaviour.
func polishWindowFrame(_ *application.WebviewWindow) {}
