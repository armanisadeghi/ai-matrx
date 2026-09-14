/**
 * THE APPROVAL-KIND CONTRACT (register KI-045 — one approval queue).
 *
 * Every AI proposal in Keyword Intelligence lands in ONE queue a person works
 * through. A proposal kind is a REGISTRATION, never a screen: implement
 * `ApprovalKind`, add it to `APPROVAL_KINDS` in `./registry.ts`, and the queue
 * (`ApprovalQueue`), the cross-site console (`ApprovalsConsole`) and every
 * host that mounts the queue render it — one list, per-item and select-all
 * decisions, the consequence listed before a batch runs, a reason captured
 * where the write keeps one, and a door on every record the row names.
 *
 * 🚨 A kind owns no writer of its own. `accept` / `reject` replay the ORDINARY
 * HUMAN WRITE PATH for the thing proposed (see `suggestions/apply.ts`), so an
 * approved proposal is indistinguishable from a person making the change.
 *
 * Contract doc: `./FEATURE.md` § Registering a proposal kind.
 */

import type { ReactNode } from "react";

/** Where a queue is mounted — what a kind needs to read and to build doors. */
export interface ApprovalScope {
  siteId: string;
  brandId: string | null | undefined;
  organizationId: string | null | undefined;
  siteLabel: string | null | undefined;
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
  /** Every record the row names, as doors (EntityRef / keyword window / links). */
  doors?: ReactNode;
  /** Who proposed it, in words (an agent or an engine's label). */
  proposedBy?: string | null;
  /** ISO timestamp, when the kind knows it. */
  proposedAt?: string | null;
  /**
   * Set when this item must be reviewed on its own (e.g. a full guidelines
   * document the person may edit before approving). The node is the review
   * affordance; the row is excluded from select-all and has no bare Approve.
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

export interface ApprovalKind {
  /** Stable id, e.g. `keyword_meaning`. Used in `kinds` filters and item keys. */
  id: string;
  /** Group label on each row's badge, e.g. "Offering placement". */
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
   * lives in React — the assists runner does). Called in a fixed slot.
   */
  useDecisions: (scope: ApprovalScope) => ApprovalDecisions;
  /** Present when Reject needs a choice before it can write. */
  RejectChooser?: (props: ApprovalChooserProps) => ReactNode;
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
