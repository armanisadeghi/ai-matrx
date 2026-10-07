// useSavedBoard — load, debounced guarded autosave, flush on unmount, the
// keepalive save the moment the page hides or closes, the per-viewer camera,
// and the conflict path (including Reload recovering). The service is mocked;
// the hook's own timing and state machine are real.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const activeOrg = { id: "org-1" };
jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: (selector: (s: unknown) => unknown) =>
    selector({ appContext: { organization_id: activeOrg.id }, userAuth: { id: "user-1", accessToken: "token-1" } }),
}));
jest.mock("@/lib/redux/selectors/userSelectors", () => ({
  selectUserId: (s: { userAuth: { id: string } }) => s.userAuth.id,
  selectAccessToken: (s: { userAuth: { accessToken: string } }) => s.userAuth.accessToken,
}));
jest.mock("@/lib/redux/slices/appContextSlice", () => ({
  selectOrganizationId: (s: { appContext: { organization_id: string } }) => s.appContext.organization_id,
}));
jest.mock("@/lib/organization/organization-gate", () => ({
  isOrganizationSelectionCancelled: (e: unknown) => (e as { name?: string })?.name === "OrganizationSelectionCancelled",
}));
const toastError = jest.fn();
const toastDismiss = jest.fn();
jest.mock("@/lib/toast", () => ({
  toast: { error: (...a: unknown[]) => toastError(...a), dismiss: (...a: unknown[]) => toastDismiss(...a) },
}));

const saveBoardDocument = jest.fn();
const getBoard = jest.fn();
const touchOpened = jest.fn();
jest.mock("../persistence/boardsService", () => {
  const actual = jest.requireActual("../persistence/boardsService");
  return {
    ...actual,
    getBoard: (...a: unknown[]) => getBoard(...a),
    renameBoard: jest.fn(),
    touchOpened: (...a: unknown[]) => touchOpened(...a),
    saveBoardDocument: (...a: unknown[]) => saveBoardDocument(...a),
  };
});
jest.mock("@/utils/supabase/client", () => ({ supabase: { schema: () => ({ from: () => ({}) }) } }));

import { parseBoardDocument } from "../board/document";
import { BoardError, type LoadedBoard } from "../persistence/boardsService";
import { AUTOSAVE_DELAY_MS, OPEN_TIMEOUT_MS, useSavedBoard, type SavedBoardState } from "../persistence/useSavedBoard";

const emptyDoc = parseBoardDocument({ camera: { x: 0, y: 0, z: 1 }, nodes: [], edges: [] }).doc;
const docWith = (title: string) =>
  parseBoardDocument({
    camera: { x: 0, y: 0, z: 1 },
    nodes: [{ id: title, rect: { x: 0, y: 0, w: 1, h: 1 }, title, source: { kind: "text", markdown: title } }],
    edges: [],
  }).doc;

const loaded: LoadedBoard = {
  id: "board-1",
  title: "My board",
  organizationId: "org-1",
  version: 1,
  doc: emptyDoc,
  problems: [],
  fingerprint: "fp-1",
  updatedAt: "2026-09-27T00:00:00Z",
  lastOpenedAt: null,
};

function mount() {
  const result: { current: SavedBoardState } = { current: { state: "loading" } };
  function Probe() {
    result.current = useSavedBoard({ boardId: "board-1" });
    return null;
  }
  let root: Root;
  act(() => {
    root = createRoot(document.createElement("div"));
    root.render(<Probe />);
  });
  return {
    result,
    unmount: () => act(() => root.unmount()),
    rerender: () => act(() => root.render(<Probe />)),
  };
}

async function settle() {
  await act(async () => {
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
  });
}

function ready(state: SavedBoardState) {
  if (state.state !== "ready") throw new Error(`expected ready, got ${state.state}`);
  return state;
}

beforeEach(() => {
  jest.useFakeTimers();
  saveBoardDocument.mockReset().mockResolvedValue({ version: 2, fingerprint: "fp-2" });
  getBoard.mockReset().mockResolvedValue(loaded);
  touchOpened.mockReset().mockResolvedValue({ version: 2 });
  toastError.mockReset().mockReturnValue("toast-1");
  toastDismiss.mockReset();
  window.localStorage.clear();
});
afterEach(() => jest.useRealTimers());

