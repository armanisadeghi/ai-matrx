// Optimistic "New board": the page for a board minted in this tab renders the empty board at once,
// the insert carries an explicit organization_id and the minted id, and a failed insert is the
// page's `failed` state with a working Retry (never a silent empty board). A first save waits for
// the row to land.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: (selector: (s: unknown) => unknown) =>
    selector({ appContext: { organization_id: "org-1" }, userAuth: { id: "user-1", accessToken: "token-1" } }),
}));
jest.mock("@/lib/redux/selectors/userSelectors", () => ({
  selectUserId: (s: { userAuth: { id: string } }) => s.userAuth.id,
  selectAccessToken: (s: { userAuth: { accessToken: string } }) => s.userAuth.accessToken,
}));
jest.mock("@/lib/redux/slices/appContextSlice", () => ({
  selectOrganizationId: (s: { appContext: { organization_id: string } }) => s.appContext.organization_id,
}));
jest.mock("@/lib/organizations/ensureOrgId", () => ({
  ensureOrgId: async (organizationId: string | null) => organizationId ?? "org-1",
}));
jest.mock("@/lib/organizations/orgBootstrapGate", () => ({ whenOrgBootstrapResolved: async () => undefined }));
jest.mock("@/utils/auth/getUserId", () => ({ requireUserId: () => "user-1" }));
jest.mock("@/lib/toast", () => ({ toast: { error: jest.fn(), dismiss: jest.fn(), warning: jest.fn() } }));

const insert = jest.fn();
const getBoardRow = jest.fn();
jest.mock("@/utils/supabase/projectsDb", () => ({
  projectsDb: () => ({
    from: () => ({
      insert: (row: unknown) => ({ select: () => ({ single: () => insert(row) }) }),
      select: () => ({
        eq: () => ({ is: () => ({ maybeSingle: () => getBoardRow() }) }),
      }),
    }),
  }),
}));
jest.mock("@/utils/supabase/client", () => ({ supabase: { schema: () => ({ from: () => ({}) }) } }));

import { beginBoardCreate, getPendingCreate } from "../persistence/boardsService";
import { useSavedBoard, type SavedBoardState } from "../persistence/useSavedBoard";

function storedRow(id: string, orgId: string) {
  return {
    id,
    organization_id: orgId,
    title: "Untitled board",
    description: null,
    camera: { x: 0, y: 0, z: 1 },
    nodes: [],
    edges: [],
    settings: {},
    version: 1,
    created_by: "user-1",
    created_at: "2026-10-04T00:00:00Z",
    updated_at: "2026-10-04T00:00:00Z",
    last_opened_at: null,
  };
}

function mount(boardId: string) {
  const result: { current: SavedBoardState } = { current: { state: "loading" } };
  function Probe() {
    result.current = useSavedBoard({ boardId });
    return null;
  }
  let root!: Root;
  act(() => {
    root = createRoot(document.createElement("div"));
    root.render(<Probe />);
  });
  return { result, unmount: () => act(() => root.unmount()) };
}

beforeEach(() => {
  insert.mockReset();
  getBoardRow.mockReset();
});

describe("optimistic New board", () => {
  it("carries the minted id and an explicit organization_id on the insert", async () => {
    insert.mockImplementation(async (row: { id: string; organization_id: string }) => ({
      data: storedRow(row.id, row.organization_id),
      error: null,
    }));
    const { id } = await beginBoardCreate({ organizationId: "org-9" });
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert.mock.calls[0][0]).toMatchObject({ id, organization_id: "org-9" });
  });

  it("renders the empty board before the insert lands, never reading the row first", async () => {
    let land!: (v: unknown) => void;
    insert.mockImplementation(
      (row: { id: string; organization_id: string }) =>
        new Promise((r) => (land = () => r({ data: storedRow(row.id, row.organization_id), error: null }))),
    );
    const { id } = await beginBoardCreate({ organizationId: "org-1" });
    const { result } = mount(id);
    expect(result.current.state).toBe("ready");
    expect(getBoardRow).not.toHaveBeenCalled();
    await act(async () => land(undefined));
    expect(result.current.state).toBe("ready");
    expect(getPendingCreate(id)).toBeUndefined();
  });

  it("a failed insert says so with Retry, and Retry makes the board", async () => {
    insert.mockResolvedValueOnce({ data: null, error: { message: "boom", code: "XX000" } });
    const { id } = await beginBoardCreate({ organizationId: "org-1" });
    const { result } = mount(id);
    await act(async () => undefined);
    expect(result.current.state).toBe("failed");
    getBoardRow.mockResolvedValue({ data: null, error: null });
    insert.mockImplementation(async (row: { id: string; organization_id: string }) => ({
      data: storedRow(row.id, row.organization_id),
      error: null,
    }));
    await act(async () => {
      if (result.current.state === "failed") result.current.retry();
    });
    await act(async () => undefined);
    expect(result.current.state).toBe("ready");
    expect(insert).toHaveBeenCalledTimes(2);
    expect(insert.mock.calls[1][0]).toMatchObject({ id, organization_id: "org-1" });
  });
});
