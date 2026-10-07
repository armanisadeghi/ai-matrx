/**
 * "38 waiting workflows" with no way to ignore them is the badge people learn to ignore
 * (Arman, 2026-10-07). Every place in the bell clears in one click and comes back only with
 * something new; Hide from bell takes it out entirely. The row is never a button inside a button.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { PlaceMarks } from "../badge";

const store: { cleared: PlaceMarks; hidden: string[] } = { cleared: { counts: {}, ids: {} }, hidden: [] };
jest.mock("../useInboxMemory", () => ({
  useInboxMemory: () => ({
    ready: true,
    seen: { counts: {}, ids: {} },
    cleared: store.cleared,
    hiddenSources: store.hidden,
    saveSeen: () => undefined,
    saveCleared: (marks: PlaceMarks) => {
      store.cleared = marks;
    },
    saveHidden: (keys: string[]) => {
      store.hidden = keys;
    },
  }),
}));
jest.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onSelect, disabled, ...rest }: { children: React.ReactNode; onSelect: () => void; disabled?: boolean }) => (
    <button type="button" disabled={disabled} onClick={onSelect} {...rest}>{children}</button>
  ),
}));
jest.mock("@/features/approvals/usePendingApprovalCount", () => ({ usePendingApprovalCount: () => ({ count: 0, unknown: false, storeCount: 0 }) }));
jest.mock("@/features/workflow-runtime/discovery/useWaitingRuns", () => ({ useWaitingRuns: () => ({ rows: [], loading: false, error: null }) }));
jest.mock("@/features/assists/service", () => ({ queryAssists: () => Promise.resolve({ rows: [], total: 0 }) }));
jest.mock("@/features/tasks/services/taskUserStateService", () => ({ listMyTaskUserStates: () => Promise.resolve([]) }));
jest.mock("../useInbox", () => ({ useWorkWaiting: () => ({ data: undefined, isLoading: false, isError: false }) }));
jest.mock("@/lib/redux/hooks", () => ({ useAppSelector: () => null, useAppDispatch: () => () => undefined }));

import { NOTICE_SOURCES } from "../sources/registry";
import { SourceItem } from "../components/PlacesStrip";

const workflows = NOTICE_SOURCES.find((s) => s.key === "workflows")!;
const runs = (n: number, from = 0) => Array.from({ length: n }, (_, i) => `run-${from + i}`);
const view = (ids: string[]) => (
  <SourceItem
    source={workflows}
    state={{ count: ids.length, ids, hidden: null, loading: false, error: false }}
    layout="strip"
  />
);

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;
const show = (ids: string[]) => act(() => root.render(view(ids)));
const count = () => host.querySelector('[data-source-count="workflows"]')?.textContent ?? null;
const press = (label: string) =>
  act(() => {
    [...host.querySelectorAll("button")].find((b) => b.textContent?.includes(label))?.click();
  });

beforeEach(() => {
  store.cleared = { counts: {}, ids: {} };
  store.hidden = [];
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

it("Clear takes 38 waiting workflows off the bell; one handled + one new brings back 1", () => {
  show(runs(38));
  expect(count()).toBe("38");
  press("Clear");
  show(runs(38));
  expect(count()).toBeNull();
  // run-0 handled elsewhere, run-38 arrived: the count is still 38, one is new.
  show([...runs(37, 1), "run-38"]);
  expect(count()).toBe("1");
});

it("Hide from bell records the place as hidden", () => {
  show(runs(38));
  press("Hide from bell");
  expect(store.hidden).toEqual(["workflows"]);
});

it("the row is never a button inside a button", () => {
  show(runs(3));
  expect(host.querySelectorAll("button button").length).toBe(0);
  expect(host.querySelector('[data-notice-source="workflows"]')?.tagName).toBe("DIV");
});
