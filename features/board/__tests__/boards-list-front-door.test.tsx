// Boards work like every saved record: /board is the LIST (no special "My board"), a board
// opens at /board/<id>, and the menu's "Add to your board" rows (`/board?add=<key>`) open the
// board the person opened LAST (or a new one when they have none) and start the item there.
// Each case fails when the behaviour it names breaks.

import fs from "fs";
import path from "path";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { primaryNavItems } from "@/features/shell/constants/nav-data";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const replace = jest.fn();
let params = new URLSearchParams();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: jest.fn() }),
  useSearchParams: () => params,
  usePathname: () => "/board",
}));
jest.mock("@/lib/redux/hooks", () => ({ useAppSelector: (sel: () => unknown) => sel() }));
jest.mock("@/lib/redux/slices/appContextSlice", () => ({ selectOrganizationId: () => "org-1" }));
jest.mock("@/lib/redux/selectors/userSelectors", () => ({
  selectAuthReady: () => true,
  selectUserId: () => "u1",
  selectAccessToken: () => "tok",
}));
jest.mock("@/components/loaders/ShimmerText", () => ({ ShimmerText: ({ text }: { text: string }) => <span>{text}</span> }));
jest.mock("@ai-matrx/design-system", () => ({ ErrorNotice: ({ message }: { message: string }) => <div>{message}</div> }));
jest.mock("@/components/ui/button", () => ({ Button: (p: { children: unknown }) => <button>{p.children as string}</button> }));
jest.mock("@ai-matrx/design-system/controls", () => ({
  Button: (p: { children: unknown }) => <button>{p.children as string}</button>,
  // The template gallery frame (TemplateGalleryShell) draws these while templates load.
  RegionSkeleton: () => <div aria-busy="true" />,
}));
// The template gallery's Dialog re-exports from the (mocked) design system; a plain stand-in keeps its frame mountable.
jest.mock("@/components/ui/dialog", () => ({
  Dialog: ({ open, children }: { open: boolean; children: unknown }) => (open ? <div>{children as never}</div> : null),
  DialogContent: ({ children }: { children: unknown }) => <div>{children as never}</div>,
  DialogTitle: ({ children }: { children: unknown }) => <h2>{children as never}</h2>,
}));
jest.mock("@/features/shell/components/header/PageHeader", () => ({ __esModule: true, default: () => null }));
jest.mock("@/lib/entity-list/components/EntityListPage", () => ({ EntityListPage: () => <div>THE BOARDS LIST</div> }));
jest.mock("../boards/listConfig", () => ({ boardListConfig: {} }));
jest.mock("../persistence/useCreateBoard", () => ({ useCreateBoard: () => ({ creating: false, newBoard: jest.fn() }) }));
const getLastOpenedBoardId = jest.fn();
const beginBoardCreate = jest.fn();
jest.mock("../persistence/boardsService", () => ({
  getLastOpenedBoardId: (...a: unknown[]) => getLastOpenedBoardId(...a),
  beginBoardCreate: (...a: unknown[]) => beginBoardCreate(...a),
  isBoardError: () => false,
}));

import { BoardsListPage } from "../boards/BoardsListPage";

async function mount() {
  const host = document.createElement("div");
  const root = createRoot(host);
  await act(async () => {
    root.render(<BoardsListPage />);
  });
  await act(async () => {
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
  });
  return { host, unmount: () => act(() => root.unmount()) };
}

beforeEach(() => {
  replace.mockReset();
  getLastOpenedBoardId.mockReset();
  beginBoardCreate.mockReset();
  params = new URLSearchParams();
});

describe("/board is the boards list", () => {
  it("renders the list, not a board, and does not navigate anywhere", async () => {
    const { host, unmount } = await mount();
    expect(host.textContent).toContain("THE BOARDS LIST");
    expect(replace).not.toHaveBeenCalled();
    expect(getLastOpenedBoardId).not.toHaveBeenCalled();
    unmount();
  });

  it("the /board page file renders the list and no home board", () => {
    const src = fs.readFileSync(path.join(__dirname, "../../../app/(core)/board/page.tsx"), "utf8");
    expect(src).toContain("BoardsListPage");
    expect(src).not.toMatch(/home|BoardPage/);
  });
});

describe("/board?add=<key> opens the board you opened last", () => {
  it("goes to /board/<last opened>?add=<key>", async () => {
    params = new URLSearchParams("add=note");
    getLastOpenedBoardId.mockResolvedValue("b9");
    const { host, unmount } = await mount();
    expect(replace).toHaveBeenCalledWith("/board/b9?add=note");
    expect(host.textContent).not.toContain("THE BOARDS LIST");
    expect(beginBoardCreate).not.toHaveBeenCalled();
    unmount();
  });

  it("makes a new board when the person has none, and starts the item there", async () => {
    params = new URLSearchParams("add=war-room");
    getLastOpenedBoardId.mockResolvedValue(null);
    beginBoardCreate.mockResolvedValue({ id: "fresh" });
    const { unmount } = await mount();
    expect(beginBoardCreate).toHaveBeenCalledWith({ organizationId: "org-1" });
    expect(replace).toHaveBeenCalledWith("/board/fresh?add=war-room");
    unmount();
  });
});

describe("the Board menu", () => {
  const rows: { label: string; href?: string }[] = [];
  const walk = (nodes: readonly { label: string; href?: string; children?: readonly unknown[] }[]) => {
    for (const n of nodes) {
      rows.push(n);
      if (n.children) walk(n.children as never);
    }
  };
  walk(primaryNavItems as never);

  it("has no 'My board' and no old /board/all row", () => {
    expect(rows.filter((r) => /my board/i.test(r.label))).toEqual([]);
    expect(rows.filter((r) => r.href === "/board/all")).toEqual([]);
  });

  it("has ONE 'Boards' row, and it is the list", () => {
    const boards = rows.filter((r) => r.label === "Boards");
    expect(boards.map((r) => r.href)).toEqual(["/board"]);
  });
});
