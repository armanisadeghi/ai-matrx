/**
 * A DIALOG NEVER LOSES TYPED TEXT.
 *
 * The defect (teach-recent-interview trial, 2026-09-15): a non-technical
 * Expert pasted an ~8,000-character interview transcript into the Masterwork
 * "Add rules from a source" dialog. The dialog was torn down underneath her
 * mid-typing — twice — and the text was simply gone: no warning, no error,
 * nothing to recover. She gave up and the trial stopped there with 0 rules.
 *
 * These tests drive the REAL hook in a REAL DOM against the REAL
 * `sessionStorage` jsdom provides. Nothing about the mechanism is faked: the
 * "the dialog vanished" case is an actual React unmount, which is exactly what
 * happened on screen.
 *
 * The forcing property: unmount a field holding a long paste, mount it again,
 * and the text must come back AND the component must be told it was restored.
 * Delete the hook's storage writes and this test goes red.
 */

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

import {
  DRAFT_MIN_CHARS,
  clearDraft,
  readDraft,
  useTextDraft,
  writeDraft,
} from "./useTextDraft";

const LONG_PASTE =
  "Valiante builds his method on the central governor hypothesis: the brain, " +
  "not the muscle, is what limits human performance. We do not rise to the " +
  "level of our goals; we shrink to the level of our systems. ".repeat(4);

type Harness = {
  value: string;
  restored: boolean;
  available: boolean;
  type: (next: string) => void;
  submit: () => void;
};

let latest: Harness | null = null;

function Field({ open, storageKey }: { open: boolean; storageKey: string }) {
  const [value, setValue] = React.useState("");
  const draft = useTextDraft(storageKey, value, setValue, open);
  latest = {
    value,
    restored: draft.restored,
    available: draft.available,
    type: (next: string) => {
      setValue(next);
      draft.remember(next);
    },
    submit: () => draft.forget(),
  };
  if (!open) return null;
  return <textarea readOnly value={value} />;
}

describe("useTextDraft — a dialog never loses typed text", () => {
  let container: HTMLDivElement;
  let root: Root;
  const KEY = "ingest-text:e3b21d77:source";

  beforeEach(() => {
    window.sessionStorage.clear();
    latest = null;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    window.sessionStorage.clear();
  });

  /** Mount the field, as opening the dialog does. */
  const mount = () => {
    latest = null;
    act(() => {
      root.render(<Field open storageKey={KEY} />);
    });
  };

  /**
   * DESTROY the field — a real React unmount, which is exactly what happened
   * on screen when the sibling key collision tore the dialog's region down.
   */
  const destroy = () => {
    act(() => {
      root.render(null);
    });
  };

  it("gives a long paste back after the dialog is destroyed underneath the user", () => {
    mount();
    act(() => latest!.type(LONG_PASTE));
    expect(latest!.value).toBe(LONG_PASTE);

    // THE EXACT EVENT: the dialog's subtree is destroyed while the user is
    // typing in it. Before this hook existed, this is where the work died.
    destroy();
    expect(container.querySelector("textarea")).toBeNull();

    // She reopens the dialog.
    mount();
    expect(latest!.value).toBe(LONG_PASTE);
    // And is TOLD it came back — a silent restore is its own kind of lie.
    expect(latest!.restored).toBe(true);
  });

  it("drops the draft only once the server has accepted the text", () => {
    mount();
    act(() => latest!.type(LONG_PASTE));
    expect(readDraft(KEY)).toBe(LONG_PASTE);

    act(() => latest!.submit());
    expect(readDraft(KEY)).toBeNull();

    destroy();
    mount();
    expect(latest!.value).toBe("");
    expect(latest!.restored).toBe(false);
  });

  it("never overwrites something the user can already see", () => {
    writeDraft(KEY, LONG_PASTE);
    mount();
    act(() => latest!.type("something I am typing right now, at length, on purpose"));
    // Reopening with live content present must not clobber it with the draft.
    const typed = latest!.value;
    act(() => {
      root.render(<Field open storageKey={KEY} />);
    });
    expect(latest!.value).toBe(typed);
  });

  it("says so, instead of pretending, when the browser refuses to keep a draft", () => {
    const setItem = jest
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new DOMException("QuotaExceededError");
      });
    try {
      mount();
      act(() => latest!.type(LONG_PASTE));
      // Not a silent no-op the caller believes is working.
      expect(latest!.available).toBe(false);
    } finally {
      setItem.mockRestore();
    }
  });

  it("does not keep a scrap too short to be worth restoring", () => {
    const short = "x".repeat(DRAFT_MIN_CHARS - 1);
    writeDraft(KEY, short);
    expect(readDraft(KEY)).toBeNull();
    clearDraft(KEY);
  });
});
