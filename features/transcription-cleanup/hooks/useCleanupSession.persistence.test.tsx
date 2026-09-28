/** @jest-environment jsdom */

import { renderHook, settle } from "@/test-utils/renderHook";

const sessions = [
  {
    id: "session-a",
    title: "A",
    source: "cleanup",
    startedAt: new Date(0).toISOString(),
  },
  {
    id: "session-b",
    title: "B",
    source: "cleanup",
    startedAt: new Date(0).toISOString(),
  },
];

const mockService = {
  applyCleanupRun: jest.fn(),
  bindAgentRunConversation: jest.fn(),
  createSession: jest.fn(),
  deleteRawSegment: jest.fn(),
  fetchSessionSettings: jest.fn(),
  finalizeAgentRun: jest.fn(),
  insertAgentRun: jest.fn(),
  insertRawSegment: jest.fn(),
  listAgentRuns: jest.fn(),
  listCleanedSegments: jest.fn(),
  listRawSegments: jest.fn(),
  listStudioDocuments: jest.fn(),
  softDeleteSession: jest.fn(),
  updateCleanedSegmentText: jest.fn(),
  updateSession: jest.fn(),
  upsertSessionSettings: jest.fn(),
  upsertStudioDocument: jest.fn(),
};

jest.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
jest.mock("@ai-matrx/kit/url-state", () => ({ commitUrlParams: jest.fn() }));
jest.mock("@/lib/toast", () => ({ toast: { error: jest.fn(), success: jest.fn() } }));
jest.mock("@/utils/errors", () => ({ extractErrorMessage: () => "error" }));
jest.mock("@/features/notes/hooks/useAutoLabel", () => ({ generateLabelFromContent: () => "" }));
jest.mock("@/hooks/useBackendApi", () => ({ useBackendApi: () => ({ post: jest.fn() }) }));
jest.mock("@/utils/supabase/client", () => ({ supabase: { schema: () => ({ from: () => ({ select: () => ({ in: () => Promise.resolve({ data: [] }) }) }) }) } }));
jest.mock("@/utils/auth/getUserId", () => ({ getUserId: () => "user-1" }));
jest.mock("@/features/transcript-studio/service/studioService", () => mockService);
jest.mock("@/features/transcript-studio/redux/slice", () => ({ sessionRemoved: jest.fn(), sessionUpserted: jest.fn() }));
jest.mock("@/features/transcript-studio/redux/thunks", () => ({ fetchSessionsThunk: jest.fn(() => ({ type: "sessions" })) }));
jest.mock("@/features/transcript-studio/redux/selectors", () => ({
  selectAllSessions: "all-sessions",
  selectFetchStatus: "fetch-status",
}));
jest.mock("@/features/transcript-studio/redux/reattachStudioRun", () => ({ isResumableStudioRun: () => false }));
jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: string) => selector === "all-sessions" ? sessions : "success",
  useAppStore: () => ({ getState: () => ({ transcriptStudio: { byId: {} } }) }),
}));

// Require after the external boundaries are replaced; this is a hook contract
// test, so the persistence service is the only real side effect we observe.
const { useCleanupSession } = require("./useCleanupSession") as typeof import("./useCleanupSession");

