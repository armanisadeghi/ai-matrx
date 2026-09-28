/** @jest-environment jsdom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { TableViewSnapshot } from "@ai-matrx/design-system/data-table";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const mockList = jest.fn();
const mockCreate = jest.fn();
const mockUpdate = jest.fn();
const mockRename = jest.fn();

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
}));
jest.mock("@ai-matrx/design-system/data-table", () => ({
  SavedViewsControl: ({ views, activeId, onSelect, onSaveNew, onUpdate }: {
    views: Array<{ id: string; name: string }>;
    activeId: string | null;
    onSelect: (id: string | null) => void;
    onSaveNew: (name: string) => Promise<void>;
    onUpdate?: () => Promise<void>;
  }) => <div>
    <div data-testid="views">{views.map((view) => view.name).join(",")}</div>
    <div data-testid="active">{activeId ?? "default"}</div>
    <button onClick={() => void onSaveNew("New view")}>Create</button>
    <button onClick={() => void onUpdate?.()}>Update</button>
    {views.map((view) => <button key={view.id} onClick={() => onSelect(view.id)}>Select {view.name}</button>)}
  </div>,
}));

import { TableSavedViews } from "./TableSavedViews";

const snapshot = { pageSize: 10 } as TableViewSnapshot;
const otherSnapshot = { pageSize: 20 } as TableViewSnapshot;
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
});
