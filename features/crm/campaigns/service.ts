// features/crm/campaigns/service.ts
//
// Direct browser → Supabase (`supabase.schema("crm")`) for the campaign
// builder + call queue. No Next.js hop, no Python hop — plain DB reads/writes
// (CLAUDE.md § Data flow); RLS is the authorization layer.
//
// THE THREE RULES THIS FILE ENFORCES:
//   1. `crm.campaign_member` is a COMPONENT table — INSERT…RETURNING 42501s
//      under the id-list std_select policy (D181). Every insert here is bare;
//      needing the row means re-reading it. UPDATE…RETURNING is fine (the row
//      already exists in the statement snapshot) and is exactly how the claim
//      lock works.
//   2. The claim lock is a CONDITIONAL UPDATE: `claimed_by`/`claimed_until`
//      are only taken when the previous claim is absent, expired, or our own.
//      Zero rows back = another rep won the race — move to the next candidate.
//   3. Suppression is resolved BEFORE a number is offered. A dial target is
//      blocked by party DNC, contact-point opt-out, or the medium's
//      deliverability state (`is_contactable`, DNC listing, suppression) —
//      and a member with no dialable number is marked `suppressed`, never
//      silently dialed.

import { supabase } from "@/utils/supabase/client";
import {
  applyPartyListPredicates,
  fetchPartyDetail,
  updateParty,
} from "../service";
import type {
  CrmQueryContext,
  PartyDetail,
  PartyListQuery,
} from "../types";
import type {
  CampaignListRow,
  CampaignMemberRow,
  CampaignMemberWithParty,
  CampaignRow,
  CampaignStatus,
  CallDisposition,
  DialTarget,
  MemberStatus,
  MemberStatusCounts,
  QueueEntry,
} from "./types";
import {
  CAMPAIGN_KINDS,
  CLAIM_MINUTES,
  DIALABLE_STATUSES,
  MEMBER_STATUSES,
  SKIP_DEFER_MINUTES,
} from "./types";
import type { CampaignKind } from "./types";

// ── Error mapping (same contract as ../service.ts) ──────────────────────────

function pgError(error: { message?: string; code?: string }): Error {
  return new Error(
    error.message?.trim()
      ? `${error.message}${error.code ? ` (${error.code})` : ""}`
      : "Supabase returned an error with no message — usually a gateway/PostgREST " +
        "failure rather than a query error.",
  );
}

function crm() {
  return supabase.schema("crm");
}

// ── Campaign CRUD ───────────────────────────────────────────────────────────

/**
 * Campaigns this user can work: created by me OR in one of my orgs — the
 * declared scope of the campaign console (THE VIEW LAW; campaigns are a
 * sales-floor tool, not a browse surface, so one blended work scope).
 */
export async function fetchCampaigns(ctx: CrmQueryContext): Promise<
  CampaignListRow[]
> {
  let q = crm()
    .from("campaign")
    // Embedded count = live members only (soft-deleted rows excluded).
    .select("*, members:campaign_member(count)")
    .is("deleted_at", null)
    .is("members.deleted_at", null)
    .order("updated_at", { ascending: false })
    .order("id", { ascending: true });
  q = ctx.orgIds.length
    ? q.or(
        `created_by.eq.${ctx.userId},organization_id.in.(${ctx.orgIds.join(",")})`,
      )
    : q.eq("created_by", ctx.userId);
  const { data, error } = await q;
  if (error) throw pgError(error);
  return (data ?? []) as CampaignListRow[];
}

export async function fetchCampaign(id: string): Promise<CampaignRow> {
  const { data, error } = await crm()
    .from("campaign")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw pgError(error);
  return data;
}

export async function createCampaign(input: {
  name: string;
  kind: CampaignKind;
  description?: string;
  orgId: string;
}): Promise<CampaignRow> {
  if (!(CAMPAIGN_KINDS as readonly string[]).includes(input.kind)) {
    throw new Error(`Unknown campaign kind: ${input.kind}`);
  }
  const { data, error } = await crm()
    .from("campaign")
    .insert({
      name: input.name.trim(),
      campaign_kind: input.kind,
      description: input.description?.trim() || null,
      organization_id: input.orgId,
    })
    .select("*")
    .single();
  if (error) throw pgError(error);
  return data;
}

