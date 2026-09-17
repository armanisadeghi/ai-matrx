/**
 * THE PLATFORM APPROVAL-KIND CONTRACT — one queue, kinds are registrations.
 *
 * Human-in-the-loop policy rule 5: "Approval surfaces are one place, not many.
 * A human granted review rights sees every pending item for their scope in a
 * single queue with approve/reject and bulk actions — never one scattered
 * inbox per feature." This contract is that queue's only extension point.
 *
 * LIFTED from `features/marketing/seo/value-system/approvals/types.ts`
 * (register KI-045) on 2026-09-17, by chair ruling: that queue was already the
 * generic mechanism with a kind registry, so it moved here whole — engine,
 * registry and its three kinds, which are now the first three registrations in
 * ONE registry. A queue that did not import that registry would have been queue
 * number four. Two widenings only: the scope reaches beyond a site (person,
 * organization, any entity — see `ApprovalScope`), and an item states the
 * autonomy MODE it runs in plus, in mode 3, WHEN it applies itself.
 *
 * The store is `platform.assists` — the store the SEO queue already used
 * (common-docs `/systems/platform/assists/FEATURE.md`); `./data.ts` is the only
 * module here that touches it.
 *
 * 🚨 A kind owns no writer of its own. `accept` / `reject` replay the ORDINARY
 * HUMAN WRITE PATH for the thing proposed — the same service call a person
 * clicking in the product would make — so an approved proposal is
 * indistinguishable from a person making the change. A private writer inside a
 * kind is a second path to the same data.
 *
 * 🚨 A kind renders no review UI of its own either. If the product already has
 * the surface that reviews this change (the Gmail review card), the kind mounts
 * THAT as its `individualReview` body. A second review screen drifts from the
 * first and one of them is then lying.
 *
 * Contract doc: `./FEATURE.md` § Registering a proposal kind.
 */

import type { ReactNode } from "react";

import type { AssistAction } from "@/features/assists/types";

/**
 * The assist action shapes an approval kind can read. Declared here (not beside
 * the predicate) because it is part of the kind CONTRACT; `./rendered.ts` maps
 * each family to its action kind and asks the one will-render question.
 */
export type ApprovalRowFamily = "approval_proposal" | "keyword_meaning";

/**
 * The five autonomy modes, verbatim from
 * common-docs `/policies/human-in-the-loop-autonomy-modes.md`. The list is
 * CLOSED until amended there (rule 7) — never add a sixth value here.
 */
export type AutonomyMode = "mode_1" | "mode_2" | "mode_3" | "mode_4" | "mode_5";

export const AUTONOMY_MODES: readonly AutonomyMode[] = [
  "mode_1",
  "mode_2",
  "mode_3",
  "mode_4",
  "mode_5",
];

/** The sentence a person reads. Never a bare "mode_4" in the UI. */
export const AUTONOMY_MODE_LABEL: Record<AutonomyMode, string> = {
  mode_1: "Applies automatically — platform rules",
  mode_2: "Applies automatically — your organization's rules",
  mode_3: "Waiting for you, then applies itself",
  mode_4: "Waiting for you — nothing applies until you decide",
  mode_5: "Off — this step does not run",
};

/**
 * WHERE a queue is mounted — one shape for every mount, because there is one
 * registry (chair ruling, 2026-09-17: the widened scope goes "beyond a site —
 * person, organization, entity"). Everything except `key` is optional, so the
 * whole-scope `/approvals` page, a site's workbench and a record's own strip
 * all pass the same type and one registry serves all three.
 *
 * 🚨 A kind that needs a dimension this mount does not carry does NOT return
 * zero rows — silently hiding work is the failure this queue exists to end. It
 * declares `scopeRequirement`, and the engine tells the reader where those
 * proposals live instead (see `ApprovalKind.scopeRequirement`).
 */
export interface ApprovalScope {
  /**
   * Stable identity of THIS mount — the organization id for the whole-scope
   * queue, or the subject's id for a queue standing inside one record. It keys
   * the summary callback and every kind's reader; two mounts sharing a key are
   * the same queue.
   */
  key: string;
  organizationId: string | null | undefined;
  /** The person whose queue this is — the addressee the readers filter on. */
  userId?: string | null;
  /** The record this mount stands inside, when narrower than the organization. */
  subject?: ApprovalSubject | null;
  /**
   * The SEO kinds' dimension. A site queue sets all three; a person- or
   * organization-scoped mount sets none, and those kinds declare a
   * `scopeRequirement` rather than reading undefined.
   */
  siteId?: string;
  brandId?: string | null;
  siteLabel?: string | null;
}

