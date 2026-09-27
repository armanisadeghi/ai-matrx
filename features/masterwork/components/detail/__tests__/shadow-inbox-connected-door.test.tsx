/**
 * THE CONNECTED DOOR IS ABSENT, NOT DEAD.
 *
 * Shadow-the-inbox has two doors: paste/upload a thread (always available) and
 * "from your inbox" (needs a mailbox connected with permission to read
 * replies). That permission is Google's RESTRICTED `gmail.readonly` scope,
 * which this platform has built its reader for and has NOT been granted, so
 * for every user today the answer is "no".
 *
 * The temptation, and the defect this suite refuses, is to render the picker
 * anyway and grey it out, or to render it and fail on click. Law 4, NOTHING
 * FAILS SILENTLY / a screen never lies: a control is ABSENT or HONEST, never
 * dead, disabled-looking, or wearing a false sentence. So when the server says
 * `connected: false` there is no third door at all — and one sentence saying
 * what is missing and what to do instead.
 *
 * This drives the REAL `ShadowInboxDialog` with only the durable run, the
 * uploader and the API transport stubbed; the connection probe is the real
 * `callApi` call, answered the way the real endpoint answers.
 *
 * Proven red before green (2026-09-15), each independently:
 *
 * * render the "From your inbox" button unconditionally → "renders no inbox
 *   door" fails.
 * * drop the `connection.howToConnect` paragraph → "says how to connect"
 *   fails.
 * * hide the door even when connected → "offers the inbox door once a mailbox
 *   can be read" fails.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { TooltipProvider } from "@/components/ui/tooltip";
import type { UseFileUploadResult } from "@/features/files/handler/hooks/useFileUpload";

import { ShadowInboxDialog } from "../ShadowInboxDialog";
import type { Rulebook } from "../../../types";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

/** What the server answers the connection probe with, per test. */
const connectionAnswer: { data: Record<string, unknown> } = { data: {} };
const dispatched: { path: string }[] = [];
let holdConnectionProbe = false;
let resolveConnection: ((value: { data: Record<string, unknown> }) => void) | null = null;

// The platform's shared textarea reaches for the Redux store and the
// transcription-cleanup assist, neither of which is this door's code (same
// rationale as the monologue door's stubbed recorder). Nothing about the
// connected door lives inside it.
jest.mock("@/components/official/ProTextarea", () => ({
  ProTextarea: (props: Record<string, unknown>) => {
    const { enableTextStats: _stats, ...rest } = props;
    return <textarea {...(rest as object)} />;
  },
}));

jest.mock("@/lib/redux/hooks", () => ({
  useAppStore: () => ({
    dispatch: (action: { __path?: string }) => {
      const path = action.__path ?? "";
      dispatched.push({ path });
      if (path === "/masterworks/inbox/connection") {
        if (holdConnectionProbe) {
          return new Promise<{ data: Record<string, unknown> }>((resolve) => {
            resolveConnection = resolve;
          });
        }
        return Promise.resolve({ data: connectionAnswer.data });
      }
      return Promise.resolve({ data: {} });
    },
  }),
}));

jest.mock("@/lib/api/call-api", () => ({
  callApi: (opts: { path: string }) => ({ __path: opts.path }),
}));

const launch = jest.fn();
jest.mock("../../../durable-run/useMasterworkRun", () => ({
  useMasterworkRun: () => ({
    running: false,
    restoring: false,
    cancelling: false,
    stages: [],
    result: null,
    status: "idle",
    error: null,
    runId: null,
    stoppedMessage: null,
    interruption: null,
    launch,
    reset: jest.fn(),
    cancel: jest.fn(),
    fail: jest.fn(),
    retry: jest.fn(),
    waitMessage: null,
  }),
}));

jest.mock("../../../durable-run/useRunResultOnce", () => ({
  useRunResultOnce: () => {},
}));

const upload = jest.fn(
  async (..._args: Parameters<UseFileUploadResult["upload"]>) => ({
    fileId: "file-abc",
  }),
);
jest.mock("@/features/files/handler/hooks/useFileUpload", () => ({
  useFileUpload: () => ({ upload }),
}));

jest.mock("@/lib/toast", () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const RULEBOOK = {
  id: "44444444-4444-4444-8444-444444444444",
  name: "How I quote a pallet job",
  organization_id: "5dc930e9-bd65-44a1-8369-af773f6e1a5b",
} as unknown as Rulebook;

const NOT_CONNECTED_SENTENCE =
  "Connect a Google mailbox with permission to read your replies, and this " +
  "lane can pick the threads for you.";
const SITTING_KEY = `matrx.masterwork.shadow-inbox.v1:${RULEBOOK.id}`;

let container: HTMLDivElement;
let root: Root;

async function mount() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <TooltipProvider>
        <ShadowInboxDialog
          variant="page"
          open
          onOpenChange={() => {}}
          rulebook={RULEBOOK}
        />
      </TooltipProvider>,
    );
  });
  // Let the connection probe's promise settle and re-render unless this test
  // deliberately holds it while a person chooses another door.
  if (!holdConnectionProbe) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

function text(): string {
  return document.body.textContent ?? "";
}

function buttons(): HTMLButtonElement[] {
  return [...document.querySelectorAll("button")] as HTMLButtonElement[];
}

