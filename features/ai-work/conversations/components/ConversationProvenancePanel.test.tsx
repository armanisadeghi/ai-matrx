/**
 * TWO BINDINGS ON ONE CONVERSATION (lane XT-05, plan-attack F7).
 *
 * The break each test catches: the panel reading one binding and describing it
 * as "the" provider. Until `handoff` shipped, every bound conversation in
 * production had exactly one binding, so the panel rendered `bindings[0]` and
 * called the rest "historical deliveries of the same session" — a sentence that
 * is FALSE the moment the second row is a different tool, and the exact reason
 * a handoff would have broken this screen silently.
 *
 * The forcing function is the rendered DOM against row shapes the bridge
 * actually writes: a Claude Code hook binding plus the Codex binding
 * `handoff` mints (`metadata.handoff`, the `matrx-handoff:` placeholder before
 * it is claimed). A panel that names one tool, drops a session id, hides the
 * seeded verdict, marks two rows as current, or offers native continuation for
 * an unclaimed offer fails here. Two different expected values are asserted per
 * behaviour (claimed vs unclaimed, current vs not) so a constant cannot pass.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ConversationProvenancePanel } from "./ConversationProvenancePanel";
import type { CodingSessionBinding } from "@/features/agent-connections/coding-sessions/service";
import type { ProviderConversation } from "@/features/ai-work/service/providerConversation";

const fetchBindings = jest.fn();

jest.mock("@/features/agent-connections/coding-sessions/service", () => ({
  fetchCodingSessionBindings: (...args: unknown[]) => fetchBindings(...args),
}));
// Stubbed for the same reason as ContinueOnMyMacPanel below: it reaches the
// aidream bridge and the user's own Mac, neither of which is this suite's
// subject. Its own forcing tests live in `__tests__/CloudSyncTruthPanel.test.tsx`.
jest.mock("./CloudSyncTruthPanel", () => ({
  CloudSyncTruthPanel: ({ providerSessionId }: { providerSessionId: string }) => (
    <div data-testid="cloud-sync-truth">{providerSessionId}</div>
  ),
}));
jest.mock("./ContinueOnMyMacPanel", () => ({
  ContinueOnMyMacPanel: ({ providerSessionId }: { providerSessionId: string }) => (
    <div data-testid="continue-on-mac">{providerSessionId}</div>
  ),
}));
jest.mock("@/components/official/entity-ref/EntityRef", () => ({
  EntityRef: () => <span />,
}));

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const CONVERSATION_ID = "3f2b9c74-1f4d-4a8e-9b1c-2d3e4f5a6b7c";
const CLAUDE_SESSION = "9f1c6d40-2c2f-4a2f-9a4d-6f5b0c7e51aa";
const CODEX_SESSION = "0199ab41-6f2e-7c31-9b77-2a1f0b3c4d5e";
const OFFER_SESSION = "matrx-handoff:8a1d3f5c7e9b0d2f4a6c8e0b1d3f5a7c";

function claudeBinding(): CodingSessionBinding {
  return {
    id: "binding-claude",
    conversation_id: CONVERSATION_ID,
    provider: "claude_code",
    provider_session_id: CLAUDE_SESSION,
    provider_project_key: "-Users-test-code-aidream",
    fidelity: "event_mirror",
    origin: "independent_hook",
    status: "active",
    last_seen_at: "2026-09-15T18:00:00Z",
    ended_at: null,
    runtime_kind: null,
    capabilities: { native_resume: false, native_fork: false },
    metadata: {
      workspace_name: "aidream",
      git_branch: "main",
      provider_account_label: "test@test.com",
      provider_account_key:
        "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90",
    },
    workspace_fingerprint: "ws-aidream",
    writer_lease_expires_at: null,
    error: null,
  } as unknown as CodingSessionBinding;
}

function codexBinding({
  claimed,
  lastSeenAt = "2026-09-15T19:30:00Z",
}: {
  claimed: boolean;
  /** `null` is the shape the bridge writes for an unclaimed offer: a row that
   *  has delivered nothing has no delivery timestamp to report. */
  lastSeenAt?: string | null;
}): CodingSessionBinding {
  return {
    // Distinct row ids: a claimed binding and an offer are different rows, and
    // a conversation can carry both for the same provider.
    id: claimed ? "binding-codex" : "binding-codex-offer",
    conversation_id: CONVERSATION_ID,
    provider: "codex",
    provider_session_id: claimed ? CODEX_SESSION : OFFER_SESSION,
    provider_project_key: null,
    fidelity: "event_mirror",
    origin: "independent_hook",
    status: "active",
    last_seen_at: lastSeenAt,
    ended_at: null,
    runtime_kind: null,
    capabilities: { native_resume: false, native_fork: false },
    metadata: {
      provider_account_label: claimed ? "arman@openai-account" : null,
      handoff: {
        role: "received",
        fidelity: "seeded",
        native_resume: false,
        state: claimed ? "claimed" : "offered",
        verdict: claimed
          ? "Seeded handoff claimed by codex. The conversation now has two provider bindings."
          : "Seeded handoff offered to codex.",
        from_provider: "claude_code",
        from_provider_session_id: CLAUDE_SESSION,
        offered_at: "2026-09-15T19:00:00Z",
        claimed_at: claimed ? "2026-09-15T19:30:00Z" : null,
      },
    },
    workspace_fingerprint: null,
    writer_lease_expires_at: null,
    error: null,
  } as unknown as CodingSessionBinding;
}