/** The record a row names, as the door registries address it. */
export interface ApprovalSubject {
  /** An `entityRegistry` token (`web_site`, `person`, `data_table`, …). */
  token: string;
  id: string;
  label?: string | null;
}

export interface ApprovalItem {
  /** Unique across ALL kinds — always `${kindId}:${id}`. */
  key: string;
  kindId: string;
  /**
   * Optional finer grain inside a kind (e.g. `guideline_edit` inside
   * `keyword_meaning`) so a single-subject host can mount the queue narrowed
   * with `kinds={["keyword_meaning:guideline_edit"]}`.
   */
  subKind?: string;
  /** Row badge; defaults to the kind's label. */
  badge?: string;
  /** One line naming the proposed change, in the reader's words. */
  headline: string;
  /** The exact write Approve performs. Re-listed in the batch confirm. */
  acceptEffect: string;
  /** The exact write Reject performs. Re-listed in the batch confirm. */
  rejectEffect: string;
  /** Every record the row names, as doors (EntityRef / window / links). */
  doors?: ReactNode;
  /** Who proposed it, in words (an agent or an engine's label). */
  proposedBy?: string | null;
  /** ISO timestamp, when the kind knows it. */
  proposedAt?: string | null;
  /**
   * The autonomy mode this proposal is running in. Policy rule 1: a capability
   * that cannot say which mode it is in is a defect — so this is REQUIRED, and
   * a reader that cannot resolve it must refuse rather than guess a mode.
   *
   * `unresolved` IS that refusal, said out loud, and it is not a sixth mode: it
   * exists for the honest row a build shows over a pending proposal it cannot
   * read at all (`unreadable` below). Such a row offers no decision, so no
   * screen and no writer ever acts on this value — it only stops the mode line
   * from printing a mode nobody established (round-3 verification § A-N6).
   */
  mode: AutonomyMode | "unresolved";
  /**
   * Mode 3 only: the ISO instant it applies itself if nobody rules. Policy
   * rule 4 — the timeout must be visible before it fires, so the queue prints
   * it on the row. A mode-3 item without one is shown as a refusal, not as a
   * quiet "waiting".
   */
  autoApplyAt?: string | null;
  /**
   * Set when the reader CANNOT act on this item — the operator it is addressed
   * to does not hold the sending account, for example. The row still appears
   * (nothing is ever silently dropped), shows this sentence and who can act,
   * and offers no Approve.
   */
  blocked?: { reason: string; whoCan: string } | null;
  /**
   * The would-be change, shown under the row — a cell diff, a field map, the
   * proposed text. It does NOT make the row unbatchable: seeing what changes is
   * the normal case, and hiding it behind a click is how a person ends up
   * approving prose they never read.
   */
  body?: ReactNode;
  /**
   * THE APPROVE IS IN FLIGHT — the row was claimed on the server and the change
   * is being made right now (`receipt.state === "applying"`). The sentence is
   * shown and the row offers NO DECISION CONTROLS: a second Approve would do
   * nothing and a Reject cannot undo a write already running. Before this
   * existed the screen showed a live Approve button and, on a second click,
   * said the change "was made by that first approval" (round-2 verification
   * § A-iii).
   */
  inFlight?: { sentence: string } | null;
  /**
   * WHAT THE LAST APPROVE DID, when it did not simply work.
   *
   * `failed` — it was claimed and the change was NOT made. The sentence names the
   * refusal, the row's Approve becomes an explicit RETRY, and Reject stays
   * available: the person's two real options are to try again or to give up.
   *
   * 🚨 `applied_unconfirmed` — the write REACHED GOOGLE and the answer was lost
   * (aidream lane B-10, `/projects/google-native/VERIFY-U-P4-U-M1-R3.md` § A-N1).
   * The change may have been made, so the row offers NO RETRY at all: an append
   * is not idempotent and a second press is a second block in the person's
   * document. The sentence is the server's own, and it sends them to look at the
   * file rather than at a button.
   */
  lastAttempt?: {
    state: "failed" | "applied_unconfirmed";
    sentence: string;
  } | null;
  /**
   * 🚨 THIS PROPOSAL HAS OUTLIVED THE ORGANIZATION'S REVIEW WINDOW
   * (`hitl.google.review_timeout_hours`). The apply door refuses it with 403
   * carrying this very sentence, so the row states it BEFORE the click and
   * offers no Approve; Reject stays, because rejecting an expired proposal is
   * exactly what the server still allows and what the sentence asks for.
   *
   * The server remains the authority — this mark never grants anything, and a
   * browser whose clock or knob read is stale cannot let an expired change
   * through (round-3 verification § A-N7; `./review-window.ts`).
   */
  expired?: { sentence: string } | null;
  /**
   * 🚨 THERE IS A ROW HERE AND THIS BUILD CANNOT SHOW IT. A pending proposal
   * whose kind nothing registered renders, or whose action does not narrow: the
   * queue prints this sentence, counts the row, and offers NO decision controls
   * (it cannot state what Approve would change). Built in one place —
   * `./data.ts` → `unrenderableApprovalItems`.
   *
   * Before it existed the page read SUBTRACTED such a row from its total, so
   * one of them alone made `/approvals` say "Nothing is waiting on you" over a
   * durable pending proposal, with only a console warning to the contrary
   * (round-3 verification § A-N6).
   */
  unreadable?: { sentence: string } | null;
  /**
   * Set when this item must be reviewed on its own — a Gmail message whose
   * review card IS the authorization, a full guidelines document the person
   * may edit first. The node is the review affordance; the row is excluded
   * from select-all and has no bare Approve.
   */
  individualReview?: ReactNode;
}

