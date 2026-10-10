/** @jest-environment jsdom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { TableViewSnapshot } from "@ai-matrx/design-system/data-table";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const mockList = jest.fn();
const mockCreate = jest.fn();
const mockUpdate = jest.fn();
const mockRename = jest.fn();
const mockArchive = jest.fn();

jest.mock("@/lib/redux/selectors/userSelectors", () => ({
  selectUserId: () => "user-a",
  selectAccessToken: () => "token-a",
}));
jest.mock("@/lib/redux/slices/appContextSlice", () => ({ selectOrganizationId: () => "org-a" }));
jest.mock("@/lib/redux/hooks", () => ({ useAppSelector: (selector: () => string) => selector() }));
jest.mock("./table-saved-views-service", () => ({
  listPersonalTableViews: (...args: unknown[]) => mockList(...args),
  createPersonalTableView: (...args: unknown[]) => mockCreate(...args),
  updatePersonalTableView: (...args: unknown[]) => mockUpdate(...args),
  renamePersonalTableView: (...args: unknown[]) => mockRename(...args),
  archivePersonalTableView: (...args: unknown[]) => mockArchive(...args),
}));
jest.mock("@ai-matrx/design-system/data-table", () => ({
  // The real comparison: "is the view dirty" is the package's decision, not this file's.
  sameTableView: jest.requireActual("@ai-matrx/design-system/data-table").sameTableView,
  SavedViewsControl: ({ views, activeId, error, onSelect, onSaveNew, onUpdate, onRemove }: {
    views: Array<{ id: string; name: string }>;
    activeId: string | null;
    error?: string | null;
    onSelect: (id: string | null) => void;
    onSaveNew: (name: string) => Promise<void>;
    onUpdate?: () => Promise<void>;
    onRemove?: (id: string) => Promise<void>;
  }) => <div>
    <div data-testid="views">{views.map((view) => view.name).join(",")}</div>
    <div data-testid="active">{activeId ?? "default"}</div>
    <div data-testid="error">{error}</div>
    <button onClick={() => void onSaveNew("New view")}>Create</button>
    <button onClick={() => void onUpdate?.()}>Update</button>
    {views.map((view) => <button key={view.id} onClick={() => onSelect(view.id)}>Select {view.name}</button>)}
    <button onClick={() => { if (onRemove) void onRemove(views[0]?.id ?? "").catch(() => {}); }}>Delete first</button>
  </div>,
}));

import { TableSavedViews } from "./TableSavedViews";

const viewSnapshot = (pageSize: number): TableViewSnapshot => ({
  __kind: "matrx-table-view",
  version: 1,
  query: { pageSize, search: "", anyOf: "", columnFilters: {}, sort: null },
  columns: { order: [], hidden: [] },
});
const snapshot = viewSnapshot(10);
const otherSnapshot = viewSnapshot(20);
const view = (id: string, name: string, version = 1) => ({ id, name, version, snapshot });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
function clickButton(host: HTMLElement, position: number) {
  const button = host.querySelectorAll<HTMLButtonElement>("button").item(position);
  if (!button) throw new Error(`Missing button ${position}`);
  button.click();
}

describe("durable table view adapter", () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    jest.clearAllMocks();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(async () => {
    await act(async () => { root.unmount(); });
    host.remove();
  });

  it("keeps a completed save over a stale list and reloads the pre-existing views", async () => {
    const initial = deferred<Array<ReturnType<typeof view>>>();
    const refreshed = deferred<Array<ReturnType<typeof view>>>();
    mockList.mockReturnValueOnce(initial.promise).mockReturnValueOnce(refreshed.promise);
    mockCreate.mockResolvedValue(view("new", "New view"));
    await act(async () => { root.render(<TableSavedViews tableId="checks" snapshot={snapshot} defaultSnapshot={snapshot} onApply={jest.fn()} />); });
    await act(async () => { clickButton(host, 0); });
    expect(host.querySelector('[data-testid="views"]')?.textContent).toBe("New view");
    await act(async () => { initial.resolve([view("old", "Existing view")]); });
    expect(host.querySelector('[data-testid="views"]')?.textContent).toBe("New view");
    await act(async () => { refreshed.resolve([view("old", "Existing view"), view("new", "New view")]); });
    expect(host.querySelector('[data-testid="views"]')?.textContent).toBe("Existing view,New view");
  });

  it("does not reactivate a view whose update finishes after another view was selected", async () => {
    const update = deferred<ReturnType<typeof view>>();
    mockList.mockResolvedValue([view("a", "A"), view("b", "B")]);
    mockUpdate.mockReturnValue(update.promise);
    const onApply = jest.fn();
    await act(async () => { root.render(<TableSavedViews tableId="checks" snapshot={otherSnapshot} defaultSnapshot={snapshot} onApply={onApply} />); });
    await act(async () => { clickButton(host, 2); });
    await act(async () => { clickButton(host, 1); });
    await act(async () => { clickButton(host, 3); });
    await act(async () => { update.resolve(view("a", "A", 2)); });
    expect(host.querySelector('[data-testid="active"]')?.textContent).toBe("b");
    expect(onApply).toHaveBeenLastCalledWith(snapshot);
  });

  it("removes the exact durable view through the host archive adapter", async () => {
    mockList.mockResolvedValueOnce([view("a", "A")]).mockResolvedValueOnce([]);
    mockArchive.mockResolvedValue(undefined);
    await act(async () => { root.render(<TableSavedViews tableId="checks" snapshot={snapshot} defaultSnapshot={snapshot} onApply={jest.fn()} />); });
    await act(async () => { clickButton(host, 3); });
    expect(mockArchive).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-a", accessToken: "token-a", organizationId: "org-a" }),
      "checks", view("a", "A"), expect.any(AbortSignal),
    );
    await act(async () => {});
    expect(host.querySelector('[data-testid="views"]')?.textContent).toBe("");
  });

  it("records deletion and offers recovery if returning to Default fails after archive", async () => {
    mockList.mockResolvedValueOnce([view("a", "A"), view("b", "B")])
      .mockRejectedValueOnce(new Error("Could not refresh views"))
      .mockResolvedValueOnce([]);
    mockArchive.mockResolvedValue(undefined);
    const onApply = jest.fn((next: TableViewSnapshot) => {
      if (next === otherSnapshot) throw new Error("Could not apply Default");
    });
    await act(async () => { root.render(<TableSavedViews tableId="checks" snapshot={snapshot} defaultSnapshot={otherSnapshot} onApply={onApply} />); });
    await act(async () => { clickButton(host, 2); });
    await act(async () => { clickButton(host, 4); });
    expect(mockArchive).toHaveBeenCalledTimes(1);
    expect(host.querySelector('[data-testid="active"]')?.textContent).toBe("default");
    expect(host.querySelector('[data-testid="views"]')?.textContent).toBe("B");
    expect(host.querySelector('[data-testid="error"]')?.textContent).toContain("Save the current layout as a new view or reload this page");
    expect(host.querySelector('[data-testid="error"]')?.textContent).toContain("Could not refresh views");
    await act(async () => { clickButton(host, 3); });
    expect(mockArchive).toHaveBeenCalledTimes(2);
    expect(host.querySelector('[data-testid="views"]')?.textContent).toBe("");
    expect(host.querySelector('[data-testid="error"]')?.textContent).toContain("Save the current layout as a new view or reload this page");
  });
});
