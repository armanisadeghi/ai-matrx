/** @jest-environment jsdom */
//
// ⌘K TABLES (lane DATA-HOME-3C): the bar a person meets on every page lists her tables, forms and
// dashboards by title, each with its organization, from the data home's one cached door, and ↵ /
// a click opens the row's own address. The knowledge runner is the shared sample runner; the
// tables source is doubled with realistic data-home rows (the home's own fixtures) and the home's
// REAL ranking (`rankDataHomeTables` → `scoreRow`), so `harbr` finds Harbor here as on the page.
//
// Asserted through the REAL component tree (design-system CommandDialog +
// cmdk, the real query-text parser, the real hub URL codec, the real Tools
// grid tiles). Only the edges are doubled: the search runner is the shared
// sample-data runner (`createFixtureRunner`, which applies the query the way
// the service promises to), the router records pushes, and Redux hooks are
// inert. What each test proves is what a person would see or cause.

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const push = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: jest.fn(), back: jest.fn(), prefetch: jest.fn() }),
}));
jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => jest.fn(),
  useAppStore: () => ({ getState: () => ({}) }),
  useAppSelector: () => false,
}));
jest.mock("@/lib/toast", () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

import KnowledgeCommandBar from "../KnowledgeCommandBar";
import { createFixtureRunner } from "@/features/knowledge/api/knowledgeSearchFixture";
import type { KnowledgeSearchRunner } from "@/features/knowledge/api/knowledgeSearch";

class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO;
Element.prototype.scrollIntoView = jest.fn();
if (!window.matchMedia) {
  window.matchMedia = ((q: string) => ({
    matches: false,
    media: q,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

import * as tablesSource from "@/features/unified-data/home/dataHomeTablesSource";
import { corpus } from "@/features/unified-data/home/__tests__/fixtures";
import type { TablesModule } from "../KnowledgeCommandBar";
import type { DataHomeRow } from "@/features/unified-data/home/dataHomeRows";

let container: HTMLDivElement;
let root: Root;
let runner: jest.MockedFunction<KnowledgeSearchRunner>;

function tablesModule(read: () => Promise<DataHomeRow[]>): TablesModule {
  return {
    ...tablesSource,
    dataHomeTables: (userId) => tablesSource.dataHomeTables(userId, { read }),
  };
}

function mount(mod: TablesModule) {
  act(() => {
    root.render(
      <KnowledgeCommandBar isOpen onClose={jest.fn()} callbackGroupId={null} runner={runner} tablesModule={mod} />,
    );
  });
}

const input = () => document.querySelector<HTMLInputElement>('[data-testid="knowledge-command-input"]')!;
const tablesGroup = () =>
  (document.querySelector('[data-testid="command-bar-tables"]')?.closest("[cmdk-group]") as HTMLElement | null) ?? null;

function type(value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    setter.call(input(), value);
    input().dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function settle(ms = 250) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

beforeEach(() => {
  push.mockClear();
  tablesSource.forgetDataHomeTables();
  runner = jest.fn(createFixtureRunner());
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("⌘K lists tables by title, each with its organization", () => {
  it("a title lists under Tables with `<Organization> · <Kind>`, and selecting it opens its address", async () => {
    const rows = corpus();
    mount(tablesModule(async () => rows));
    await settle();
    type("roof inspections");
    await settle();
    const group = tablesGroup();
    expect(group).not.toBeNull();
    const items = Array.from(group!.querySelectorAll<HTMLElement>("[cmdk-item]"));
    expect(items[0]!.textContent).toContain("Roof Inspections");
    expect(items[0]!.textContent).toContain("Titanium Roofing · Table");
    act(() => items[0]!.click());
    const roof = rows.find((r) => r.name === "Roof Inspections")!;
    expect(push).toHaveBeenCalledWith(roof.href);
  });

  it("the same name in two organizations is two hits, each naming its organization", async () => {
    mount(tablesModule(async () => corpus()));
    await settle();
    type("client intake");
    await settle();
    const text = tablesGroup()!.textContent ?? "";
    expect(text).toContain("Harbor Dental Group · Form");
    expect(text).toContain("Titanium Roofing · Form");
  });

  it("a one-letter typo still finds the table (the home's own ranking)", async () => {
    mount(tablesModule(async () => corpus()));
    await settle();
    type("harbr hygiene");
    await settle();
    expect(tablesGroup()!.textContent).toContain("Harbor Hygiene Schedule");
  });

  it("nothing typed: no Tables section; nothing found: says so in the budget", async () => {
    mount(tablesModule(async () => corpus()));
    await settle();
    expect(tablesGroup()).toBeNull();
    type("zebra crossing permits");
    await settle();
    expect(tablesGroup()!.textContent).toContain("Nothing in Tables for 'zebra crossing permits'");
  });

  it("a refused read shows the store's words, never an empty Tables", async () => {
    const quiet = jest.spyOn(console, "error").mockImplementation(() => undefined);
    mount(tablesModule(async () => Promise.reject(new Error("Could not read tables. permission denied for function data_home"))));
    await settle();
    type("roof");
    await settle();
    const group = tablesGroup()!;
    expect(group.querySelector("[role='alert']")?.textContent).toContain("permission denied for function data_home");
    expect(group.textContent).not.toContain("Nothing in Tables");
    expect(quiet).toHaveBeenCalled();
    quiet.mockRestore();
  });
});

describe("the cached door", () => {
  it("one read per fresh window; an older answer is offered at once while a fresh read runs", async () => {
    const read = jest.fn(async () => corpus());
    const first = tablesSource.dataHomeTables("u1", { read, now: 0 });
    expect(first.now).toBeNull();
    await first.next;
    const again = tablesSource.dataHomeTables("u1", { read, now: 1_000 });
    expect(read).toHaveBeenCalledTimes(1);
    expect(again.now?.length).toBe(corpus().length);
    const later = tablesSource.dataHomeTables("u1", { read, now: tablesSource.DATA_HOME_TABLES_FRESH_MS + 1 });
    expect(read).toHaveBeenCalledTimes(2);
    expect(later.now?.length).toBe(corpus().length);
  });

  it("a failed read is never cached as empty; another person never sees the first one's rows", async () => {
    const fail = jest.fn(async (): Promise<DataHomeRow[]> => {
      throw new Error("Could not read tables. timeout");
    });
    await expect(tablesSource.dataHomeTables("u1", { read: fail, now: 0 }).next).rejects.toThrow("timeout");
    const ok = jest.fn(async () => corpus());
    await tablesSource.dataHomeTables("u1", { read: ok, now: 10 }).next;
    expect(ok).toHaveBeenCalledTimes(1);
    const other = tablesSource.dataHomeTables("u2", { read: ok, now: 20 });
    expect(other.now).toBeNull();
    expect(ok).toHaveBeenCalledTimes(2);
  });
});