/** What a kind's reader hands the queue. */
export interface ApprovalSource {
  items: ApprovalItem[];
  /** True total when the kind shows a page of a larger set. */
  total: number;
  loading: boolean;
  error: unknown;
  refetch: () => void;
  /** A door to the kind's full working surface when `total > items.length`. */
  moreHref?: string | null;
  moreLabel?: string | null;
}

export interface ApprovalOutcome {
  applied: number;
  /** Per-item failures, each in the words the write refused with. */
  failures: { key: string; message: string }[];
  /**
   * Items the write found ALREADY DECIDED, each with the sentence saying what
   * it actually found. Neither applied nor failed: nothing was performed and
   * nothing refused.
   *
   * 🚨 IT EXISTS BECAUSE "DID NOT THROW" IS NOT "DID WHAT YOU ASKED". The
   * Google door is idempotent — a second approve writes nothing to Google and
   * returns the first call's receipt, and a row somebody already REJECTED
   * answers an approve the same quiet way. Counting those replies as applied
   * toasted "Approved 1 proposal" over a change that was never made, and
   * "Rejected 1 proposal" over one that had already been sent (Bugbot MEDIUM,
   * frontend PR 228). The queue reports these separately, in their own words.
   */
  alreadyDecided?: { key: string; message: string }[];
  /**
   * 🚨 ITEMS WHOSE OUTCOME NOBODY KNOWS — the write reached Google and the
   * answer was lost (`receipt.state === "applied_unconfirmed"`). Neither applied
   * nor refused nor already decided: counting one as applied claims a change
   * landed, and counting it as a failure claims it did not and invites the retry
   * the server refuses to offer (aidream lane B-10, § A-N1). Reported in the
   * server's own words, with no retry anywhere near them.
   */
  unconfirmed?: { key: string; message: string }[];
}

/**
 * A kind whose Reject needs a choice first (e.g. "which offering, then?")
 * renders this. It resolves with the choice and the person's reason, or
 * cancels. The generic reason dialog is skipped for that decision.
 */
export interface ApprovalChooserProps {
  scope: ApprovalScope;
  items: ApprovalItem[];
  onChosen: (choice: string, reason: string | null) => void;
  onCancel: () => void;
}

export interface ApprovalDecisionCopy {
  /** Button label, e.g. "Approve", "Take it", "Confirm". */
  label: string;
  /**
   * Whether the write this decision replays STORES the person's reason.
   * When false the queue does not ask — inviting a reason that is then thrown
   * away is a screen lying (THE NO-SILENT-FAILURE LAW).
   */
  keepsReason: boolean;
  /** The decision cannot be made without a reason (only when `keepsReason`). */
  reasonRequired?: boolean;
  /** Placeholder for the reason field when `keepsReason`. */
  reasonPrompt?: string;
}

export interface ApprovalDecisions {
  acceptItems: (
    items: ApprovalItem[],
    reason: string | null,
  ) => Promise<ApprovalOutcome>;
  rejectItems: (
    items: ApprovalItem[],
    reason: string | null,
    choice: string | null,
  ) => Promise<ApprovalOutcome>;
}

