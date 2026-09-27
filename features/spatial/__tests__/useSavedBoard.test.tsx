// useSavedBoard — load, debounced guarded autosave, flush on unmount and
// pagehide, and the conflict path. The service is mocked; the hook's own
// timing and state machine are real.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: (selector: (s: unknown) => unknown) =>
    selector({ appContext: { organization_id: "org-1" }, userAuth: { id: "user-1" } }),
}));
jest.mock("@/lib/redux/selectors/userSelectors", () => ({
  selectUserId: (s: { userAuth: { id: string } }) => s.userAuth.id,
}));
jest.mock("@/lib/redux/slices/appContextSlice", () => ({
  selectOrganizationId: (s: { appContext: { organization_id: string } }) => s.appContext.organization_id,
}));
jest.mock("@/lib/organization/organization-gate", () => ({
  isOrganizationSelectionCancelled: (e: unknown) => (e as { name?: string })?.name === "OrganizationSelectionCancelled",
}));
const toastError = jest.fn();
jest.mock("@/lib/toast", () => ({ toast: { error: (...a: unknown[]) => toastError(...a) } }));

const saveBoardDocument = jest.fn();
const getHomeBoard = jest.fn();
const touchOpened = jest.fn();
jest.mock("../persistence/boardsService", () => {
  const actual = jest.requireActual("../persistence/boardsService");
  return {
    ...actual,
    getHomeBoard: (...a: unknown[]) => getHomeBoard(...a),
    getBoard: jest.fn(),
    renameBoard: jest.fn(),
    touchOpened: (...a: unknown[]) => touchOpened(...a),
    saveBoardDocument: (...a: unknown[]) => saveBoardDocument(...a),
  };
});
jest.mock("@/utils/supabase/client", () => ({ supabase: { schema: () => ({ from: () => ({}) }) } }));

import { parseBoardDocument } from "../board/document";
import { BoardError, type LoadedBoard } from "../persistence/boardsService";
import { AUTOSAVE_DELAY_MS, useSavedBoard, type SavedBoardState } from "../persistence/useSavedBoard";

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
  isHome: true,
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
    result.current = useSavedBoard({ home: true });
    return null;
  }
  let root: Root;
  act(() => {
    root = createRoot(document.createElement("div"));
    root.render(<Probe />);
  });
  return { result, unmount: () => act(() => root.unmount()) };
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
  getHomeBoard.mockReset().mockResolvedValue(loaded);
  touchOpened.mockReset().mockResolvedValue({ version: 2 });
  toastError.mockReset();
});
afterEach(() => jest.useRealTimers());

it("loads the home board in the selected organization and stamps it opened once", async () => {
  const { result } = mount();
  await settle();
  expect(getHomeBoard).toHaveBeenCalledWith("org-1");
  expect(ready(result.current).board).toMatchObject({ id: "board-1", isHome: true, title: "My board" });
  expect(touchOpened).toHaveBeenCalledTimes(1);
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
  expect(guard).toEqual({ expectedVersion: 2, baseFingerprint: "fp-1" });
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

it("flushes a pending save on pagehide", async () => {
  const { result } = mount();
  await settle();
  act(() => ready(result.current).save(docWith("leaving")));
  act(() => {
    window.dispatchEvent(new Event("pagehide"));
  });
  await settle();
  expect(saveBoardDocument).toHaveBeenCalledTimes(1);
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
});

it("a refused organization choice is a failed state whose retry asks again", async () => {
  getHomeBoard.mockReset().mockRejectedValueOnce({ name: "OrganizationSelectionCancelled" }).mockResolvedValue(loaded);
  const { result } = mount();
  await settle();
  const failed = result.current;
  if (failed.state !== "failed") throw new Error("expected failed");
  expect(failed.reason).toMatch(/Choose one/);
  act(() => failed.retry());
  await settle();
  expect(getHomeBoard).toHaveBeenCalledTimes(2);
  expect(result.current.state).toBe("ready");
});
