/**
 * THE CHAT LENS TREE READS THE PAGED TREE (lane SCOPES-TREE-PAGED).
 *
 * While the whole tree is not in, the lens must still behave as it did over the whole tree:
 *   - a type row carries its count (the store's count), or an honest dash while it is counted;
 *   - opening a type asks for that type's scopes; a type with more than one page offers the rest;
 *   - a search finds a scope that is in no loaded page (the server searches every scope).
 */
import type { Scope } from "@ai-matrx/records/scopes";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ContextTree } from "@/features/scopes/components/active-context/context-tree/ContextTree";
import type { ContextTreeData } from "@/features/scopes/components/active-context/context-tree/shared";
import type {
  OrgNode,
} from "@/features/scopes/types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// jsdom has no layout: the tree scrolls its active row into view.
Element.prototype.scrollIntoView = function scrollIntoView() {};

const ORG = "org-castellano";
const MATTERS = "type-matters";
const reyes = { id: "scope-reyes", scope_type_id: MATTERS, organization_id: ORG, name: "Reyes v. Pinnacle" } as Scope;
const doe = { id: "scope-doe", scope_type_id: MATTERS, organization_id: ORG, name: "Doe v. CSV" } as Scope;

function data(over: Partial<NonNullable<ContextTreeData["paged"]>> = {}, loaded: Scope[] = []): ContextTreeData {
  const org = {
    id: ORG, name: "Castellano & Reyes", slug: "castellano-reyes", projects: [],
    scope_types: [{ id: MATTERS, organization_id: ORG, label_singular: "Matter", label_plural: "Matters", icon: "folder", color: "", scopes: loaded }],
  } as unknown as OrgNode;
  return {
    organizations: [org], treeStatus: "ready", treeError: null,
    projects: [], projectsStatus: "idle", loadProjects: jest.fn(),
    tasks: [], tasksStatus: "idle", loadTasks: jest.fn(),
    itemsByType: {}, itemsLoading: new Set(), loadItems: jest.fn(),
    paged: {
      whole: false, counts: {}, pages: {},
      loadTypeScopes: jest.fn(), loadAll: jest.fn(), search: jest.fn(), searchHits: () => null,
      ...over,
    },
  };
}
const empty = { scopeIds: [], scopeTypeIds: [], orgIds: [], projectIds: [], taskIds: [], itemRefs: [] };

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.useRealTimers();
});

function render(d: ContextTreeData) {
  act(() => root.render(<ContextTree data={d} selection={empty as never} onChange={() => {}} />));
}
const typeRow = () => [...container.querySelectorAll('[role="treeitem"]')].find((e) => e.textContent?.includes("Matters")) as HTMLElement;

it("a type row shows an honest dash while counted, then the store's count", () => {
  render(data());
  expect(typeRow().textContent).toContain("—");
  render(data({ counts: { [MATTERS]: 616 } }));
  expect(typeRow().textContent).toContain("616");
});

it("opening a type asks for its scopes", () => {
  const d = data({ counts: { [MATTERS]: 616 } });
  render(d);
  act(() => typeRow().click());
  expect(d.paged!.loadTypeScopes).toHaveBeenCalledWith(MATTERS);
});

it("a type with more than one page offers the rest, and the offer asks for the next page", () => {
  const d = data({ counts: { [MATTERS]: 616 }, pages: { [MATTERS]: { status: "partial", error: null } } }, [reyes]);
  render(d);
  act(() => typeRow().click());
  const more = [...container.querySelectorAll('[role="treeitem"]')].find((e) => e.textContent?.includes("Show more")) as HTMLElement;
  expect(more.textContent).toContain("1 of 616");
  act(() => more.click());
  expect(d.paged!.loadTypeScopes).toHaveBeenCalledWith(MATTERS, true);
});

it("a search asks the server and shows a scope no loaded page holds", () => {
  jest.useFakeTimers();
  const d = data({ counts: { [MATTERS]: 2 } }, [reyes]);
  render(d);
  const input = container.querySelector("input") as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    setter.call(input, "doe");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  act(() => jest.advanceTimersByTime(250));
  expect(d.paged!.search).toHaveBeenCalledWith("doe");
  render({ ...d, paged: { ...d.paged!, searchHits: () => ({ status: "ready", scopes: [doe] }) } });
  expect(container.textContent).toContain("Doe v. CSV");
});