function conversation(): ProviderConversation {
  return {
    id: CONVERSATION_ID,
    title: "Fix the retry queue",
    conversation_type: "coding_session",
    origin_class: "witnessed",
    source_app: "claude-code",
    source_feature: "code-editor",
    is_favorite: false,
    visibility: "private",
    message_count: 42,
    exclude_from_kg: false,
    task_id: null,
    created_at: "2026-09-15T17:00:00Z",
    updated_at: "2026-09-15T19:30:00Z",
  } as unknown as ProviderConversation;
}

let container: HTMLDivElement;
let root: Root;

async function render(bindings: CodingSessionBinding[]) {
  fetchBindings.mockResolvedValue(bindings);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <ConversationProvenancePanel conversation={conversation()} />,
    );
  });
  // The panel DEFERS its binding read by one macrotask (`window.setTimeout(…,
  // 0)` in its effect), so a microtask-only flush leaves every assertion here
  // reading "Reading provider bindings…". That is how all 15 tests in this file
  // were RED on `main` (14 of 15 failing, 2026-09-17) — every assertion ran
  // against a loading state. Flush the timer as well.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return container.textContent ?? "";
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  fetchBindings.mockReset();
});

test("both tools are named, each with its own session id and account", async () => {
  const text = await render([
    codexBinding({ claimed: true }),
    claudeBinding(),
  ]);

  // The heading counts the tools rather than presenting one as "the" provider.
  expect(text).toContain("The 2 coding tools on this conversation");
  // Provider labels: BOTH, not just the newest.
  expect(text).toContain("Claude Code");
  expect(text).toContain("Codex");
  // Each binding's own provider session id is rendered — this is the fact the
  // single-binding panel dropped for every row but one.
  expect(text).toContain(CLAUDE_SESSION);
  expect(text).toContain(CODEX_SESSION);
  // And each binding's own provider account.
  expect(text).toContain("test@test.com");
  expect(text).toContain("arman@openai-account");
  expect(container.querySelectorAll("li").length).toBe(2);
});

test("the seeded handoff is labeled as seeded and credited to its source tool", async () => {
  const text = await render([
    codexBinding({ claimed: true }),
    claudeBinding(),
  ]);

  expect(text).toContain("Seeded handoff");
  expect(text).toContain("Handed over from");
  // The tool the history came from, named on the receiving binding.
  expect(text).toContain(`session ${CLAUDE_SESSION}`);
  // The Claude binding is NOT relabeled as seeded — only the receiving row is.
  expect(text).toContain("Event mirror");
  // A seeded continuation is never presented as a resume.
  expect(text).not.toMatch(/native resume is available/i);
});

