// features/crm/chasebox/types.ts
//
// The Chasebox: "what needs me now" in one glance, as saved filters over the
// SAME schema the inbox and the outreach lists already use (research/03, D9).
// One row type with a `queue` column — the ratified heterogeneous-rows
// decision, proven on /transcripts — never five bespoke row shapes.

import type { LucideIcon } from "lucide-react";
import {
  CircleDot,
  FileCheck2,
  MailWarning,
  TimerReset,
  UserPlus,
} from "lucide-react";
import type { Database } from "@/types/database.types";
import type { ListScopeKind } from "@/lib/list-scope/types";

/** One row, exactly as crm_chasebox_items returns it. */
export type ChaseboxRow =
  Database["public"]["Functions"]["crm_chasebox_items"]["Returns"][number];

export const CHASEBOX_QUEUES = [
  "fresh_replies",
  "pending_drafts",
  "stalled_sequences",
  "blocked_members",
  "escalation_candidates",
] as const;
export type ChaseboxQueue = (typeof CHASEBOX_QUEUES)[number];

/** Same subset the inbox declares, and for the same reasons (see inbox/types). */
export const CHASEBOX_SCOPES: ListScopeKind[] = ["mine", "orgs"];

export interface ChaseboxQueueMeta {
  id: ChaseboxQueue;
  label: string;
  /** What being in this queue MEANS — never a restatement of the label. */
  description: string;
  /** What the user sees when the queue is empty. Honest, never a spinner. */
  emptyLabel: string;
  Icon: LucideIcon;
  /**
   * True when the queue is a SUGGESTION rather than a task. research/03 is
   * explicit that secondary-contact escalation never auto-sends, and the UI has
   * to say so rather than looking like the other four.
   */
  suggestionOnly?: boolean;
}

export const CHASEBOX_QUEUE_META: Record<ChaseboxQueue, ChaseboxQueueMeta> = {
  fresh_replies: {
    id: "fresh_replies",
    label: "Fresh replies",
    description:
      "A real person wrote back and nobody has answered or cleared it yet.",
    emptyLabel: "Nothing unanswered.",
    Icon: CircleDot,
  },
  pending_drafts: {
    id: "pending_drafts",
    label: "Drafts awaiting approval",
    description:
      "The sequence wrote these and stopped, because the trust ladder says a human approves this one. Nothing goes out until you read it.",
    emptyLabel: "No drafts are waiting on you.",
    Icon: FileCheck2,
  },
  stalled_sequences: {
    id: "stalled_sequences",
    label: "Stalled sequences",
    description:
      "Members whose next step came due and never moved, or whose campaign or mailbox is paused above them.",
    emptyLabel: "Every sequence is moving.",
    Icon: TimerReset,
  },
  blocked_members: {
    id: "blocked_members",
    label: "Blocked members",
    description:
      "The send would refuse for these. Every one names the exact reason and what fixes it.",
    emptyLabel: "Nothing is blocked.",
    Icon: MailWarning,
  },
  escalation_candidates: {
    id: "escalation_candidates",
    label: "Try someone else",
    description:
      "The whole sequence ran and this person never replied. A suggestion only — nothing is sent automatically.",
    emptyLabel: "No exhausted sequences.",
    Icon: UserPlus,
    suggestionOnly: true,
  },
};

/** Live counts, one per queue. A queue with none returns a real 0. */
export type ChaseboxCounts = Record<ChaseboxQueue, number>;

export const EMPTY_CHASEBOX_COUNTS: ChaseboxCounts = {
  fresh_replies: 0,
  pending_drafts: 0,
  stalled_sequences: 0,
  blocked_members: 0,
  escalation_candidates: 0,
};

export function isChaseboxQueue(value: string): value is ChaseboxQueue {
  return (CHASEBOX_QUEUES as readonly string[]).includes(value);
}

/**
 * THE DOOR LAW's corollary: every problem we detect ships with its ONE-CLICK
 * fix. The server states the problem and the fix in words; this resolves where
 * the fix actually lives.
 */
export function chaseboxFixHref(row: ChaseboxRow): string | undefined {
  switch (row.queue as ChaseboxQueue) {
    case "fresh_replies":
      return row.party_id ? `/crm/${row.party_id}` : undefined;
    case "pending_drafts":
      return row.outreach_list_id
        ? `/crm/outreach-lists/${row.outreach_list_id}`
        : undefined;
    case "stalled_sequences":
      // A paused MAILBOX is fixed at the mailbox, not at the campaign — the
      // campaign screen cannot resume a mailbox the breaker tripped.
      if (row.problem_code === "mailbox_paused" && row.sending_identity_id) {
        return `/crm/sending-identities/${row.sending_identity_id}`;
      }
      return row.outreach_list_id
        ? `/crm/outreach-lists/${row.outreach_list_id}`
        : undefined;
    case "blocked_members":
      // Every structural block is repaired on the contact record (attach a
      // point, lift a mistaken do-not-contact, see what is on the value).
      return row.party_id ? `/crm/${row.party_id}` : undefined;
    case "escalation_candidates":
      return row.party_id ? `/crm/${row.party_id}` : undefined;
    default:
      return undefined;
  }
}

/** The label on the fix button — a verb, matching where it lands. */
export function chaseboxFixLabel(row: ChaseboxRow): string {
  switch (row.queue as ChaseboxQueue) {
    case "fresh_replies":
      return "Open the record";
    case "pending_drafts":
      return "Review and approve";
    case "stalled_sequences":
      return row.problem_code === "mailbox_paused"
        ? "Open the mailbox"
        : "Open the campaign";
    case "blocked_members":
      return "Fix on the record";
    case "escalation_candidates":
      return "Review the record";
    default:
      return "Open";
  }
}