describe("useCleanupSession persistence targets", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockService.listRawSegments.mockResolvedValue([]);
    mockService.listCleanedSegments.mockResolvedValue([]);
    mockService.listStudioDocuments.mockResolvedValue([]);
    mockService.fetchSessionSettings.mockResolvedValue(null);
    mockService.listAgentRuns.mockResolvedValue([]);
    mockService.upsertStudioDocument.mockResolvedValue(undefined);
    mockService.upsertSessionSettings.mockResolvedValue(undefined);
    mockService.insertAgentRun.mockResolvedValue({ id: "run-a" });
    mockService.applyCleanupRun.mockResolvedValue({ id: "clean-a", passIndex: 1 });
  });

  afterEach(() => jest.useRealTimers());

  it("keeps quick A/B custom edits in their own session and slot", async () => {
    const hook = await renderHook(() => useCleanupSession({ urlSync: false }));
    await hook.act(() => hook.current.selectSession("session-a"));
    await settle(hook, (value) => value.loadState === "ready", "A load");

    await hook.act(() => hook.current.persistCustomEdit("A-first", "cleanup_custom"));
    await hook.act(() => hook.current.selectSession("session-b"));
    await hook.act(() => hook.current.persistCustomEdit("B-second", "cleanup_custom_b"));
    await hook.act(async () => { jest.advanceTimersByTime(1500); });

    expect(mockService.upsertStudioDocument).toHaveBeenCalledWith("session-a", "cleanup_custom", expect.objectContaining({ content: "A-first" }));
    expect(mockService.upsertStudioDocument).toHaveBeenCalledWith("session-b", "cleanup_custom_b", expect.objectContaining({ content: "B-second" }));
    await hook.unmount();
  });

  it("flushes A's raw replacement against A's snapshot after switching to B", async () => {
    mockService.listRawSegments.mockImplementation((sessionId: string) =>
      Promise.resolve(sessionId === "session-a" ? [{ id: "old-a", text: "old A", chunkIndex: 0 }] : [{ id: "old-b", text: "old B", chunkIndex: 0 }]),
    );
    mockService.insertRawSegment.mockResolvedValue({ id: "new-a", text: "new A" });
    const hook = await renderHook(() => useCleanupSession({ urlSync: false }));
    await hook.act(() => hook.current.selectSession("session-a"));
    await settle(hook, (value) => value.loadState === "ready", "A load");

    await hook.act(() => hook.current.persistRawReplace("new A"));
    await hook.act(() => hook.current.selectSession("session-b"));
    await settle(hook, (value) => value.activeSessionId === "session-b", "B selection");

    expect(mockService.insertRawSegment).toHaveBeenCalledWith(expect.objectContaining({ sessionId: "session-a", text: "new A" }));
    expect(mockService.deleteRawSegment).toHaveBeenCalledWith("old-a");
    expect(mockService.deleteRawSegment).not.toHaveBeenCalledWith("old-b");
    await hook.unmount();
  });

  it("flushes a captured settings snapshot on unmount", async () => {
    const hook = await renderHook(() => useCleanupSession({ urlSync: false }));
    await hook.act(() => hook.current.selectSession("session-a"));
    await settle(hook, (value) => value.loadState === "ready", "A load");
    await hook.act(() => hook.current.persistSettings({ cleanAgentId: "agent-a", contextItems: [{ id: "ctx-a", key: "brief", label: "Brief", value: "A" }] }));
    await hook.unmount();

    expect(mockService.upsertSessionSettings).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: "session-a",
      cleaningShortcutId: "agent-a",
      contextItems: [expect.objectContaining({ value: "A" })],
    }));
  });

  it("persists a completed A run and its next edit to A after B is active", async () => {
    let aHasCompletedRun = false;
    mockService.listCleanedSegments.mockImplementation((sessionId: string) =>
      Promise.resolve(
        sessionId === "session-a" && aHasCompletedRun
          ? [{ id: "clean-a", passIndex: 1, text: "A run" }]
          : [],
      ),
    );
    mockService.applyCleanupRun.mockImplementation(async () => {
      aHasCompletedRun = true;
      return { id: "clean-a", passIndex: 1 };
    });
    const hook = await renderHook(() => useCleanupSession({ urlSync: false }));
    await hook.act(() => hook.current.selectSession("session-a"));
    await settle(hook, (value) => value.loadState === "ready", "A load");
    await hook.act(() => hook.current.selectSession("session-b"));
    await settle(hook, (value) => value.activeSessionId === "session-b", "B selection");

    await hook.act(() => hook.current.persistCleanRun("A run", "agent-a", null, null, "session-a"));
    await hook.act(() => hook.current.selectSession("session-a"));
    await hook.act(() => hook.current.persistCleanEdit("A edited", "agent-a"));
    await hook.act(async () => { jest.advanceTimersByTime(1500); });

    expect(mockService.applyCleanupRun).toHaveBeenCalledWith(expect.objectContaining({ sessionId: "session-a", text: "A run" }));
    expect(mockService.updateCleanedSegmentText).toHaveBeenCalledWith("clean-a", "A edited");
    await hook.unmount();
  });
});
