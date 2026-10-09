/**
 * A conversation belongs to a board through an association edge: read once per
 * opened board, filed when the server has the conversation, removed only by the
 * list's own "Remove from this board" (the conversation is never touched).
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { BoardChatsProvider, useBoardChats, type BoardChats } from "../board-chats";

const mockList = jest.fn();
const mockAdd = jest.fn();
const mockRemove = jest.fn();
jest.mock("@/features/scopes/service/associationsService", () => ({
  associationsService: {
    listForTargets: (...a: unknown[]) => mockList(...a),
    add: (...a: unknown[]) => mockAdd(...a),
    remove: (...a: unknown[]) => mockRemove(...a),
  },
}));
jest.mock("@/lib/toast", () => ({ toast: { error: jest.fn() } }));
jest.mock("next/navigation", () => ({ usePathname: () => "/board/b1" }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const BOARD = "9a1c2a9e-4b0f-4c1e-9a55-2f3e8b6d1b01";
const ORG = "5dc930e9-bd65-44a1-8369-af773f6e1a5b";
const A = "7d1c2a9e-4b0f-4c1e-9a55-2f3e8b6d1a01";
const B = "7d1c2a9e-4b0f-4c1e-9a55-2f3e8b6d1a02";

let root: Root | null = null;
let seen: BoardChats | null = null;
function Probe() {
  seen = useBoardChats();
  return null;
}
async function mount() {
  const host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <BoardChatsProvider boardId={BOARD} organizationId={ORG}>
        <Probe />
      </BoardChatsProvider>,
    );
  });
}
beforeEach(() => {
  mockList.mockReset().mockResolvedValue({ ok: true, data: { edges: [{ sourceType: "conversation", sourceId: A }] } });
  mockAdd.mockReset().mockResolvedValue({ ok: true, data: { id: "e1" } });
  mockRemove.mockReset().mockResolvedValue({ ok: true, data: null });
});
afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  seen = null;
  document.body.innerHTML = "";
});

it("reads the board's conversations once", async () => {
  await mount();
  expect(mockList).toHaveBeenCalledTimes(1);
  expect(mockList).toHaveBeenCalledWith("board", [BOARD]);
  expect(seen?.ids).toEqual([A]);
});

it("files a conversation as conversation -> board with the board's organization, once", async () => {
  await mount();
  await act(async () => {
    seen!.file(B);
    seen!.file(B);
  });
  expect(mockAdd).toHaveBeenCalledTimes(1);
  expect(mockAdd).toHaveBeenCalledWith({ sourceType: "conversation", sourceId: B, targetType: "board", targetId: BOARD, orgId: ORG });
  expect(seen?.ids).toEqual([A, B]);
});

it("a conversation already on the board is not filed again", async () => {
  await mount();
  await act(async () => seen!.file(A));
  expect(mockAdd).not.toHaveBeenCalled();
});

it("a failed write takes the optimistic row back, loudly", async () => {
  mockAdd.mockResolvedValue({ ok: false, error: { message: "refused" } });
  const err = jest.spyOn(console, "error").mockImplementation(() => undefined);
  await mount();
  await act(async () => seen!.file(B));
  expect(seen?.ids).toEqual([A]);
  expect(err).toHaveBeenCalled();
});

it("Remove from this board deletes only the edge", async () => {
  await mount();
  await act(async () => seen!.unfile(A));
  expect(mockRemove).toHaveBeenCalledWith({ sourceType: "conversation", sourceId: A, targetType: "board", targetId: BOARD });
  expect(seen?.ids).toEqual([]);
});