it("loads the board by id and stamps it opened once", async () => {
  const { result } = mount();
  await settle();
  expect(getBoard).toHaveBeenCalledWith("board-1");
  expect(ready(result.current).board).toMatchObject({ id: "board-1", title: "My board" });
  expect(touchOpened).toHaveBeenCalledTimes(1);
});

it("switching the active organization never swaps the open board (it only says where a new one is filed)", async () => {
  activeOrg.id = "org-1";
  const { result, unmount, rerender } = mount();
  await settle();
  expect(getBoard).toHaveBeenCalledTimes(1);
  activeOrg.id = "org-2";
  rerender();
  await settle();
  expect(getBoard).toHaveBeenCalledTimes(1);
  expect(ready(result.current).board.id).toBe("board-1");
  unmount();
  activeOrg.id = "org-1";
});

it("debounces saves to one guarded write of the latest document, based on the opened version", async () => {
  const { result } = mount();
  await settle();
  act(() => ready(result.current).save(docWith("a")));
  act(() => jest.advanceTimersByTime(AUTOSAVE_DELAY_MS - 100));
  act(() => ready(result.current).save(docWith("b")));
  act(() => jest.advanceTimersByTime(AUTOSAVE_DELAY_MS - 1));
  expect(saveBoardDocument).not.toHaveBeenCalled();
  act(() => jest.advanceTimersByTime(1));
  await settle();
  expect(saveBoardDocument).toHaveBeenCalledTimes(1);
  const [id, doc, guard] = saveBoardDocument.mock.calls[0];
  expect(id).toBe("board-1");
  expect(doc.nodes[0].id).toBe("b");
  // touchOpened moved the version to 2; the save must be based on it
  expect(guard).toEqual({ expectedVersion: 2, baseFingerprint: "fp-1", base: expect.objectContaining({ nodes: expect.any(Array) }) });
  expect(ready(result.current).lastSavedAt).not.toBeNull();
});

it("flushes a pending save on unmount — typing is never lost", async () => {
  const { result, unmount } = mount();
  await settle();
  act(() => ready(result.current).save(docWith("typed")));
  unmount();
  await settle();
  expect(saveBoardDocument).toHaveBeenCalledTimes(1);
  expect(saveBoardDocument.mock.calls[0][1].nodes[0].id).toBe("typed");
});

it("flushes a pending save on pagehide, as a keepalive request", async () => {
  const { result } = mount();
  await settle();
  act(() => ready(result.current).save(docWith("leaving")));
  act(() => {
    window.dispatchEvent(new Event("pagehide"));
  });
  await settle();
  expect(saveBoardDocument).toHaveBeenCalledTimes(1);
  expect(saveBoardDocument.mock.calls[0][3]).toEqual({ keepalive: { accessToken: "token-1" } });
});

it("the moment the page is hidden (the first step of closing a tab) the pending edit goes out as a keepalive save", async () => {
  const { result } = mount();
  await settle();
  act(() => ready(result.current).save(docWith("last words")));
  const visibility = jest.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
  try {
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await settle();
    // Not after the ~800ms quiet period: now.
    expect(saveBoardDocument).toHaveBeenCalledTimes(1);
    const [, doc, , options] = saveBoardDocument.mock.calls[0];
    expect(doc.nodes[0].id).toBe("last words");
    expect(options).toEqual({ keepalive: { accessToken: "token-1" } });
  } finally {
    visibility.mockRestore();
  }
  // An ordinary debounced save is not a keepalive request.
  act(() => ready(result.current).save(docWith("back")));
  act(() => jest.advanceTimersByTime(AUTOSAVE_DELAY_MS));
  await settle();
  expect(saveBoardDocument.mock.calls[1][3]).toBeUndefined();
});

it("builds the document only when the save goes out — never per reported change", async () => {
  const { result } = mount();
  await settle();
  const build = jest.fn(() => docWith("built"));
  for (let i = 0; i < 120; i++) act(() => ready(result.current).save(build)); // a drag's pointer frames
  expect(build).not.toHaveBeenCalled();
  act(() => jest.advanceTimersByTime(AUTOSAVE_DELAY_MS));
  await settle();
  expect(build).toHaveBeenCalledTimes(1);
  expect(saveBoardDocument.mock.calls[0][1].nodes[0].id).toBe("built");
});

