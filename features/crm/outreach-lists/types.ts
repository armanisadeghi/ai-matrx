// features/crm/outreach-lists/types.ts
//
// Types for the outreach list builder + call queue. ALL row shapes derive from the
// generated `types/database.types.ts` (`crm` schema) — never hand-mirrored.
//
// Read features/crm/FEATURE.md before touching this: suppression lives on the
// MEDIUM (`crm.contact_medium.is_contactable`, a generated column), DNC lives
// on the PARTY (`do_not_contact`) and opt-out on the CONTACT POINT
// (`opt_out_at`). The dialer must respect all three — a suppressed medium is
// never offered as a dial target.

import type { Database } from "@/types/database.types";
import type {
  ContactMediumRow,
  PartyContactPointRow,
  PartyRow,
} from "../types";
import type { ContactBlockReason } from "../reachability";

// ── Generated row aliases ───────────────────────────────────────────────────

export type OutreachListRow = Database["crm"]["Tables"]["outreach_list"]["Row"];
export type OutreachListInsert = Database["crm"]["Tables"]["outreach_list"]["Insert"];
export type OutreachListUpdate = Database["crm"]["Tables"]["outreach_list"]["Update"];

export type OutreachListMemberRow =
  Database["crm"]["Tables"]["outreach_list_member"]["Row"];
export type OutreachListMemberInsert =
  Database["crm"]["Tables"]["outreach_list_member"]["Insert"];

// ── Closed vocabularies (from the live CHECK constraints; crm_02_core.sql) ──

export const LIST_KINDS = ["list", "email", "call", "mixed"] as const;
export type OutreachListKind = (typeof LIST_KINDS)[number];

export const LIST_STATUSES = [
  "draft",
  "active",
  "paused",
  "completed",
  "archived",
] as const;
export type OutreachListStatus = (typeof LIST_STATUSES)[number];

export const MEMBER_STATUSES = [
  "queued",
  "sent",
  "delivered",
  "opened",
  "clicked",
  "replied",
  "bounced",
  "connected",
  "voicemail",
  "no_answer",
  "not_interested",
  "meeting_booked",
  "suppressed",
  "done",
] as const;
export type MemberStatus = (typeof MEMBER_STATUSES)[number];

/**
 * Statuses the CALL queue will claim: fresh members plus retry states. A
 * retry state is only claimable once its `next_attempt_at` has passed.
 */
export const DIALABLE_STATUSES: readonly MemberStatus[] = [
  "queued",
  "no_answer",
  "voicemail",
];

/** Statuses that end a member's journey through the call queue. */
export const TERMINAL_STATUSES: readonly MemberStatus[] = [
  "connected",
  "replied",
  "not_interested",
  "meeting_booked",
  "suppressed",
  "done",
];

// ── Call dispositions (the queue's verbs → member status + retry policy) ────

export interface CallDisposition {
  id: string;
  label: string;
  /** The member status this disposition writes. */
  memberStatus: MemberStatus;
  /** Whether a `crm.interaction` call row is logged (skip logs nothing). */
  logsCall: boolean;
  /** Hours until the member is claimable again; null = terminal, no retry. */
  retryAfterHours: number | null;
  /**
   * "Do not call": ALSO suppresses the dialed medium (tenant-level DNC scrub
   * per the load-bearing split — the medium owns suppression) and flags the
   * party `do_not_contact`.
   */
  suppresses?: boolean;
}

export const CALL_DISPOSITIONS: readonly CallDisposition[] = [
  {
    id: "connected",
    label: "Connected",
    memberStatus: "connected",
    logsCall: true,
    retryAfterHours: null,
  },
  {
    id: "meeting_booked",
    label: "Meeting booked",
    memberStatus: "meeting_booked",
    logsCall: true,
    retryAfterHours: null,
  },
  {
    id: "voicemail",
    label: "Voicemail",
    memberStatus: "voicemail",
    logsCall: true,
    retryAfterHours: 24,
  },
  {
    id: "no_answer",
    label: "No answer",
    memberStatus: "no_answer",
    logsCall: true,
    retryAfterHours: 4,
  },
  {
    id: "not_interested",
    label: "Not interested",
    memberStatus: "not_interested",
    logsCall: true,
    retryAfterHours: null,
  },
  {
    id: "do_not_call",
    label: "Do not call",
    memberStatus: "suppressed",
    logsCall: true,
    retryAfterHours: null,
    suppresses: true,
  },
] as const;

/** How long one claim holds a member before other reps can take it. */
export const CLAIM_MINUTES = 10;

/** Skip pushes the member this far down the queue without logging a call. */
export const SKIP_DEFER_MINUTES = 15;

// ── Joined shapes ───────────────────────────────────────────────────────────

/** One outreach list row with its live member count. */
export type OutreachListWithCount = OutreachListRow & {
  members: { count: number }[];
};

/** Member row joined to its party — the detail table's read shape. */
export type OutreachListMemberWithParty = OutreachListMemberRow & {
  party: Pick<
    PartyRow,
    | "id"
    | "display_name"
    | "party_kind"
    | "job_title"
    | "do_not_contact"
    | "primary_employer_party_id"
  > | null;
};

/** Per-status member counts for the outreach list header rollup. */
export type MemberStatusCounts = Partial<Record<MemberStatus, number>> & {
  total: number;
  /** Claimable right now (dialable status + retry window passed). */
  dialable: number;
};

// ── Dial targets (suppression resolved BEFORE a number is offered) ──────────

/** Why a phone number may not be dialed. Shown, never silently hidden. */
/**
 * Alias of the platform-wide contact block reason — the rule and its labels
 * live in `features/crm/reachability.ts` and are shared with every surface
 * that asks whether a contact point may be used. Never re-declare the union.
 */
export type DialBlockReason = ContactBlockReason;

export interface DialTarget {
  point: PartyContactPointRow;
  medium: ContactMediumRow;
  /** E.164 display value. */
  display: string;
  /** null = dialable; otherwise the reason this number is blocked. */
  blocked: DialBlockReason | null;
}

/** Everything the dial card needs for one claimed member. */
export interface QueueEntry {
  member: OutreachListMemberRow;
  detail: import("../types").PartyDetail;
  targets: DialTarget[];
  /** True when not a single target is dialable — the queue auto-suppresses. */
  undialable: boolean;
}

/** Session tally the dialer shows (resets per visit — it is a work rhythm). */
export interface DialSessionStats {
  dialed: number;
  connected: number;
  meetings: number;
  skipped: number;
  suppressed: number;
}

export const EMPTY_SESSION_STATS: DialSessionStats = {
  dialed: 0,
  connected: 0,
  meetings: 0,
  skipped: 0,
  suppressed: 0,
};