export async function updateCampaign(
  id: string,
  patch: { name?: string; description?: string | null },
): Promise<void> {
  const { error } = await crm().from("campaign").update(patch).eq("id", id);
  if (error) throw pgError(error);
}

/** Status transitions stamp the lifecycle timestamps they imply. */
export async function setCampaignStatus(
  campaign: CampaignRow,
  status: CampaignStatus,
): Promise<void> {
  const patch: Record<string, unknown> = { status };
  if (status === "active" && !campaign.started_at) {
    patch.started_at = new Date().toISOString();
  }
  if (status === "completed" || status === "archived") {
    patch.ended_at = campaign.ended_at ?? new Date().toISOString();
  }
  const { error } = await crm()
    .from("campaign")
    .update(patch)
    .eq("id", campaign.id);
  if (error) throw pgError(error);
}

/** Soft-delete. Members stay (cascade is a hard-delete concern, not trash). */
export async function deleteCampaign(id: string): Promise<void> {
  const { error } = await crm()
    .from("campaign")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw pgError(error);
}

// ── Members: read ───────────────────────────────────────────────────────────

const MEMBER_EMBED =
  "*, party:party_id(id,display_name,party_kind,job_title,do_not_contact,primary_employer_party_id)";

export async function fetchCampaignMembers(args: {
  campaignId: string;
  page: number;
  pageSize: number;
  status?: MemberStatus | "all";
  /** Case-insensitive substring on the member's party name (inner join). */
  search?: string;
}): Promise<{ rows: CampaignMemberWithParty[]; total: number }> {
  const term = args.search?.replace(/[,()]/g, " ").trim();
  let q = crm()
    .from("campaign_member")
    .select(
      term
        ? "*, party:party_id!inner(id,display_name,party_kind,job_title,do_not_contact,primary_employer_party_id)"
        : MEMBER_EMBED,
      { count: "exact" },
    )
    .eq("campaign_id", args.campaignId)
    .is("deleted_at", null);
  if (args.status && args.status !== "all") q = q.eq("status", args.status);
  if (term) q = q.ilike("party.display_name", `%${term}%`);
  const from = (args.page - 1) * args.pageSize;
  const { data, error, count } = await q
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .range(from, from + args.pageSize - 1)
    .returns<CampaignMemberWithParty[]>();
  if (error) throw pgError(error);
  return { rows: data ?? [], total: count ?? 0 };
}

/** Per-status totals + the live "claimable now" count for the header. */
export async function fetchMemberStatusCounts(
  campaignId: string,
): Promise<MemberStatusCounts> {
  const base = () =>
    crm()
      .from("campaign_member")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaignId)
      .is("deleted_at", null);

  const nowIso = new Date().toISOString();
  const results = await Promise.all([
    base(), // total
    base()
      .in("status", [...DIALABLE_STATUSES])
      .or(`next_attempt_at.is.null,next_attempt_at.lte.${nowIso}`), // dialable
    ...MEMBER_STATUSES.map((status) => base().eq("status", status)),
  ]);
  for (const r of results) if (r.error) throw pgError(r.error);

  const counts: MemberStatusCounts = {
    total: results[0].count ?? 0,
    dialable: results[1].count ?? 0,
  };
  MEMBER_STATUSES.forEach((status, i) => {
    const n = results[i + 2].count ?? 0;
    if (n > 0) counts[status] = n;
  });
  return counts;
}

/** Every live member's party_id — the enrollment dedup source. */
export async function fetchExistingMemberPartyIds(
  campaignId: string,
): Promise<Set<string>> {
  const out = new Set<string>();
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await crm()
      .from("campaign_member")
      .select("party_id")
      .eq("campaign_id", campaignId)
      .is("deleted_at", null)
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw pgError(error);
    for (const row of data ?? []) out.add(row.party_id);
    if (!data || data.length < pageSize) break;
  }
  return out;
}