/**
 * What became of the row a deep link named (`/approvals?item=<id>`).
 *
 * 🚨 `decided` IS A CLAIM AND NEEDS EVIDENCE. Each kind reads one page, so a
 * row's absence from the list proves nothing — it may be row 51. The queue
 * reads the named id directly and reports `pending_elsewhere` when the store
 * still holds it, `decided` only when the store says it was decided, and
 * `unconfirmed` when nothing could answer (Bugbot MEDIUM #2, 2026-09-17).
 */
export type ApprovalFocusResolution =
  | "shown"
  | "decided"
  /**
   * Waiting, and rendered by a kind THIS MOUNT DOES NOT CARRY — a site-scoped
   * keyword row opened from the person-scoped queue. It is answered with the
   * door to where it lives; "past the first page of this list" sent the reader
   * hunting through a list it was never in (Bugbot round 9 #9).
   */
  | "not_in_this_list"
  /** Waiting, and NO registered kind can show it. Said out loud, not hidden. */
  | "no_screen"
  /** Approved, and the change was NOT made (`receipt.state === "failed"`). */
  | "apply_failed"
  /** An approve is running right now (`receipt.state === "applying"`). */
  | "applying"
  | "pending_elsewhere"
  /**
   * The id names one of this person's assists, but not an approval item — a
   * keyword chip, a recovery notice, anything else on the ledger. Saying
   * "waiting beyond page one" about it sent the reader hunting through a queue
   * it was never in (Bugbot MEDIUM, frontend PR 228).
   */
  | "not_an_approval"
  /**
   * 🚨 APPROVED, THE WRITE REACHED GOOGLE, AND THE ANSWER WAS LOST
   * (`receipt.state === "applied_unconfirmed"`). Never `decided` — nobody can
   * say whether the change was made — and never `apply_failed`, which would
   * offer a retry that duplicates it.
   */
  | "applied_unconfirmed"
  | "unconfirmed";

/**
 * What the verdict needs to be honest AND to open. A resolution alone is a
 * sentence; these are the facts that sentence cannot invent (THE DOOR LAW: the
 * answer that says "not here" says where).
 */
export interface ApprovalFocusDetail {
  /** `not_in_this_list`: one sentence saying why it is not in this list. */
  explain?: string;
  /** `not_in_this_list`: the door to where it IS. */
  where?: { label: string; href: string };
  /** `apply_failed`: the server's refusal, verbatim. */
  error?: string | null;
}

/**
 * WHERE A ROW IS when this queue cannot show it — one sentence and one door.
 * Every "not here" answer carries it; "not here" without it is the dead end
 * this queue exists to end (THE DOOR LAW).
 */
export interface ApprovalRowPlace {
  /** One sentence naming why this row is not in this list, in the row's terms. */
  explain: string;
  /** Where it IS. */
  where: { label: string; href: string };
}

/**
 * A dimension a kind cannot work without, plus where its proposals CAN be seen.
 * The engine renders the sentence and the door on any mount that lacks the
 * field — never an empty section and never a silent omission.
 */
export interface ApprovalScopeRequirement {
  /** The scope field that must be present. */
  field: "siteId" | "subject" | "userId" | "organizationId";
  /** One sentence: why these proposals are not in this queue. */
  explain: string;
  /** Where they are. */
  where: { label: string; href: string };
}

