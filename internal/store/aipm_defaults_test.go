package store

import (
	"context"
	"testing"
)

func TestCreateProject_SeedsChineseAIPMWorkflow(t *testing.T) {
	st, cleanup := newTestStore(t)
	defer cleanup()

	project, err := st.CreateProject(context.Background(), "aipm-defaults")
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}

	workflow, err := st.GetProjectWorkflow(context.Background(), project.ID)
	if err != nil {
		t.Fatalf("GetProjectWorkflow: %v", err)
	}

	wantKeys := []string{"backlog", "not_started", "doing", "testing", "done"}
	wantNames := []string{"需求池", "待澄清", "开发中", "联调测试", "已完成"}
	if len(workflow) != len(wantKeys) {
		t.Fatalf("expected %d workflow columns, got %d", len(wantKeys), len(workflow))
	}
	for i, column := range workflow {
		if column.Key != wantKeys[i] || column.Name != wantNames[i] || column.Position != i {
			t.Fatalf("column %d = key %q name %q position %d; want key %q name %q position %d", i, column.Key, column.Name, column.Position, wantKeys[i], wantNames[i], i)
		}
		if column.IsDone != (i == len(workflow)-1) {
			t.Fatalf("column %q done=%v; only the final column should be done", column.Key, column.IsDone)
		}
	}
}