// ── Members: enroll ─────────────────────────────────────────────────────────

/**
 * Enroll parties. Already-enrolled parties are skipped (the unique key is
 * `(campaign_id, party_id) where deleted_at is null` — one bare insert per
 * batch would abort the whole batch on a single duplicate). Bare inserts:
 * component RETURNING is forbidden (rule 1).
 */
export async function addMembersByPartyIds(args: {
  campaign: CampaignRow;
  partyIds: string[];
}): Promise<{ added: number; skippedExisting: number }> {
  const existing = await fetchExistingMemberPartyIds(args.campaign.id);
  const fresh = Array.from(new Set(args.partyIds)).filter(
    (id) => !existing.has(id),
  );
  const skippedExisting = args.partyIds.length - fresh.length;

  for (let i = 0; i < fresh.length; i += 200) {
    const batch = fresh.slice(i, i + 200).map((partyId) => ({
      campaign_id: args.campaign.id,
      party_id: partyId,
      organization_id: args.campaign.organization_id,
    }));
    const { error } = await crm().from("campaign_member").insert(batch);
    if (error) throw pgError(error);
  }
  return { added: fresh.length, skippedExisting };
}

/**
 * Preview what a party-list filter would enroll: total matches and how many
 * of them are flagged do-not-contact (excluded by default for call work).
 */
export async function fetchFilterPreview(
  query: PartyListQuery,
  ctx: CrmQueryContext,
): Promise<{ total: number; dncCount: number }> {
  const count = async (dncOnly: boolean) => {
    let q = applyPartyListPredicates(
      crm().from("party").select("id", { count: "exact", head: true }),
      query,
      ctx,
    );
    if (dncOnly) q = q.eq("do_not_contact", true);
    const { count: n, error } = await q;
    if (error) throw pgError(error);
    return n ?? 0;
  };
  const [total, dncCount] = await Promise.all([count(false), count(true)]);
  return { total, dncCount };
}

/** Hard ceiling on one filter-based enrollment — screamed, never silent. */
export const FILTER_ENROLL_CAP = 5000;

/**
 * Every party id the filter matches (same predicates as the /crm list via
 * `applyPartyListPredicates`), optionally excluding DNC-flagged parties.
 * Throws above FILTER_ENROLL_CAP rather than silently truncating.
 */
export async function fetchPartyIdsByFilter(
  query: PartyListQuery,
  ctx: CrmQueryContext,
  opts: { excludeDnc: boolean },
): Promise<string[]> {
  const out: string[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    let q = applyPartyListPredicates(
      crm().from("party").select("id"),
      query,
      ctx,
    );
    if (opts.excludeDnc) q = q.eq("do_not_contact", false);
    const { data, error } = await q
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw pgError(error);
    for (const row of data ?? []) out.push(row.id);
    if (out.length > FILTER_ENROLL_CAP) {
      throw new Error(
        `This filter matches more than ${FILTER_ENROLL_CAP.toLocaleString()} records — narrow it before enrolling.`,
      );
    }
    if (!data || data.length < pageSize) break;
  }
  return out;
}

/** Remove a member from the campaign (soft — the party is untouched). */
export async function removeMember(memberId: string): Promise<void> {
  const { error } = await crm()
    .from("campaign_member")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", memberId);
  if (error) throw pgError(error);
}

/** Put a worked member back at the front of the queue. */
export async function requeueMember(memberId: string): Promise<void> {
  const { error } = await crm()
    .from("campaign_member")
    .update({
      status: "queued",
      next_attempt_at: null,
      claimed_by: null,
      claimed_until: null,
    })
    .eq("id", memberId);
  if (error) throw pgError(error);
}

// ── The claim lock ──────────────────────────────────────────────────────────

/**
 * Claim the next workable member, race-safely, WITHOUT an RPC:
 *   1. read a few candidates (dialable status, retry window passed, claim
 *      absent/expired/ours) in queue order;
 *   2. take each with a CONDITIONAL update re-asserting every predicate —
 *      rule 2: zero rows back means another rep won that row; try the next.
 * Two reps power-dialing the same campaign therefore never hold the same
 * person at once (within the CLAIM_MINUTES lease).
 */
