/**
 * "38 waiting workflows" with no way to ignore them is the badge people learn to ignore
 * (Arman, 2026-10-07). Every place in the bell clears in one click and comes back only with
 * something new; Hide from bell takes it out entirely. Red before 2026-10-07: the place had no
 * menu and always showed its full count.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { InboxPreferences } from "@/lib/redux/preferences/userPreferencesSlice";

const store: { prefs: InboxPreferences } = { prefs: { sourcesSeen: {}, sourcesCleared: {}, hiddenSources: [] } };
jest.mock("../useInboxMemory", () => ({
  useInboxMemory: () => ({
    ...store.prefs,
    ready: true,
    save: (patch: Partial<InboxPreferences>) => {
      store.prefs = { ...store.prefs, ...patch };
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
jest.mock("@/lib/redux/hooks", () => ({ useAppSelector: () => null }));

import { SourceIndicatorView } from "../sources/registry";

const view = (count: number) => (
  <SourceIndicatorView state={{ count, hidden: null, loading: false, error: false }} bucket="needs_you" sourceKey="workflows" />
);

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;
const show = (count: number) => act(() => root.render(view(count)));
const count = () => host.querySelector('[data-source-count="workflows"]')?.textContent ?? null;
const press = (label: string) =>
  act(() => {
    [...host.querySelectorAll("button")].find((b) => b.textContent?.includes(label))?.click();
  });

beforeEach(() => {
  store.prefs = { sourcesSeen: {}, sourcesCleared: {}, hiddenSources: [] };
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

it("Clear takes 38 waiting workflows off the bell; one more brings back 1", () => {
  show(38);
  expect(count()).toBe("38");
  press("Clear");
  show(38);
  expect(count()).toBeNull();
  show(39);
  expect(count()).toBe("1");
});

it("Hide from bell records the place as hidden", () => {
  show(38);
  press("Hide from bell");
  expect(store.prefs.hiddenSources).toEqual(["workflows"]);
});
