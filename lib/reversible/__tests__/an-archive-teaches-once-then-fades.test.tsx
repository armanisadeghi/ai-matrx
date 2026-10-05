/**
 * THE REVERSIBLE ACTION, through the REAL Toaster, the REAL `lib/toast` clock, the REAL preferences
 * reducer and the REAL announcer (Arman, 2026-10-02): the first archive a person ever makes is a
 * card that teaches and stays; the next ones are guided; after five, plain. ⌘Z undoes the newest
 * one — never while the person is typing in a field — and Escape closes the card without undoing.
 *
 * The use case: Cedar Ridge Physical Therapy's front desk archiving tables they replaced.
 * Doubles: `next/link` (no app router in jsdom), the settings snapshot (network).
 */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { configureStore } from "@reduxjs/toolkit";

jest.mock("next/navigation", () => ({ usePathname: () => "/data" }));
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
jest.mock("@/lib/scoped-config/sessionKnob", () => ({ getSessionKnob: () => undefined }));

import { Toaster } from "@/components/ui/sonner";
import { dismissAllTrackedToasts } from "@/lib/toast";
import { setStoreSingleton } from "@/lib/redux/store-singleton";
import userPreferencesReducer, { initializeUserPreferencesState } from "@/lib/redux/preferences/userPreferencesSlice";
import { announceReversible } from "@/lib/reversible/announceReversible";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let container: HTMLDivElement;
let store: ReturnType<typeof makeStore>;

function loaded() {
  const state = initializeUserPreferencesState({}, true);
  return { ...state, _meta: { ...state._meta, loadStatus: "loaded" as const } };
}

function makeStore() {
  return configureStore({
    reducer: { userPreferences: userPreferencesReducer },
    // A person whose saved preferences have loaded (and hold no history yet).
    preloadedState: { userPreferences: loaded() },
    middleware: (d) => d({ serializableCheck: false, immutableCheck: false }),
  });
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const faked = () => typeof (setTimeout as unknown as { clock?: unknown }).clock === "object" || jest.isMockFunction(setTimeout);
async function settle() {
  for (let i = 0; i < 6; i += 1) {
    if (faked()) await act(async () => void jest.advanceTimersByTime(20));
    // Sonner removes a toast two animation frames after a dismissal.
    else await act(async () => wait(20));
  }
}
const notices = () =>
  [...document.querySelectorAll<HTMLElement>("[data-reversible-notice]")].filter(
    (n) => n.closest('li[data-sonner-toast]')?.getAttribute("data-removed") !== "true",
  );
const tiers = () => notices().map((n) => n.dataset.reversibleNotice);

beforeEach(async () => {
  store = makeStore();
  setStoreSingleton(store);
  container = document.createElement("div");
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container);
    root.render(<Toaster />);
  });
});

afterEach(async () => {
  await act(async () => {
    dismissAllTrackedToasts();
  });
  await act(async () => root.unmount());
  container.remove();
});

async function archiveTable(name: string, undo: () => Promise<void> = async () => {}) {
  let tier = "";
  await act(async () => {
    tier = announceReversible({
      verb: "archive",
      noun: "table",
      subject: name,
      undo,
      foundAt: { label: "Archived tables", href: "/data", highlight: "archived-tables" },
    }).tier;
  });
  await settle();
  return tier;
}

function closeAll() {
  return act(async () => {
    dismissAllTrackedToasts();
  });
}

it("teaches the first archive, guides the next four, and is plain from the sixth", async () => {
  const seen: string[] = [];
  for (const name of ["Home Exercise Plans", "Intake Forms", "Equipment Loans", "Referral Queue", "Insurance Verifications", "Staff Schedule"]) {
    seen.push(await archiveTable(name));
    await closeAll();
  }
  expect(seen).toEqual(["teach", "guide", "guide", "guide", "guide", "plain"]);
  expect(store.getState().userPreferences.reversible).toEqual({ verbs: { archive: 6 }, pairs: { "archive:table": 6 } });
});

it("the teaching card names where it went, links there, and stays", async () => {
  await archiveTable("Home Exercise Plans");
  const card = notices()[0]!;
  expect(card.dataset.reversibleNotice).toBe("teach");
  expect(card.textContent).toContain("Archived “Home Exercise Plans”");
  expect(card.textContent).toContain("It waits in Archived tables.");
  expect(card.querySelector("a[data-reversible-found]")?.getAttribute("href")).toBe("/data?found=archived-tables");
});

it("the teaching card outlasts the guided window; a guided one leaves on its clock", async () => {
  jest.useFakeTimers({ doNotFake: ["queueMicrotask"] });
  try {
    await archiveTable("Home Exercise Plans");
    await act(async () => {
      jest.advanceTimersByTime(60_000);
    });
    expect(tiers()).toEqual(["teach"]);
    await closeAll();
    await act(async () => {
      jest.advanceTimersByTime(1_000);
    });
    await archiveTable("Intake Forms");
    expect(tiers()).toContain("guide");
    await act(async () => {
      jest.advanceTimersByTime(13_000);
    });
    await act(async () => {
      jest.advanceTimersByTime(1_000);
    });
    expect(tiers()).not.toContain("guide");
  } finally {
    jest.useRealTimers();
  }
});

it("⌘Z undoes the newest announcement, but not while typing in a field", async () => {
  const undone: string[] = [];
  await archiveTable("Home Exercise Plans", async () => void undone.push("Home Exercise Plans"));
  const field = document.createElement("input");
  document.body.appendChild(field);
  field.focus();
  await act(async () => {
    field.dispatchEvent(new KeyboardEvent("keydown", { key: "z", metaKey: true, bubbles: true }));
  });
  expect(undone).toEqual([]);
  field.remove();
  await act(async () => {
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "z", metaKey: true, bubbles: true }));
  });
  await settle();
  expect(undone).toEqual(["Home Exercise Plans"]);
  expect(document.body.textContent).toContain("Restored “Home Exercise Plans”");
});

it("Escape closes the card without undoing", async () => {
  const undone: string[] = [];
  await archiveTable("Home Exercise Plans", async () => void undone.push("x"));
  const card = notices()[0]!;
  await act(async () => {
    card.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  });
  await settle();
  expect(undone).toEqual([]);
  expect(tiers()).toEqual([]);
});

it("an undo the store refuses says why and keeps the way to where it went", async () => {
  await archiveTable("Home Exercise Plans", async () => {
    throw new Error("A column it used was changed since; bring it back from Archived tables.");
  });
  const undo = notices()[0]!.querySelector<HTMLButtonElement>("[data-reversible-undo]")!;
  await act(async () => undo.click());
  await settle();
  const text = document.body.textContent ?? "";
  expect(text).toContain("Couldn’t restore “Home Exercise Plans”");
  expect(text).toContain("A column it used was changed since");
  expect(text).toContain("Open Archived tables");
});
