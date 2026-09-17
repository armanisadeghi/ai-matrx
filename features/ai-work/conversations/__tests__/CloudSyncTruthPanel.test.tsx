/**
 * FORCING TESTS for the sync-truth panel on a /work conversation page.
 *
 * THE DEAD FISH (Arman, 2026-09-17): "I have a chat in Claude Code that simply
 * doesn't match what I see in AI Matrx. I cannot figure out what is wrong. A
 * normal DB system would show me that it can't sync, or when it was synced —
 * this thing is a dead fish." The screen this panel joins said, for 741
 * conversations whose delivered-entry ledger is EMPTY and for 655 that are
 * hook-lane partial by design, the same thing: "AI Matrx holds this
 * conversation".
 *
 * So this suite asserts three things and nothing decorative:
 *   1. each verdict code renders the SERVER'S sentence, verbatim;
 *   2. a layer this page cannot read renders an explicit unknown — never a 0,
 *      never blank, never an in-sync claim;
 *   3. the reconcile door shows progress, then the returned verdict — and an
 *      unanswered Mac reads as unreachable, not as agreement.
 *
 * Every expected string is TYPED BY HAND. Nothing is produced by importing the
 * code under test.
 */

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { CloudSyncTruthPanel } from "../components/CloudSyncTruthPanel";

// The repo has no @testing-library/react (see test-utils/renderHook.tsx);
// React 19's own `act` + createRoot is the house harness.
(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/lib/api/typed-client", () => ({ apiPost: jest.fn() }));

/**
 * The Mac-side door. Mocked WHOLE because the real module opens a Supabase
 * Realtime channel at import. `MATRX_LOCAL_UNREACHABLE_SENTENCE` is the real
 * module's constant typed out by hand — its VALUE is pinned by the assertion
 * in the "offline sentence" block below, which imports the real module.
 */
jest.mock("@/features/ai-work/lib/matrxLocalRuntime", () => ({
  MATRX_LOCAL_UNREACHABLE_SENTENCE:
    "Matrx Local did not answer. Make sure the desktop app is running and signed in on your Mac.",
  readLocalRuntimeCapability: jest.fn(),
  reconcileCodingSession: jest.fn(),
}));

jest.mock("@/components/dialogs/confirm/ConfirmDialogHost", () => ({
  confirm: jest.fn(async () => true),
}));

const mockedApiPost = (
  jest.requireMock("@/lib/api/typed-client") as { apiPost: jest.Mock }
).apiPost;
const mockedCapability = (
  jest.requireMock("@/features/ai-work/lib/matrxLocalRuntime") as {
    readLocalRuntimeCapability: jest.Mock;
  }
).readLocalRuntimeCapability;
const mockedReconcile = (
  jest.requireMock("@/features/ai-work/lib/matrxLocalRuntime") as {
    reconcileCodingSession: jest.Mock;
  }
).reconcileCodingSession;
const mockedConfirm = (
  jest.requireMock("@/components/dialogs/confirm/ConfirmDialogHost") as {
    confirm: jest.Mock;
  }
).confirm;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function text(): string {
  return container?.textContent ?? "";
}

async function render(): Promise<void> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  container = host;
  await act(async () => {
    const created = createRoot(host);
    root = created;
    created.render(<CloudSyncTruthPanel providerSessionId="session-1" />);
  });
}

function unmount(): void {
  if (root) act(() => root!.unmount());
  container?.remove();
  container = null;
  root = null;
}

/** A full diagnosis; each case overrides only the fields it is about. */
function diagnosis(overrides: Record<string, unknown> = {}) {
  return {
    provider_session_id: "session-1",
    session_present: true,
    conversation_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    fidelity: "native",
    status: "active",
    last_seen_at: "2026-09-17T10:00:00Z",
    entries: 55,
    projected_entries: 55,
    skipped_entries: 0,
    pending_entries: 0,
    error_entries: 0,
    projection_errors: [],
    last_entry_at: "2026-09-17T10:00:00Z",
    last_entry_id: "entry-9",
    messages: 2,
    last_position: 2,
    last_message_at: "2026-09-17T10:00:00Z",
    cloud_verdict: "partial_by_design",
    cloud_sentence: "…",
    cloud_remedy: null,
    ...overrides,
  };
}