it("the camera is this viewer's own: kept per person per board, never saved into the board", async () => {
  const { result, unmount } = mount();
  await settle();
  expect(ready(result.current).board.viewerCamera).toBeNull(); // first visit: open to fit everything
  act(() => ready(result.current).saveCamera({ x: 12, y: -40, z: 0.5 }));
  act(() => jest.advanceTimersByTime(AUTOSAVE_DELAY_MS * 2));
  await settle();
  expect(saveBoardDocument).not.toHaveBeenCalled();
  unmount();
  const again = mount();
  await settle();
  expect(ready(again.result.current).board.viewerCamera).toEqual({ x: 12, y: -40, z: 0.5 });
});

it("a conflict sets saveError, toasts with a reload action, and stops autosaving", async () => {
  saveBoardDocument.mockRejectedValueOnce(
    new BoardError("conflict", "This board was changed in another tab.", "Reload the board."),
  );
  const { result } = mount();
  await settle();
  act(() => ready(result.current).save(docWith("mine")));
  act(() => jest.advanceTimersByTime(AUTOSAVE_DELAY_MS));
  await settle();
  expect(ready(result.current).saveError).toMatch(/another tab/);
  expect(toastError).toHaveBeenCalledTimes(1);
  expect(toastError.mock.calls[0][1].action.label).toBe("Reload board");
  act(() => ready(result.current).save(docWith("more")));
  act(() => jest.advanceTimersByTime(AUTOSAVE_DELAY_MS * 2));
  await settle();
  expect(saveBoardDocument).toHaveBeenCalledTimes(1); // never overwrites the newer board
  // The byline keeps saying so; the toast stays until the person reloads.
  expect(ready(result.current).saveError).toMatch(/another tab/);
  expect(toastError.mock.calls[0][1].duration).toBe(Infinity);
});

it("Reload board after a conflict reopens the newer board and saving resumes", async () => {
  saveBoardDocument.mockRejectedValueOnce(
    new BoardError("conflict", "This board was changed in another tab.", "Reload the board."),
  );
  const { result } = mount();
  await settle();
  act(() => ready(result.current).save(docWith("mine")));
  act(() => jest.advanceTimersByTime(AUTOSAVE_DELAY_MS));
  await settle();
  getBoard.mockResolvedValue({ ...loaded, version: 5, fingerprint: "fp-5", doc: docWith("theirs") });
  touchOpened.mockResolvedValue({ version: 6 });
  act(() => toastError.mock.calls[0][1].action.onClick());
  await settle();
  expect(toastDismiss).toHaveBeenCalledWith("toast-1");
  const reopened = ready(result.current);
  expect(reopened.board.doc.nodes[0].id).toBe("theirs");
  expect(reopened.saveError).toBeNull();
  act(() => reopened.save(docWith("after reload")));
  act(() => jest.advanceTimersByTime(AUTOSAVE_DELAY_MS));
  await settle();
  expect(saveBoardDocument).toHaveBeenCalledTimes(2);
  expect(saveBoardDocument.mock.calls[1][2]).toEqual({ expectedVersion: 6, baseFingerprint: "fp-5", base: expect.objectContaining({ nodes: expect.any(Array) }) });
});

it("a refused organization choice is a failed state whose retry asks again", async () => {
  getBoard.mockReset().mockRejectedValueOnce({ name: "OrganizationSelectionCancelled" }).mockResolvedValue(loaded);
  const { result } = mount();
  await settle();
  const failed = result.current;
  if (failed.state !== "failed") throw new Error("expected failed");
  expect(failed.reason).toMatch(/Choose one/);
  act(() => failed.retry());
  await settle();
  expect(getBoard).toHaveBeenCalledTimes(2);
  expect(result.current.state).toBe("ready");
});

it("a load that never answers becomes a failed state with Try again, never a silent wait", async () => {
  getBoard.mockReset().mockReturnValueOnce(new Promise(() => {}));
  const { result } = mount();
  await settle();
  expect(result.current.state).toBe("loading");
  await act(async () => {
    jest.advanceTimersByTime(OPEN_TIMEOUT_MS + 10);
  });
  expect(result.current.state).toBe("failed");
  getBoard.mockResolvedValue(loaded);
  await act(async () => {
    (result.current as Extract<SavedBoardState, { state: "failed" }>).retry();
  });
  await settle();
  expect(ready(result.current).board.id).toBe("board-1");
});