test("exactly one binding is marked as the most recent delivery", async () => {
  await render([codexBinding({ claimed: true }), claudeBinding()]);
  const badges = Array.from(container.querySelectorAll("span")).filter(
    (node) => node.textContent === "Delivered most recently",
  );
  expect(badges.length).toBe(1);
  // The Codex row delivered at 19:30, the Claude row at 18:00 — the badge is on
  // the Codex card. A second forcing input below flips which row wins, so a
  // hardcoded "first row" cannot satisfy both.
  expect(badges[0].closest("li")?.textContent).toContain("Codex");
});

test("the most recent delivery is decided by the timestamp, not the array order", async () => {
  // Same two rows, but Claude delivered LAST. Different expected value.
  await render([
    codexBinding({ claimed: true, lastSeenAt: "2026-09-15T17:10:00Z" }),
    claudeBinding(),
  ]);
  const badges = Array.from(container.querySelectorAll("span")).filter(
    (node) => node.textContent === "Delivered most recently",
  );
  expect(badges.length).toBe(1);
  expect(badges[0].closest("li")?.textContent).toContain("Claude Code");
});

test("an unclaimed offer says so instead of showing a placeholder as a session", async () => {
  const text = await render([
    codexBinding({ claimed: false }),
    claudeBinding(),
  ]);

  expect(text).toContain("Seeded handoff offered");
  expect(text).toContain("No provider session yet");
  expect(text).toContain("Not yet claimed by a session of this tool");
  // The internal placeholder is never presented as a provider's own id.
  expect(text).not.toContain(OFFER_SESSION);
});

test("native continuation follows the Claude binding even when it is not the newest", async () => {
  // The Codex row is newest, so a panel gating on `bindings[0].provider` would
  // silently remove the one native continuation the platform has.
  await render([codexBinding({ claimed: true }), claudeBinding()]);
  const panel = container.querySelector('[data-testid="continue-on-mac"]');
  expect(panel?.textContent).toBe(CLAUDE_SESSION);
});

test("a conversation with no binding says nothing was synced", async () => {
  const text = await render([]);
  expect(text).toContain("No coding-session binding is attached");
  expect(text).not.toContain("coding tools on this conversation");
});

/**
 * XT-FIX-5 / FE1 — AN UNCLAIMED OFFER HAS DELIVERED NOTHING, EVER.
 *
 * The break: the panel picked "the one that delivered most recently" as the
 * greatest `last_seen_at` over EVERY binding. The bridge stamped a brand-new
 * offer with `last_seen_at = created_at`, so the newest row on the screen was
 * the one row that had never delivered anything — and it wore the "Delivered
 * most recently" badge while the grouped sections below described its fields as
 * the most recent delivery's. A screen is absent or honest; that one asserted a
 * delivery that never happened (verifier V-XT-5, § A5).
 *
 * Two different expected winners are asserted (Claude Code when the offer is
 * newest, and the claimed Codex row when it is not) so a constant cannot pass,
 * and both the `created_at`-stamped and the `null` shapes of an offer's
 * `last_seen_at` are covered — the server half of this lane makes the column
 * nullable, and a reader that only handles one shape lies on the other.
 */
function badgeCards(): string[] {
  return Array.from(container.querySelectorAll("span"))
    .filter((node) => node.textContent === "Delivered most recently")
    .map((node) => node.closest("li")?.textContent ?? "");
}

function offerCard(): HTMLLIElement {
  const card = Array.from(container.querySelectorAll("li")).find((li) =>
    li.textContent?.includes("Seeded handoff offered"),
  );
  if (!card) throw new Error("no unclaimed-offer card rendered");
  return card as HTMLLIElement;
}

test("an unclaimed offer never wears the most-recent-delivery badge", async () => {
  // The exact live shape: the offer row is the NEWEST row on the conversation
  // because the bridge stamped it at creation time.
  await render([
    codexBinding({ claimed: false, lastSeenAt: "2026-09-15T23:52:06Z" }),
    claudeBinding(),
  ]);
  const cards = badgeCards();
  expect(cards.length).toBe(1);
  expect(cards[0]).toContain("Claude Code");
  expect(cards[0]).not.toContain("Codex");
});

test("a null last_seen_at on an offer is tolerated, not ordered or formatted", async () => {
  await render([
    codexBinding({ claimed: false, lastSeenAt: null }),
    claudeBinding(),
  ]);
  const cards = badgeCards();
  expect(cards.length).toBe(1);
  expect(cards[0]).toContain("Claude Code");
  expect(container.textContent).not.toContain("Invalid timestamp");
});