export async function claimNextMember(args: {
  campaignId: string;
  userId: string;
}): Promise<CampaignMemberRow | null> {
  const nowIso = new Date().toISOString();
  const claimFree = `claimed_until.is.null,claimed_until.lt.${nowIso},claimed_by.eq.${args.userId}`;

  const { data: candidates, error } = await crm()
    .from("campaign_member")
    .select("id")
    .eq("campaign_id", args.campaignId)
    .is("deleted_at", null)
    .in("status", [...DIALABLE_STATUSES])
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${nowIso}`)
    .or(claimFree)
    .order("next_attempt_at", { ascending: true, nullsFirst: true })
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(5);
  if (error) throw pgError(error);

  for (const candidate of candidates ?? []) {
    const until = new Date(Date.now() + CLAIM_MINUTES * 60_000).toISOString();
    const { data: claimed, error: claimError } = await crm()
      .from("campaign_member")
      .update({ claimed_by: args.userId, claimed_until: until })
      .eq("id", candidate.id)
      .is("deleted_at", null)
      .in("status", [...DIALABLE_STATUSES])
      .or(claimFree)
      .select("*")
      .maybeSingle();
    if (claimError) throw pgError(claimError);
    if (claimed) return claimed;
    // Someone else took it between the read and the update — next candidate.
  }
  return null;
}

/** Release a claim without working the member (leaving the dialer). */
export async function releaseClaim(args: {
  memberId: string;
  userId: string;
}): Promise<void> {
  const { error } = await crm()
    .from("campaign_member")
    .update({ claimed_by: null, claimed_until: null })
    .eq("id", args.memberId)
    .eq("claimed_by", args.userId);
  if (error) throw pgError(error);
}

/** Skip: release + defer so the same member doesn't bounce straight back. */
export async function skipMember(args: {
  memberId: string;
  userId: string;
}): Promise<void> {
  const { error } = await crm()
    .from("campaign_member")
    .update({
      claimed_by: null,
      claimed_until: null,
      next_attempt_at: new Date(
        Date.now() + SKIP_DEFER_MINUTES * 60_000,
      ).toISOString(),
    })
    .eq("id", args.memberId)
    .eq("claimed_by", args.userId);
  if (error) throw pgError(error);
}

// ── Suppression → dial targets (rule 3) ─────────────────────────────────────

/**
 * Resolve every phone contact point into a dial target with its block state.
 * Block precedence: party DNC → point opt-out → medium DNC listing →
 * medium suppression/deliverability (`is_contactable` is the DB-generated
 * catch-all: suppressed, unsubscribed, DNC-listed, or invalid).
 */
export function computeDialTargets(detail: PartyDetail): DialTarget[] {
  const targets: DialTarget[] = [];
  for (const point of detail.contactPoints) {
    if (point.medium.channel !== "phone") continue;
    let blocked: DialTarget["blocked"] = null;
    if (detail.party.do_not_contact) blocked = "party_dnc";
    else if (point.opt_out_at) blocked = "point_opted_out";
    else if (point.medium.dnc_state === "listed") blocked = "medium_dnc_listed";
    else if (point.medium.verification_status === "invalid")
      blocked = "medium_invalid";
    else if (point.medium.suppressed_at || point.medium.is_contactable === false)
      blocked = "medium_suppressed";
    targets.push({
      point,
      medium: point.medium,
      display:
        point.medium.display_value ??
        point.medium.value_key +
          (point.extension ? ` x${point.extension}` : ""),
      blocked,
    });
  }
  // Dialable first, then primaries first — the top row is the number to dial.
  return targets.sort((a, b) => {
    if (!!a.blocked !== !!b.blocked) return a.blocked ? 1 : -1;
    if (a.point.is_primary !== b.point.is_primary)
      return a.point.is_primary ? -1 : 1;
    return 0;
  });
}

/** Load everything the dial card needs for one claimed member. */
export async function buildQueueEntry(
  member: CampaignMemberRow,
): Promise<QueueEntry> {
  const detail = await fetchPartyDetail(member.party_id);
  const targets = computeDialTargets(detail);
  return {
    member,
    detail,
    targets,
    undialable: !targets.some((t) => !t.blocked),
  };
}

/**
 * A claimed member that cannot legally be dialed is marked `suppressed` (with
 * the reason in notes) so the queue drains instead of re-serving it — loud in
 * the session tally, never a silent skip.
 */
export async function markMemberSuppressed(args: {
  memberId: string;
  userId: string;
  reason: string;
}): Promise<void> {
  const { error } = await crm()
    .from("campaign_member")
    .update({
      status: "suppressed",
      notes: args.reason,
      claimed_by: null,
      claimed_until: null,
    })
    .eq("id", args.memberId)
    .eq("claimed_by", args.userId);
  if (error) throw pgError(error);
}

// ── Disposition (log the call + advance the member) ─────────────────────────

export async function dispositionCall(args: {
  campaign: CampaignRow;
  member: CampaignMemberRow;
  disposition: CallDisposition;
  userId: string;
  /** The number actually dialed (null when no call connected the UI). */
  target: DialTarget | null;
  notes?: string;
}): Promise<void> {
  const nowIso = new Date().toISOString();
  const attempt = args.member.attempt_count + 1;
  const notes = args.notes?.trim() || null;

  // 1. The interaction is the permanent record — write it first so a crash
  //    between the two writes leaves a logged call with a stale member row
  //    (self-healing: the member is still claimable), never a silently
  //    advanced member with no record. Bare insert (component RETURNING, D181).
  if (args.disposition.logsCall) {
    const { error } = await crm().from("interaction").insert({
      party_id: args.member.party_id,
      organization_id: args.member.organization_id,
      campaign_id: args.campaign.id,
      contact_point_id: args.target?.point.id ?? null,
      channel_code: "call",
      direction: "outbound",
      status: "completed",
      subject: `Call — ${args.campaign.name}`,
      body: notes,
      occurred_at: nowIso,
      attempt_number: attempt,
      performed_by: args.userId,
    });
    if (error) throw pgError(error);
  }

  // 2. Advance the member — guarded by OUR claim so an expired claim that a
  //    colleague re-took is never clobbered. Zero rows = claim lost: loud.
  const { data, error } = await crm()
    .from("campaign_member")
    .update({
      status: args.disposition.memberStatus,
      attempt_count: args.disposition.logsCall
        ? attempt
        : args.member.attempt_count,
      last_attempt_at: args.disposition.logsCall
        ? nowIso
        : args.member.last_attempt_at,
      next_attempt_at:
        args.disposition.retryAfterHours != null
          ? new Date(
              Date.now() + args.disposition.retryAfterHours * 3600_000,
            ).toISOString()
          : null,
      claimed_by: null,
      claimed_until: null,
      ...(notes ? { notes } : {}),
    })
    .eq("id", args.member.id)
    .eq("claimed_by", args.userId)
    .select("id")
    .maybeSingle();
  if (error) throw pgError(error);
  if (!data) {
    throw new Error(
      "Your claim on this member expired and another rep took it — the call was logged, but their state was not changed.",
    );
  }

  // 3. "Do not call" also scrubs the value itself: suppression lives on the
  //    MEDIUM (one update covers every party sharing the number) and the
  //    party is flagged so no channel offers them again.
  if (args.disposition.suppresses) {
    if (args.target) {
      const { error: mediumError } = await crm()
        .from("contact_medium")
        .update({
          suppressed_at: nowIso,
          suppression_reason: "dnc_request",
        })
        .eq("id", args.target.medium.id);
      if (mediumError) throw pgError(mediumError);
    }
    await updateParty(args.member.party_id, {
      do_not_contact: true,
      do_not_contact_reason: `Requested during call (${args.campaign.name}, ${nowIso.slice(0, 10)})`,
    });
  }
}