export interface ApprovalKind {
  /** Stable id, e.g. `gmail_send`. Used in `kinds` filters and item keys. */
  id: string;
  /**
   * WHICH ASSIST ACTION SHAPE THIS KIND READS. Defaults to
   * `approval_proposal` (the platform/Google kinds, whose `id` IS the
   * producer's `proposalKind`); the keyword kinds read `keyword_meaning`.
   *
   * It exists so THE ONE WILL-RENDER PREDICATE (`./rendered.ts`) can answer
   * "would this row be on screen here?" without knowing a kind by name — the
   * question the badge, the section header and every deep link now ask in one
   * place instead of three.
   */
  reads?: ApprovalRowFamily;
  /**
   * DOES THIS KIND RENDER **THIS** ROW ON **THIS** MOUNT? Kind + scope + action
   * shape, answered by the kind that owns the reader — the only code that knows
   * what its own reader filters on.
   *
   * 🚨 IT EXISTS BECAUSE "SOME KIND READS THIS SHAPE" IS NOT AN ANSWER. Until
   * 2026-09-17 the predicate stopped at the action FAMILY, so every
   * `apply_keyword_meaning` row on the platform counted as on-screen the moment
   * any keyword kind was mounted: on site A's queue, a deep link to site B's
   * row answered "still waiting on you, past the first page of this list"
   * about a list that can never show it (Bugbot round 10, finding 1). Two of
   * the three keyword kinds read RPCs rather than the ledger and render no
   * ledger row at all, which made the same claim over rows nothing shows.
   *
   * REQUIRED whenever `reads` is not `approval_proposal`: the default
   * recogniser is "the kind's `id` IS the row's `proposalKind`", which only
   * exists in that family. A kind that reads another family and declares no
   * recogniser renders nothing and is loud about it (`./rendered.ts`), because
   * guessing would put the queue right back where this finding found it.
   */
  rendersRow?: (action: AssistAction, scope: ApprovalScope) => boolean;
  /**
   * WHERE THIS ROW IS, for a row this kind reads somewhere but not on this
   * mount — the door a deep link answers with (THE DOOR LAW). Per ROW, because
   * the honest answer names the row's own site, not a generic console:
   * `scopeRequirement` is the fallback when a kind has nothing finer to say.
   *
   * Return `null` when this kind does not read the row anywhere.
   */
  rowElsewhere?: (action: AssistAction) => ApprovalRowPlace | null;
  /** Group label on each row's badge, e.g. "Email to send". */
  label: string;
  accept: ApprovalDecisionCopy;
  reject: ApprovalDecisionCopy;
  /**
   * The reader. A React hook: called once per mounted queue in a fixed slot,
   * so it may use react-query, Redux, or anything else a hook may.
   */
  useSource: (scope: ApprovalScope) => ApprovalSource;
  /**
   * The writers, as a hook for the same reason (a kind may need a runner that
   * lives in React). Called in a fixed slot.
   */
  useDecisions: (scope: ApprovalScope) => ApprovalDecisions;
  /** Present when Reject needs a choice before it can write. */
  RejectChooser?: (props: ApprovalChooserProps) => ReactNode;
  /**
   * Declared when this kind cannot read on every mount (the SEO kinds need a
   * site). The engine skips the kind AND says where its proposals are.
   */
  scopeRequirement?: ApprovalScopeRequirement;
}

/**
 * STAND-IN for a generated type. REMEDY: run `pnpm sync-types`, then delete
 * this interface and read `ApprovalDecisionResponse` from
 * `types/python-generated/api-types.ts` instead.
 *
 * This is the RESPONSE contract of aidream's two approval doors — the exact
 * fields of `ApprovalDecisionResponse` in
 * `aidream/api/routers/google_workspace.py`:
 *
 *     POST /google-workspace/approvals/{approval_id}/apply
 *     POST /google-workspace/approvals/{approval_id}/reject
 *
 * It is declared by hand ONLY because the generated contract in this checkout
 * predates those endpoints and could not be regenerated where this was written
 * (`pnpm sync-types` emits the OpenAPI from the `../aidream` checkout, which
 * that container could not run). A generated file is NEVER hand-edited, and a
 * cast past the gap would hide the drift instead of naming it — so the gap is
 * named here, in one place, with its remedy. Nothing else is stood in for: the
 * REQUEST side is two path parameters and one optional `reason`.
 *
 * 🚨 `applied_now: false` does NOT mean failure — it means this call performed
 * nothing because the row was already decided, and `receipt` is the first
 * decision's evidence. A screen that reads it as a failure would tell a person
 * their approved change did not happen when it did.
 */
export interface GoogleApprovalDecisionPending {
  approval_id: string;
  /** `accepted` after an apply, `dismissed` after a reject. */
  status: string;
  applied_now: boolean;
  /** `google_workspace_approval_receipt` — what actually happened. */
  receipt: Record<string, unknown>;
  /**
   * 🚨 THE SENTENCE THE SERVER WROTE ABOUT THIS CALL — the field the frontend
   * ignored entirely until 2026-09-17 (round-3 verification § A-N3). aidream
   * sets it on every reply, documented as *"Always set, so no caller has to
   * infer 'what happened' from a status enum — the wrong inference is exactly
   * how a failed apply came to read as 'the change was made'"*; the client
   * derived its own instead, and the two had already drifted on the reject path
   * (§ A-N2: the server said "do not assume the change was made", the screen
   * said it was made).
   *
   * `null` means the reply carried none — an older server, or an empty string.
   * The one adapter (`./receipt.ts` → `readDecisionReply`) then derives, and
   * only then.
   */
  sentence: string | null;
}