async function chooseConnectedDoor() {
  const button = buttons().find((node) =>
    (node.textContent ?? "").includes("From your inbox"),
  );
  if (!button) throw new Error("Connected inbox door was not rendered.");
  await act(async () => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

beforeEach(() => {
  dispatched.length = 0;
  launch.mockClear();
  holdConnectionProbe = false;
  resolveConnection = null;
  window.localStorage.clear();
});

afterEach(() => {
  if (!root) return;
  act(() => root.unmount());
  container.remove();
});

describe("the shadow-inbox connected door", () => {
  it("asks the server before deciding anything", async () => {
    connectionAnswer.data = { connected: false, how_to_connect: NOT_CONNECTED_SENTENCE };
    await mount();
    expect(dispatched.map((d) => d.path)).toContain(
      "/masterworks/inbox/connection",
    );
  });

  it("renders NO inbox door when no mailbox can be read", async () => {
    connectionAnswer.data = { connected: false, how_to_connect: NOT_CONNECTED_SENTENCE };
    await mount();
    const labels = buttons().map((b) => b.textContent ?? "");
    expect(labels.some((l) => l.includes("From your inbox"))).toBe(false);
    // And nothing disabled-looking is standing in for it either. (The
    // primary action IS disabled here — no thread is pasted yet — but that is
    // a `GatedActionButton`, which states its own reason; a greyed-out
    // "From your inbox" would state nothing and would be the lie.)
    const dead = buttons().filter(
      (b) => b.disabled && /inbox|connect|mailbox/i.test(b.textContent ?? ""),
    );
    expect(dead.map((b) => b.textContent)).toEqual([]);
  });

  it("says how to connect instead of leaving a gap", async () => {
    connectionAnswer.data = { connected: false, how_to_connect: NOT_CONNECTED_SENTENCE };
    await mount();
    expect(text()).toContain(
      "Connect a Google mailbox with permission to read your replies",
    );
  });

  it("still offers the doors that DO work", async () => {
    connectionAnswer.data = { connected: false, how_to_connect: NOT_CONNECTED_SENTENCE };
    await mount();
    const labels = buttons().map((b) => b.textContent ?? "");
    expect(labels.some((l) => l.includes("Paste a thread"))).toBe(true);
    expect(labels.some((l) => l.includes("Upload an export"))).toBe(true);
  });

  it("moves a restored connected sitting onto paste when the server closes Gmail", async () => {
    connectionAnswer.data = { connected: false, how_to_connect: NOT_CONNECTED_SENTENCE };
    window.localStorage.setItem(
      SITTING_KEY,
      JSON.stringify({
        savedAt: Date.now(),
        door: "connected",
        sourceNote: "Northline Friday pickup reply",
        expertEmail: "admin@admin.com",
        text: "We can collect the decommissioned equipment after ten with a signed chain of custody.",
      }),
    );

    await mount();

    expect(container.querySelector("#shadow-inbox-text")).toBeTruthy();
    expect(text()).not.toContain("When you select Shadow my last");
    expect(
      buttons().some((node) =>
        (node.textContent ?? "").includes("Shadow my last"),
      ),
    ).toBe(false);
  });

  it("keeps an Upload choice made before an unavailable status response", async () => {
    connectionAnswer.data = { connected: false, how_to_connect: NOT_CONNECTED_SENTENCE };
    holdConnectionProbe = true;

    await mount();
    const uploadDoor = buttons().find((node) =>
      (node.textContent ?? "").includes("Upload an export"),
    );
    await act(async () => {
      uploadDoor?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await act(async () => {
      resolveConnection?.({ data: connectionAnswer.data });
    });

    expect(container.querySelector('input[type="file"]')).toBeTruthy();
    expect(container.querySelector("#shadow-inbox-text")).toBeNull();
  });

  it("offers the inbox door once a mailbox can be read", async () => {
    connectionAnswer.data = {
      connected: true,
      account_email: "admin@admin.com",
      connection_id: "11111111-1111-1111-1111-111111111111",
      days_back_default: 30,
    };
    await mount();
    const labels = buttons().map((b) => b.textContent ?? "");
    expect(labels.some((l) => l.includes("From your inbox"))).toBe(true);
    expect(text()).toContain("admin@admin.com");
    // The how-to-connect sentence is gone — it would be a lie now.
    expect(text()).not.toContain(
      "Connect a Google mailbox with permission to read your replies",
    );
  });

  it("discloses the bounded Rulebook and model processing before the run", async () => {
    connectionAnswer.data = {
      connected: true,
      account_email: "admin@admin.com",
      connection_id: "11111111-1111-1111-1111-111111111111",
      days_back_default: 30,
    };
    await mount();
    await chooseConnectedDoor();

    const screen = text();
    expect(screen).toContain("When you select Shadow my last 30 days, AI Matrx reads");
    expect(screen).toContain("up to 50 threads you replied to");
    expect(screen).toContain("Rulebook raw material");
    expect(screen).toContain("configured AI model provider may process it");
    expect(screen).toContain("Connecting Gmail alone does not start this");
    expect(screen).toContain("does not erase retained Rulebook content");
    const disclosure = [...container.querySelectorAll("p")].find((node) =>
      (node.textContent ?? "").includes("When you select Shadow my last 30 days"),
    );
    const runButton = buttons().find((node) =>
      (node.textContent ?? "").includes("Shadow my last 30 days"),
    );
    expect(disclosure).toBeTruthy();
    expect(runButton).toBeTruthy();
    expect(
      (disclosure?.compareDocumentPosition(runButton as Node) ?? 0) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(launch).not.toHaveBeenCalled();
    await act(async () => {
      runButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(launch).toHaveBeenCalledWith(
      expect.objectContaining({
        connection_id: "11111111-1111-1111-1111-111111111111",
        days_back: 30,
      }),
      "my inbox, last 30 days",
    );
  });
});
