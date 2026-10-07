/**
 * An agent's approved task change (status, priority, due date…) is STAGED in the task, exactly as
 * the person's own change on the task page: it waits for Save. The tile's header must say so
 * ("Unsaved"), never keep showing the old saved status as if nothing happened.
 */
let fakeState: unknown = {};
jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: (select: (s: unknown) => unknown) => select(fakeState),
}));
jest.mock("@/features/notes/redux/selectors", () => ({ selectNoteById: () => () => undefined }));
jest.mock("@/features/agent-context/redux/tasksSlice", () => ({
  selectTaskById: (s: { task: unknown }) => s.task,
}));
jest.mock("@/features/files/redux/selectors", () => ({ selectFileById: () => undefined }));
jest.mock("@/features/workflow-runtime/run-status", () => ({ RUN_STATUS_LABEL: {} }));
jest.mock("@/features/meet/redux/meetingsSlice", () => ({ selectMeetingEntry: () => undefined }));

import { useTaskStatus } from "../items/item-status";
import type { NodeSource } from "../board/document";

const src = { kind: "entity", entity: "task", id: "t1" } as NodeSource;
const state = (edits: Record<string, unknown>) => ({
  task: { status: "inbox", due_date: null },
  tasksUi: { taskEdits: edits },
});

describe("task tile header with staged edits", () => {
  it("reads Unsaved while a change waits for Save", () => {
    fakeState = state({ t1: { status: "active" } });
    expect(useTaskStatus(src)).toMatchObject({ tone: "attention", label: "Unsaved" });
  });
  it("reads the saved status once nothing is staged", () => {
    fakeState = state({});
    expect(useTaskStatus(src)).toMatchObject({ label: "To do" });
  });
});
