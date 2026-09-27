/** @jest-environment jsdom */
//
// ⌘K "Search your knowledge" — the bar a person meets on every page.
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
import { createFixtureRunner, FIXTURE_HITS } from "@/features/knowledge/api/knowledgeSearchFixture";
import type { KnowledgeSearchRunner } from "@/features/knowledge/api/knowledgeSearch";
import { registerActiveAttachTarget } from "../attachTarget";
import { TOOLS_GRID_TILES } from "@/features/window-panels/tools-grid/toolsGridTiles";

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

let container: HTMLDivElement;
let root: Root;
let runner: jest.MockedFunction<KnowledgeSearchRunner>;

function mount(props: Partial<React.ComponentProps<typeof KnowledgeCommandBar>> = {}) {
  act(() => {
    root.render(
      <KnowledgeCommandBar
        isOpen
        onClose={jest.fn()}
        callbackGroupId={null}
        runner={runner}
        {...props}
      />,
    );
  });
}

const input = () =>
  document.querySelector<HTMLInputElement>('[data-testid="knowledge-command-input"]')!;
const bar = () => document.querySelector<HTMLElement>('[data-testid="knowledge-command-bar"]')!;
const text = () => bar().textContent ?? "";

function type(value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    setter.call(input(), value);
    input().dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function key(k: string, mods: { meta?: boolean } = {}) {
  act(() => {
    input().dispatchEvent(
      new KeyboardEvent("keydown", { key: k, metaKey: mods.meta ?? false, bubbles: true, cancelable: true }),
    );
  });
}

/** Past the ~120 ms as-you-type debounce and the fixture's streamed lanes. */
async function settle(ms = 250) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

beforeEach(() => {
  push.mockClear();
  runner = jest.fn(createFixtureRunner({ failSections: ["records"] }));
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("operators become removable chips", () => {
  it("lifts @, type:, # and a date phrase into chips once complete, and sends them as the one query", async () => {
    mount();
    type("budget @Ava type:pdf #grant-2026 last week ");
    await settle();

    const chips = Array.from(document.querySelectorAll('[data-testid="knowledge-chip"]')).map(
      (c) => c.textContent,
    );
    expect(chips).toEqual(["Last week", "@Ava", "Uploaded documents", "#grant-2026"]);
    expect(input().value).toBe("budget ");

    const lastQuery = runner.mock.calls.at(-1)![0];
    expect(lastQuery.text).toBe("budget");
    // `@Ava` travels as a mention; the live runner resolves it (mentions.test.ts).
    expect(lastQuery.source_kinds).toEqual(["cld_file"]);
    expect(lastQuery.within).toEqual([
      { type: "mention", name: "Ava" },
      { type: "tag", name: "grant-2026" },
    ]);
    expect(lastQuery.date).toEqual({ field: "updated", relative: "last_week" });
    expect(runner.mock.calls.at(-1)![1]?.asYouType).toBe(true);
  });

  it("does not chip an operator still being typed, and Backspace on an empty box removes the last chip", async () => {
    mount();
    type("@Av");
    expect(document.querySelectorAll('[data-testid="knowledge-chip"]')).toHaveLength(0);
    type("#tag ");
    expect(document.querySelectorAll('[data-testid="knowledge-chip"]')).toHaveLength(1);
    type("");
    key("Backspace");
    expect(document.querySelectorAll('[data-testid="knowledge-chip"]')).toHaveLength(0);
  });
});

describe("typed sections from a streamed search", () => {
  it("renders each section with its count, an honest empty sentence, and a failed lane with Retry", async () => {
    mount();
    type("grant");
    await settle();

    const t = text();
    expect(t).toContain("Sources");
    expect(t).toContain("NSF grant solicitation 2026");
    expect(t).toContain("Chats");
    expect(t).toContain("Drafting the grant narrative");
    expect(t).toContain("Nothing in Files for 'grant'");
    expect(t).toContain("The Records lane did not answer (sample failure).");
    expect(t).toContain("Retry Records");
  });
});

describe("a type chip narrows the search", () => {
  it("leaves sections the query narrowed away out, instead of calling them failed", async () => {
    // A runner that, like the service, answers only the sections a type: chip asks for.
    runner = jest.fn(async (query, options) => {
      const notes = {
        key: "notes" as const,
        label: "Notes",
        count: 1,
        items: [{ entity: "note", id: "n-1", title: "Photosynthesis" }],
        next_cursor: null,
      };
      options?.onSection?.(notes);
      return query.types?.includes("note") ? [notes] : [notes];
    });
    mount();
    type("photosynthesis type:note ");
    await settle();
    expect(text()).toContain("Photosynthesis");
    expect(text()).not.toContain("did not answer");
    expect(text()).not.toContain("Sources");
  });
});

describe("keyboard flow", () => {
  it("↵ opens the selected result at its own route", async () => {
    mount();
    type("Grant budget");
    await settle();
    const note = FIXTURE_HITS.find((h) => h.title === "Grant budget assumptions")!;
    key("Enter");
    await settle(20);
    expect(push).toHaveBeenCalledWith(`/notes?active=${note.id}`);
  });

  it("⌘↵ opens the hub in Ask mode with the query", async () => {
    mount();
    type("battery aging");
    key("Enter", { meta: true });
    await settle(20);
    expect(push).toHaveBeenCalledWith("/knowledge?q=battery+aging&mode=ask");
  });

  it("⌘K on the selected result opens its action panel; Attach appears only when a chat is open", async () => {
    mount();
    type("Grant budget");
    await settle();
    key("k", { meta: true });
    expect(text()).toContain("Actions for “Grant budget assumptions”");
    expect(text()).toContain("Open");
    expect(text()).toContain("File under…");
    expect(text()).toContain("Copy link");
    expect(text()).not.toContain("Attach to this chat");

    act(() => root.unmount());
    root = createRoot(container);
    const attach = jest.fn().mockResolvedValue(true);
    const unregister = registerActiveAttachTarget({
      label: "Attach to this chat",
      accepts: () => true,
      attach,
    });
    try {
      mount();
      type("Grant budget");
      await settle();
      key("k", { meta: true });
      expect(text()).toContain("Attach to this chat");
    } finally {
      unregister();
    }
  });

  it("⌘3 narrows to Chats and ⌘0 shows every section again", async () => {
    mount();
    type("grant");
    await settle();
    key("3", { meta: true });
    expect(text()).toContain("Only Chats");
    expect(text()).toContain("Drafting the grant narrative");
    expect(text()).not.toContain("NSF grant solicitation 2026");
    key("0", { meta: true });
    expect(text()).toContain("NSF grant solicitation 2026");
  });
});

describe("the window launcher lives on as commands", () => {
  it("lists launcher tiles as commands and runs them by name", async () => {
    mount();
    const tile = TOOLS_GRID_TILES.find(
      (t) => !t.gate && t.category !== "admin" && t.category !== "creator" && t.category !== "dupes",
    )!;
    type(tile.label);
    await settle();
    expect(text()).toContain("Commands");
    expect(text()).toContain(tile.label);
    key("9", { meta: true });
    expect(text()).toContain("Only Commands");
  });
});