test("an offer's last delivery is an explicit sentence, never a timestamp", async () => {
  await render([
    codexBinding({ claimed: false, lastSeenAt: "2026-09-15T23:52:06Z" }),
    claudeBinding(),
  ]);
  const card = offerCard();
  expect(card.textContent).toContain("Nothing delivered yet");
  // The creation stamp is never rendered as a delivery on the offer card.
  expect(card.textContent).not.toContain(
    new Date("2026-09-15T23:52:06Z").toLocaleString(),
  );
  // The claimed row's real delivery IS still rendered — the fix is not "hide
  // every timestamp".
  expect(container.textContent).toContain(
    new Date("2026-09-15T18:00:00Z").toLocaleString(),
  );
});

test("a claimed binding still wins the badge when the offer is older", async () => {
  await render([
    codexBinding({ claimed: true, lastSeenAt: "2026-09-15T19:30:00Z" }),
    codexBinding({ claimed: false, lastSeenAt: "2026-09-15T17:00:00Z" }),
    claudeBinding(),
  ]);
  const cards = badgeCards();
  expect(cards.length).toBe(1);
  expect(cards[0]).toContain("Codex");
});

test("when every binding is an unclaimed offer, nothing is picked as the deliverer", async () => {
  const text = await render([codexBinding({ claimed: false, lastSeenAt: null })]);
  expect(badgeCards().length).toBe(0);
  // The grouped per-binding sections must say plainly that nothing delivered
  // rather than silently describing the offer's fields as a delivery's.
  expect(text).toContain("No tool has delivered");
  // And they must NOT claim the conversation has no binding at all: it has one.
  expect(text).not.toContain("No coding-session binding is attached");
  expect(text).not.toContain("this conversation was created inside AI Matrx");
});

/**
 * A REBIND'S TURNS: the screen must say where they actually went.
 *
 * Seen live on 2026-09-15 (XT-FIX-5) on a real carried rebind: this panel said
 * "its turns before the move stayed on conversation <id>" while the server had
 * just MOVED those turns onto this very transcript and said so in its verdict.
 * The sentence read `rebound_from_conversation_id` and nothing else, so it was
 * the same sentence for two opposite outcomes — a screen asserting a fact it
 * had not looked at. The server now records exactly one of `carried_messages`
 * or `prior_context_conversation_id`, and this renders whichever it is.
 */
describe("a rebind says where the moved session's earlier turns went", () => {
  function reboundBinding(handoffExtras: Record<string, unknown>) {
    const binding = codexBinding({ claimed: true });
    const metadata = (binding as unknown as { metadata: Record<string, unknown> })
      .metadata;
    metadata.handoff = {
      ...(metadata.handoff as Record<string, unknown>),
      rebound_from_conversation_id: "e39de40f-e3c5-5a17-9661-2b26a1de40cf",
      ...handoffExtras,
    };
    return binding;
  }

  it("carried turns are described as moved, never as left behind", async () => {
    const text = await render([
      reboundBinding({ carried_messages: 2, prior_context_conversation_id: null }),
      claudeBinding(),
    ]);
    expect(text).toContain("2 turns it had already produced moved with it");
    expect(text).toContain("appended at the end of this transcript");
    expect(text).not.toContain("stayed on conversation");
  });

  it("turns too many to move are named where they still live", async () => {
    const text = await render([
      reboundBinding({
        carried_messages: 0,
        prior_context_conversation_id: "e39de40f-e3c5-5a17-9661-2b26a1de40cf",
        prior_context_messages: 412,
      }),
      claudeBinding(),
    ]);
    expect(text).toContain("412 earlier turns stayed on conversation");
    expect(text).toContain("linked here as prior context");
    expect(text).not.toContain("moved with it");
  });

  it("a rebind of an empty conversation says exactly that", async () => {
    const text = await render([
      reboundBinding({ carried_messages: 0, prior_context_conversation_id: null }),
      claudeBinding(),
    ]);
    expect(text).toContain("held no turns of its own");
    expect(text).not.toContain("stayed on conversation");
    expect(text).not.toContain("moved with it");
  });
});