function serverAnswers(diag: Record<string, unknown> | null): void {
  mockedApiPost.mockResolvedValue({
    data: diag === null ? {} : { diagnosis: diag },
    meta: {},
  });
}

function reconcileButton(): HTMLButtonElement {
  const button = [...(container?.querySelectorAll("button") ?? [])].find(
    (candidate) => /Reconcil|Reaching your Mac/.test(candidate.textContent ?? ""),
  );
  if (!button) throw new Error("the reconcile button is not on the screen");
  return button as HTMLButtonElement;
}

beforeEach(() => {
  mockedApiPost.mockReset();
  mockedCapability.mockReset();
  mockedReconcile.mockReset();
  mockedConfirm.mockReset();
  mockedConfirm.mockResolvedValue(true);
});

afterEach(() => {
  unmount();
});

describe("the offline sentence has ONE wording", () => {
  // RED WHEN: `MATRX_LOCAL_UNREACHABLE_SENTENCE` is reworded in
  // matrxLocalRuntime.ts. This is the only offline signal that exists — there
  // is no presence table for the desktop app — and two screens must not
  // describe the same silence differently. This assertion is what pins the
  // hand-typed copy used by the module mock above.
  it("is the sentence the bridge already used on timeout", () => {
    const real = jest.requireActual(
      "@/features/ai-work/lib/matrxLocalRuntime",
    ) as { MATRX_LOCAL_UNREACHABLE_SENTENCE: string };
    expect(real.MATRX_LOCAL_UNREACHABLE_SENTENCE).toBe(
      "Matrx Local did not answer. Make sure the desktop app is running and signed in on your Mac.",
    );
  });
});

describe("every verdict code renders the server's own sentence", () => {
  // Each case: the code, and the §2 sentence with its substitutions filled in.
  // RED WHEN: the panel stops rendering `cloud_sentence`, re-words it, shortens
  // it, or replaces a code's line with a label of its own.
  const cases: Array<[string, string, string | null]> = [
    [
      "partial_by_design",
      "AI Matrx has the shape of this conversation — the 55 prompts and tool calls its hooks recorded, projected into 2 messages — not the 3526-entry transcript. Hook capture is a summary by design.",
      "Reconcile to import the full transcript file into AI Matrx.",
    ],
    [
      "behind_local",
      "AI Matrx has a conversation for this session but no record of a single delivered entry, so none of the 3526 entries in your local transcript are in it. The 2 messages you see there came from the run itself, not from this transcript.",
      "Reconcile to deliver the transcript.",
    ],
    [
      "behind_cloud",
      "AI Matrx received all 55 entries but 36 never became messages: unsupported_event.",
      "Reconcile to ask the server to project them again.",
    ],
    [
      "mirror_stale",
      "AI Matrx has 2 messages for this conversation; this Mac's local copy has 0 and was last pulled 3 days ago.",
      "Reconcile to pull the rest onto this Mac.",
    ],
    [
      "diverged",
      "AI Matrx holds 12 entries that are no longer in your local transcript — Claude Code rewrote the file, which compaction does. AI Matrx has the longer, older record; the local file is now the short one.",
      null,
    ],
    [
      "quarantined",
      "148 entries are held back permanently: AI Matrx already has this session under a different Claude account, and a delivery from this account cannot replace it.",
      "Nothing to do — the conversation is in AI Matrx under that other account. Reconcile will not re-send these.",
    ],
    [
      "not_in_cloud",
      "This conversation is not in AI Matrx at all — no session, no messages. Its 3526 local entries have never been delivered.",
      "Reconcile to send it.",
    ],
  ];

  for (const [code, sentence, remedy] of cases) {
    it(`renders the ${code} sentence exactly`, async () => {
      serverAnswers(
        diagnosis({
          cloud_verdict: code,
          cloud_sentence: sentence,
          cloud_remedy: remedy,
        }),
      );
      await render();
      expect(text()).toContain(sentence);
      if (remedy !== null) expect(text()).toContain(remedy);
    });
  }
});

