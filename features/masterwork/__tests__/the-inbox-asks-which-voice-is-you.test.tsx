/**
 * WHEN A THREAD WILL NOT SAY WHICH VOICE IS THE EXPERT'S, THE LANE ASKS.
 *
 * 🚨 THE DEFECT (cold walk 8, 2026-09-17). Shadow-the-inbox refused a pasted
 * thread — "you never replied in it — we read 3 messages in it from
 * dana@millerorchards.com" — whose second half was visibly the person's own
 * answer, and the ONE control it offered was a free-text "Which address is
 * yours?", which cannot help at all when a mail client copies your own reply
 * labelled "me" with no address on it anywhere. The server now returns the
 * VOICES of a thread it could not resolve (`needs_voice_pick`), and this dialog
 * asks with the Meeting Scavenger's own picker — then READS THE THREAD AGAIN
 * with the answer, because a control that moves and changes nothing on screen
 * is the defect wearing a checkbox.
 *
 * This drives the REAL dialog through its own prop contract with a real preview
 * payload. RED against the pre-fix tree: the free-text field is still there, no
 * picker is rendered for a thread that needs one, and no second preview carries
 * `voice_keys`.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { TooltipProvider } from "@/components/ui/tooltip";
import { ShadowInboxDialog } from "../components/detail/ShadowInboxDialog";
import type { Rulebook } from "../types";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }),
});

class NoopResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
(globalThis as { ResizeObserver?: unknown }).ResizeObserver = NoopResizeObserver;

jest.mock("@/features/masterwork/durable-run/useMasterworkRun", () => {
  const actual = jest.requireActual(
    "@/features/masterwork/durable-run/useMasterworkRun",
  );
  return {
    ...actual,
    useMasterworkRun: () => ({
      status: "idle",
      running: false,
      stage: null,
      stages: [],
      error: null,
      runId: null,
      result: null,
      waitMessage: null,
      surfacing: false,
      restoring: false,
      start: jest.fn(),
      launch: jest.fn(),
      reset: jest.fn(),
      fail: jest.fn(),
      retry: jest.fn(),
      dismiss: jest.fn(),
    }),
  };
});

jest.mock("@/features/files/handler/hooks/useFileUpload", () => ({
  useFileUpload: () => ({ upload: jest.fn() }),
}));

jest.mock("@/lib/toast", () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

/** Every API call the dialog makes, in order, as the dialog asked for it. */
const calls: { path: string; body: Record<string, unknown> }[] = [];

jest.mock("@/lib/api/call-api", () => ({
  callApi: (args: { path: string; body?: Record<string, unknown> }) => ({
    __call: args,
  }),
}));

const THREAD_UNRESOLVED = {
  key: "thread-1",
  subject: "Courthouse pallet — straight to shred?",
  participants: [],
  messages: 2,
  last_at: null,
  snippet: "Can we route it straight to the shredder line?",
  you_replied: false,
  has_given_draft: false,
  nothing_to_shadow:
    "we can't tell which of these is you — we read 2 messages in it, from Dana Reyes, me, and nothing in the thread matches admin@admin.com. Pick your voice and we'll shadow it",
  your_words: 0,
  needs_voice_pick: true,
  voices: [
    {
      key: "dana@millerorchards.com",
      name: "Dana Reyes",
      address: "dana@millerorchards.com",
      messages: 1,
      words: 22,
      is_you: false,
    },
    { key: "name:me", name: "me", address: "", messages: 1, words: 41, is_you: true },
  ],
};

/** The same thread once the person has said which voice is theirs. */
const THREAD_RESOLVED = {
  ...THREAD_UNRESOLVED,
  you_replied: true,
  nothing_to_shadow: null,
  your_words: 41,
  needs_voice_pick: false,
};

