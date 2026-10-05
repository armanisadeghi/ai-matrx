/**
 * A status chip at far zoom must not depend on a store only the tile's own mount fills.
 * Task, meeting and workflow-run read their record from Redux; at overview nothing has
 * mounted, so they fall back to the tile's saved `basics` (BoardNode.basics) instead of
 * showing nothing. Live state, when present, still wins.
 */
jest.mock("@/lib/redux/hooks", () => ({
  // Nothing loaded: every selector reads "not in the store".
  useAppSelector: () => undefined,
}));
jest.mock("@/features/notes/redux/selectors", () => ({ selectNoteById: () => () => undefined }));
jest.mock("@/features/agent-context/redux/tasksSlice", () => ({ selectTaskById: () => undefined }));
jest.mock("@/features/files/redux/selectors", () => ({ selectFileById: () => undefined }));
jest.mock("@/features/meet/redux/meetingsSlice", () => ({ selectMeetingEntry: () => undefined }));

import { useMeetingStatus, useTaskStatus, useWorkflowRunStatus } from "../items/item-status";
import type { NodeSource } from "../board/document";

const src = (entity: string) => ({ kind: "entity", entity, id: "x1" }) as NodeSource;

describe("status from saved basics when the record is not in the store", () => {
  it("task: shows its saved status, nothing without basics", () => {
    expect(useTaskStatus(src("task"))).toBeNull();
    expect(useTaskStatus(src("task"), { active_task_status: "completed" })).toMatchObject({ tone: "success", label: "Done" });
  });
  it("task: an open task past its saved due date reads Overdue", () => {
    expect(
      useTaskStatus(src("task"), { active_task_status: "active", active_task_due_date: "2020-01-01T00:00:00Z" }),
    ).toMatchObject({ tone: "danger", label: "Overdue" });
  });
  it("meeting: live / scheduled / ended from the saved status", () => {
    expect(useMeetingStatus(src("meeting"))).toBeNull();
    expect(useMeetingStatus(src("meeting"), { meeting_status: "live" })).toMatchObject({ label: "Live" });
    expect(useMeetingStatus(src("meeting"), { meeting_status: "scheduled" })).toMatchObject({ label: "Scheduled" });
    expect(useMeetingStatus(src("meeting"), { meeting_status: "ended" })).toMatchObject({ label: "Ended" });
  });
  it("workflow run: the saved run status", () => {
    expect(useWorkflowRunStatus(src("workflow-run"))).toBeNull();
    expect(useWorkflowRunStatus(src("workflow-run"), { run_status: "running" })).toMatchObject({ tone: "active" });
    expect(useWorkflowRunStatus(src("workflow-run"), { run_status: "failed" })).toMatchObject({ tone: "danger" });
  });
});