describe("a layer this page cannot read says so", () => {
  // RED WHEN: the Transcript or "On this Mac" cell is wired to a number, to 0,
  // or to a blank. Those two layers live on the Mac; a browser has never been
  // able to read either one, and rendering 0 there is the dead fish with a
  // count next to it.
  it("names all four counts and marks the two it cannot answer", async () => {
    serverAnswers(
      diagnosis({
        cloud_verdict: "partial_by_design",
        cloud_sentence: "AI Matrx has the shape of this conversation.",
        entries: 55,
        messages: 2,
      }),
    );
    await render();
    for (const label of ["Transcript", "Delivered", "In AI Matrx", "On this Mac"]) {
      expect(text()).toContain(label);
    }
    const cells = [...(container?.querySelectorAll("dl dt") ?? [])]
      .filter((dt) =>
        ["Transcript", "Delivered", "In AI Matrx", "On this Mac"].includes(
          dt.textContent ?? "",
        ),
      )
      .map((dt) => ({
        label: dt.textContent ?? "",
        value: dt.parentElement?.querySelector("dd")?.textContent ?? "",
      }));
    expect(cells).toEqual([
      { label: "Transcript", value: "Only Matrx Local can see this" },
      { label: "Delivered", value: "55" },
      { label: "In AI Matrx", value: "2" },
      { label: "On this Mac", value: "Only Matrx Local can see this" },
    ]);
  });

  // RED WHEN: an unreadable cloud half is allowed to render 0s, or to render
  // nothing at all. The server said nothing — so every count is unknown.
  it("renders no count at all when AI Matrx's own record could not be read", async () => {
    mockedApiPost.mockRejectedValue(new Error("Failed to fetch"));
    await render();
    const values = [...(container?.querySelectorAll("dl dt") ?? [])]
      .filter((dt) =>
        ["Transcript", "Delivered", "In AI Matrx", "On this Mac"].includes(
          dt.textContent ?? "",
        ),
      )
      .map((dt) => dt.parentElement?.querySelector("dd")?.textContent ?? "");
    expect(values).toEqual([
      "Only Matrx Local can see this",
      "Only Matrx Local can see this",
      "Only Matrx Local can see this",
      "Only Matrx Local can see this",
    ]);
    expect(text()).toContain(
      "Cannot tell whether this conversation is in sync: AI Matrx's record of this session could not be read (Failed to fetch).",
    );
    expect(text()).not.toContain("In sync");
  });

  // RED WHEN: the panel is changed to trust `cloud_verdict`. THE anti-dead-fish
  // guard: the server cannot see the transcript, the delivery queue or this
  // Mac's mirror, so its "in sync" is agreement about layers nobody read.
  it("never shows an in-sync claim, even when the server sends one", async () => {
    serverAnswers(
      diagnosis({
        cloud_verdict: "in_sync",
        cloud_sentence:
          "In sync. All 3526 entries are in AI Matrx as 3526 messages; this Mac's copy was last pulled just now.",
      }),
    );
    await render();
    expect(text()).not.toContain("In sync.");
    expect(text()).toContain(
      "Cannot tell whether this conversation is in sync: this Mac's transcript could not be read (not visible from the server).",
    );
  });

  // RED WHEN: projection errors stop naming their codes. "36 entries failed"
  // with no code is a status nobody can act on; `unsupported_event` is.
  it("names every projection error code with its count", async () => {
    serverAnswers(
      diagnosis({
        cloud_verdict: "behind_cloud",
        cloud_sentence:
          "AI Matrx received all 55 entries but 36 never became messages: unsupported_event.",
        error_entries: 36,
        projection_errors: [
          { code: "unsupported_event", detail: "raw entry retained", count: 36 },
        ],
      }),
    );
    await render();
    expect(text()).toContain("unsupported_event (36 — raw entry retained)");
  });

  // RED WHEN: "AI Matrx has never received an entry" becomes a blank or a
  // dash. This is the 741-conversation case, and it is the whole complaint.
  it("says in words that nothing has ever been received", async () => {
    serverAnswers(
      diagnosis({
        cloud_verdict: "behind_local",
        cloud_sentence:
          "AI Matrx has a conversation for this session but no record of a single delivered entry, so none of the 3526 entries in your local transcript are in it. The 2 messages you see there came from the run itself, not from this transcript.",
        entries: 0,
        projected_entries: 0,
        last_entry_at: null,
      }),
    );
    await render();
    expect(text()).toContain(
      "AI Matrx has never received an entry for this session",
    );
  });
});