jest.mock("@/lib/redux/hooks", () => ({
  useAppStore: () => ({
    getState: () => ({}),
    dispatch: (action: { __call?: { path: string; body?: Record<string, unknown> } }) => {
      const call = action?.__call;
      if (!call) return Promise.resolve({});
      calls.push({ path: call.path, body: call.body ?? {} });
      if (call.path === "/masterworks/inbox/connection") {
        return Promise.resolve({ data: { connected: false } });
      }
      const picked = (call.body?.voice_keys as string[] | undefined) ?? [];
      return Promise.resolve({
        data: {
          threads: [picked.includes("name:me") ? THREAD_RESOLVED : THREAD_UNRESOLVED],
          expert_email: "admin@admin.com",
          notes: [],
        },
      });
    },
  }),
  useAppDispatch: () => jest.fn(),
  useAppSelector: () => undefined,
}));

const RULEBOOK = {
  id: "44444444-4444-4444-8444-444444444444",
  organization_id: "55555555-5555-4555-8555-555555555555",
  name: "Fix — sources",
} as unknown as Rulebook;

const PASTE =
  "From: dana@millerorchards.com\nSent: Tuesday, September 16, 2026 9:14 AM\n" +
  "Subject: Courthouse pallet\n\nCan we route it straight to the shredder line?\n\n" +
  "My reply:\nFrom: me\nNo — anything from a government building goes to our manual teardown line.";

function textOf(container: HTMLElement): string {
  return container.textContent ?? "";
}

function clickByText(container: HTMLElement, text: string): void {
  const node =
    [...container.querySelectorAll("button")].find(
      (el) => el.textContent?.trim() === text,
    ) ??
    [...container.querySelectorAll("label")].find(
      (el) => el.textContent?.trim().startsWith(text),
    ) ??
    [...container.querySelectorAll("span, div")].find(
      (el) => el.textContent?.trim() === text,
    );
  if (!node) throw new Error(`no clickable element reading "${text}"`);
  // The control is whatever carries the handler — a button, or the label a
  // checkbox lives inside. Clicking the text node's own span does nothing.
  const target =
    (node as HTMLElement).closest("button") ??
    (node as HTMLElement).closest("label") ??
    (node as HTMLElement);
  target.click();
}

describe("the inbox asks which voice is you", () => {
  let container: HTMLElement;
  let root: Root;

  beforeEach(() => {
    calls.length = 0;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const openAndPreview = async () => {
    await act(async () => {
      root.render(
        <TooltipProvider>
          <ShadowInboxDialog
            open
            onOpenChange={() => {}}
            rulebook={RULEBOOK}
            variant="page"
          />
        </TooltipProvider>,
      );
    });
    const box = container.querySelector("textarea");
    if (!box) throw new Error("the paste door has no box to paste into");
    const setValue = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      "value",
    )?.set;
    await act(async () => {
      setValue?.call(box, PASTE);
      box.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      clickByText(container, "Read the thread");
    });
    // The preview is two awaits deep (dispatch → parse → setState); flush.
    await act(async () => {
      await Promise.resolve();
    });
  };

  it("offers the voices instead of refusing, and re-reads the thread with the answer", async () => {
    await openAndPreview();

    expect(textOf(container)).toContain("Which of these is you?");
    expect(textOf(container)).toContain("Dana Reyes");
    // The voice the whole defect is about: named by the mail client, with no
    // address in the paste at all.
    expect(textOf(container)).toContain("1 messages · 41 words");
    // And it must NOT be dressed as a refusal.
    expect(textOf(container)).not.toContain("Nothing to shadow —");

    await act(async () => {
      clickByText(container, "me");
    });
    await act(async () => {
      await Promise.resolve();
    });

    const previews = calls.filter((c) => c.path === "/masterworks/inbox/preview");
    expect(previews.length).toBe(2);
    expect(previews[1].body.voice_keys).toEqual(["name:me"]);
    // The answer changed what is on screen: the thread now has their reply.
    expect(textOf(container)).toContain("you wrote 41 words");
  });

  it("no longer asks for an address a pasted reply does not carry", async () => {
    await openAndPreview();
    expect(textOf(container)).not.toContain("Which address is yours?");
  });
});
