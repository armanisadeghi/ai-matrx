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

/**
 * The five autonomy modes, verbatim from
 * common-docs `/policies/human-in-the-loop-autonomy-modes.md`. The list is
 * CLOSED until amended there (rule 7) — never add a sixth value here.
 */
export type AutonomyMode =
  | "mode_1"
  | "mode_2"
  | "mode_3"
  | "mode_4"
  | "mode_5";

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
   */
  mode: AutonomyMode;
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
  | "pending_elsewhere"
  /**
   * The id names one of this person's assists, but not an approval item — a
   * keyword chip, a recovery notice, anything else on the ledger. Saying
   * "waiting beyond page one" about it sent the reader hunting through a queue
   * it was never in (Bugbot MEDIUM, frontend PR 228).
   */
  | "not_an_approval"
  | "unconfirmed";

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
}