describe("the reconcile door", () => {
  // RED WHEN: the expensive click loses its consequence sentence. A first
  // reconcile can import thousands of entries into this conversation.
  it("names the consequence before doing anything", async () => {
    serverAnswers(diagnosis({ cloud_sentence: "Hook capture is a summary." }));
    mockedCapability.mockResolvedValue({ state: "unreachable", reasons: [] });
    await render();
    await act(async () => {
      reconcileButton().click();
    });
    expect(mockedConfirm).toHaveBeenCalledTimes(1);
    const options = mockedConfirm.mock.calls[0][0] as { description: string };
    expect(options.description).toContain("never re-sent");
    expect(options.description).toContain("changes nothing");
  });

  // RED WHEN: the button stops showing progress, or the engine's returned
  // verdict sentence is dropped in favour of a local "Done" toast.
  it("shows progress, then the verdict the Mac returned", async () => {
    serverAnswers(diagnosis({ cloud_sentence: "Hook capture is a summary." }));
    mockedCapability.mockResolvedValue({ state: "ready", reasons: [] });
    let settle: (value: unknown) => void = () => {};
    mockedReconcile.mockReturnValue(
      new Promise((resolve) => {
        settle = resolve;
      }),
    );
    await render();

    await act(async () => {
      reconcileButton().click();
    });
    expect(text()).toContain("Matrx Local is reconciling this conversation");
    expect(reconcileButton().disabled).toBe(true);

    await act(async () => {
      settle({
        actions: [
          {
            step: "deliver",
            outcome: "delivered",
            detail: "3526 entries accepted",
          },
        ],
        truth: {
          verdict: {
            code: "in_sync",
            sentence:
              "In sync. All 3526 entries are in AI Matrx as 3526 messages; this Mac's copy was last pulled just now.",
            remedy: null,
          },
        },
      });
    });
    expect(text()).toContain(
      "In sync. All 3526 entries are in AI Matrx as 3526 messages; this Mac's copy was last pulled just now.",
    );
    expect(text()).toContain("delivered — 3526 entries accepted");
    expect(reconcileButton().disabled).toBe(false);
  });

  // RED WHEN: an unanswered Mac renders as in sync, as nothing, or as a dead
  // disabled button. The 8s bridge timeout IS the offline signal.
  it("reads an unanswered Mac as unreachable, in the one offline sentence", async () => {
    serverAnswers(diagnosis({ cloud_sentence: "Hook capture is a summary." }));
    mockedCapability.mockResolvedValue({
      state: "unreachable",
      reasons: [
        "Matrx Local did not answer. Make sure the desktop app is running and signed in on your Mac.",
      ],
    });
    await render();
    await act(async () => {
      reconcileButton().click();
    });
    expect(text()).toContain(
      "Matrx Local did not answer. Make sure the desktop app is running and signed in on your Mac.",
    );
    expect(mockedReconcile).not.toHaveBeenCalled();
    expect(reconcileButton().disabled).toBe(false);
  });

  // RED WHEN: the fallback drops the constant and renders an empty line. An
  // engine that reports unreachable WITHOUT a reason still has to say so.
  it("falls back to the one offline sentence when no reason came back", async () => {
    serverAnswers(diagnosis({ cloud_sentence: "Hook capture is a summary." }));
    mockedCapability.mockResolvedValue({ state: "unreachable", reasons: [] });
    await render();
    await act(async () => {
      reconcileButton().click();
    });
    expect(text()).toContain(
      "Matrx Local did not answer. Make sure the desktop app is running and signed in on your Mac.",
    );
  });

  // RED WHEN: a reconcile that throws mid-run is swallowed. The engine's own
  // error text is what tells the owner which step failed.
  it("reports a failed reconcile in the engine's own words", async () => {
    serverAnswers(diagnosis({ cloud_sentence: "Hook capture is a summary." }));
    mockedCapability.mockResolvedValue({ state: "ready", reasons: [] });
    mockedReconcile.mockRejectedValue(
      new Error("The transcript file is no longer on this Mac."),
    );
    await render();
    await act(async () => {
      reconcileButton().click();
    });
    expect(text()).toContain("The transcript file is no longer on this Mac.");
  });
});
