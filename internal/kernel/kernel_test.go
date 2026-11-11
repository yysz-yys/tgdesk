package kernel

import "testing"

func TestStatus(t *testing.T) {
	status := New("test-version").Status()

	if status.AppName != "tgdesk" {
		t.Fatalf("AppName = %q, want tgdesk", status.AppName)
	}
	if status.AppVersion != "test-version" {
		t.Fatalf("AppVersion = %q, want test-version", status.AppVersion)
	}
	if status.TDLAppID != 2040 {
		t.Fatalf("TDLAppID = %d, want 2040 (tdesktop app id)", status.TDLAppID)
	}
	if !status.Ready {
		t.Fatal("status should be ready")
	}
	if status.StartedAt == "" {
		t.Fatal("StartedAt should be set")
	}
	if status.TDLVersion == "" || status.TDLCoreVersion == "" {
		t.Fatal("tdl versions should be populated")
	}
}

func TestChecklist(t *testing.T) {
	items := New("test").Checklist()
	if len(items) != 6 {
		t.Fatalf("checklist length = %d, want 6", len(items))
	}

	seen := make(map[string]struct{}, len(items))
	for _, item := range items {
		if item.ID == "" || item.Title == "" || item.Detail == "" {
			t.Fatalf("checklist item has empty fields: %+v", item)
		}
		if _, ok := seen[item.ID]; ok {
			t.Fatalf("duplicate checklist id %q", item.ID)
		}
		seen[item.ID] = struct{}{}
	}

	if !items[0].Done || !items[1].Done {
		t.Fatal("the shell and tdl-import items should be marked done")
	}
}
