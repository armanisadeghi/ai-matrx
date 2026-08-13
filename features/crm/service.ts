// features/crm/service.ts
//
// Direct browser → Supabase (`supabase.schema("crm")`). No Next.js hop, no
// Python hop: these are plain DB reads/writes the browser is entitled to make
// (CLAUDE.md § Data flow). RLS + the crm_* SECURITY DEFINER RPCs are the
// authorization layer.
//
// THE TWO RULES THIS FILE ENFORCES (features/crm/FEATURE.md):
//   1. Contact points are ALWAYS read joined to their medium — the email/phone
//      string lives on `crm.contact_medium`, never on the party or the point.
//      Creating one is find-or-create the medium FIRST, then link it.
//   2. Setting a primary goes through `public.crm_set_primary_contact_point`.
//      A direct `is_primary = true` update 23505s by design (partial unique
//      indexes cannot be DEFERRABLE).

import { supabase } from "@/utils/supabase/client";
import type {
  AddressInsert,
  DedupScanResult,
  MergeCandidateWithParties,
  PartyMergeWithParties,
  AffiliationWithEmployer,
  AffiliationWithPerson,
  ContactChannel,
  ContactMediumRow,
  ContactPoint,
  ContactPurpose,
  CrmQueryContext,
  DateBucket,
  InteractionChannel,
  InteractionDirection,
  PartyDetail,
  PartyKind,
  PartyListQuery,
  PartyListRow,
  PartyRef,
  PartyRow,
  PartySortOpts,
  PartyUpdate,
} from "./types";
import { DATE_BUCKETS, PARTY_SORT_KEYS } from "./types";
import type { EntityScopeCounts } from "@/lib/entity-list/types";

// ── Error mapping ───────────────────────────────────────────────────────────

function pgError(error: { message?: string; code?: string }): Error {
  return new Error(
    error.message?.trim()
      ? `${error.message}${error.code ? ` (${error.code})` : ""}`
      : "Supabase returned an error with no message — usually a gateway/PostgREST " +
        "failure rather than a query error.",
  );
}

// ── Value normalization (mirrors the live CHECK constraints) ────────────────

/**
 * Normalize a raw value into the medium's `value_key`. The DB enforces:
 * email → lowercase; phone → E.164 (`^\+[1-9][0-9]{6,14}$`). Throws a
 * human-readable error when the value cannot be normalized — surfacing it
 * beats letting the CHECK constraint produce a cryptic 23514.
 */
export function normalizeMediumValue(
  channel: ContactChannel,
  raw: string,
): { valueKey: string; valueRaw: string; displayValue: string } {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("Value is required");

  if (channel === "email") {
    const key = trimmed.toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(key)) {
      throw new Error(`"${trimmed}" is not a valid email address`);
    }
    return { valueKey: key, valueRaw: trimmed, displayValue: key };
  }

  if (channel === "phone") {
    const digits = trimmed.replace(/[^\d+]/g, "");
    let key: string;
    if (digits.startsWith("+")) {
      key = `+${digits.slice(1).replace(/\D/g, "")}`;
    } else {
      const bare = digits.replace(/\D/g, "");
      // Bare 10-digit numbers are assumed US/CA; 11 digits starting with 1 too.
      if (bare.length === 10) key = `+1${bare}`;
      else if (bare.length === 11 && bare.startsWith("1")) key = `+${bare}`;
      else key = `+${bare}`;
    }
    if (!/^\+[1-9][0-9]{6,14}$/.test(key)) {
      throw new Error(
        `"${trimmed}" is not a valid phone number — use international format, e.g. +13105551234`,
      );
    }
    return { valueKey: key, valueRaw: trimmed, displayValue: key };
  }

  // social / messaging / url / external_id: case-insensitive identity key.
  return {
    valueKey: trimmed.toLowerCase(),
    valueRaw: trimmed,
    displayValue: trimmed,
  };
}

// ── List page ───────────────────────────────────────────────────────────────

/** Strip PostgREST `or()` metacharacters so a search term can't break syntax. */
function sanitizeSearch(term: string): string {
  return term.replace(/[,()]/g, " ").trim();
}

function bucketSince(bucket: DateBucket): string {
  const def = DATE_BUCKETS.find((b) => b.value === bucket);
  const hours = def?.hours ?? 24 * 30;
  return new Date(Date.now() - hours * 3600_000).toISOString();
}

// Embed BY THE FK COLUMN ITSELF (`employer:primary_employer_party_id(...)`):
// on a self-join, both the FK-name hint and the table-name hint are
// directionally ambiguous — PostgREST resolved `party!primary_employer_party_id`
// in REVERSE ("parties whose primary employer is this row", an array). Naming
// the local FK column as the embed target is the one unambiguous forward
// spelling, returning ONE nullable object.
const EMPLOYER_EMBED =
  "*, employer:primary_employer_party_id(id,display_name,party_kind)";

/**
 * One page of parties + the TRUE total, with the scope, kind facet, column
 * filters, search, sort and paging all applied SERVER-SIDE (PostgREST over the
 * whole result set — never a client-side slice).
 *
 * THE VIEW LAW: the scope predicate is explicit per scope kind —
 *   mine → created_by = me · orgs → organization_id ∈ my orgs (or one org) ·
 *   public → visibility = 'public'. Never a bare RLS-filtered read.
 */
/**
 * The filter methods the party predicates use, structurally — so ONE helper
 * serves builders parameterized on different select strings (the list page's
 * embed select and the campaign flow's id-only select). PostgREST builder
 * methods return `this`, which satisfies the recursive `Q`.
 */
type PartyPredicateBuilder<Q> = {
  is(column: string, value: null): Q;
  not(column: string, operator: string, value: unknown): Q;
  eq(column: string, value: unknown): Q;
  in(column: string, values: readonly unknown[]): Q;
  ilike(column: string, pattern: string): Q;
  gte(column: string, value: string): Q;
  or(filters: string): Q;
};

/**
 * Apply the FULL party-list predicate set (canonical, view, scope, kind facet,
 * column filters, search) to a `crm.party` PostgREST builder. Shared by the
 * list page AND the campaign "add members from filters" flow, so the records
 * a filter previews and the records a campaign enrolls can never diverge.
 */
export function applyPartyListPredicates<Q extends PartyPredicateBuilder<Q>>(
  builder: Q,
  query: PartyListQuery,
  ctx: CrmQueryContext,
): Q {
  // Merge losers stay live on purpose (unmerge needs them); lists show only
  // canonical records.
  let q = builder.is("canonical_id", null);
  // Trash is the same list over the soft-deleted rows — scope still applies.
  q =
    query.view === "trash"
      ? q.not("deleted_at", "is", null)
      : q.is("deleted_at", null);

  // Scope — explicit, per THE VIEW LAW.
  const scope = query.scope;
  if (scope.kind === "mine") {
    q = q.eq("created_by", ctx.userId);
  } else if (scope.kind === "orgs") {
    q = scope.organizationId
      ? q.eq("organization_id", scope.organizationId)
      : q.in("organization_id", ctx.orgIds);
  } else if (scope.kind === "public") {
    q = q.eq("visibility", "public");
  } else {
    throw new Error(`[crm] unsupported list scope: ${scope.kind}`);
  }

  // Kind facet (People / Companies).
  if (query.kind !== "all") q = q.eq("party_kind", query.kind);

  // Column filters — each one a real server predicate.
  const f = query.filters;
  if (f.display_name) q = q.ilike("display_name", `%${f.display_name}%`);
  if (f.job_title) q = q.ilike("job_title", `%${f.job_title}%`);
  if (f.primary_domain) q = q.ilike("primary_domain", `%${f.primary_domain}%`);
  if (f.party_kind && f.party_kind.length > 0)
    q = q.in("party_kind", f.party_kind);
  if (f.do_not_contact !== undefined)
    q = q.eq("do_not_contact", f.do_not_contact);
  if (f.updated_at) q = q.gte("updated_at", bucketSince(f.updated_at));
  if (f.created_at) q = q.gte("created_at", bucketSince(f.created_at));

  // Search across the human identity columns.
  const term = sanitizeSearch(query.search);
  if (term) {
    q = q.or(
      [
        `display_name.ilike.%${term}%`,
        `legal_name.ilike.%${term}%`,
        `primary_domain.ilike.%${term}%`,
        `job_title.ilike.%${term}%`,
      ].join(","),
    );
  }
  return q;
}

export async function fetchPartyPage(
  query: PartyListQuery,
  opts: PartySortOpts,
  ctx: CrmQueryContext,
): Promise<{ rows: PartyListRow[]; total: number }> {
  let q = applyPartyListPredicates(
    supabase
      .schema("crm")
      .from("party")
      .select(EMPLOYER_EMBED, { count: "exact" }),
    query,
    ctx,
  );

  // Sort — DB columns only, whitelisted; stale stored keys fall back rather
  // than erroring. EVERY order ends in `id` (total order — rows can never
  // vanish across pages; see project_unstable_pagination_class).
  const sortKey = (PARTY_SORT_KEYS as readonly string[]).includes(opts.sort)
    ? opts.sort
    : "updated_at";
  q = q
    .order(sortKey, { ascending: opts.direction === "asc" })
    .order("id", { ascending: true });

  const from = (query.page - 1) * opts.pageSize;
  // `.returns<>` because postgrest-js cannot infer the column-as-target embed
  // (it reports SelectQueryError for self-join column targets), while PostgREST
  // itself serves exactly this to-one shape — browser-verified 2026-07-27.
  // The override composes generated rows only; nothing is hand-mirrored.
  const { data, error, count } = await q
    .range(from, from + opts.pageSize - 1)
    .returns<PartyListRow[]>();
  if (error) throw pgError(error);

  return { rows: data ?? [], total: count ?? 0 };
}

/**
 * True server totals for every scope tab (and per-org narrowing options),
 * honoring the current search + kind facet so the numbers describe what the
 * tab would actually show.
 */
export async function fetchPartyScopeCounts(
  query: PartyListQuery,
  ctx: CrmQueryContext,
): Promise<EntityScopeCounts> {
  const countFor = async (
    apply: (
      q: ReturnType<ReturnType<typeof supabase.schema<"crm">>["from"]>,
    ) => unknown,
  ): Promise<number> => {
    let q = supabase
      .schema("crm")
      .from("party")
      .select("id", { count: "exact", head: true })
      .is("canonical_id", null);
    q =
      query.view === "trash"
        ? q.not("deleted_at", "is", null)
        : q.is("deleted_at", null);
    if (query.kind !== "all") q = q.eq("party_kind", query.kind);
    const term = sanitizeSearch(query.search);
    if (term) {
      q = q.or(
        [
          `display_name.ilike.%${term}%`,
          `legal_name.ilike.%${term}%`,
          `primary_domain.ilike.%${term}%`,
          `job_title.ilike.%${term}%`,
        ].join(","),
      );
    }
    const scoped = apply(q) as typeof q;
    const { count, error } = await scoped;
    if (error) throw pgError(error);
    return count ?? 0;
  };

  const [mine, orgsBlended, pub, ...perOrg] = await Promise.all([
    countFor((q) => q.eq("created_by", ctx.userId)),
    countFor((q) => q.in("organization_id", ctx.orgIds)),
    countFor((q) => q.eq("visibility", "public")),
    ...ctx.orgIds.map((orgId) =>
      countFor((q) => q.eq("organization_id", orgId)),
    ),
  ]);

  const narrow = ctx.orgIds
    .map((orgId, i) => ({
      id: orgId,
      label: ctx.orgNames[orgId] ?? "Unnamed org",
      count: perOrg[i] ?? 0,
    }))
    .filter((o) => o.count > 0);

  return {
    byKind: { mine, orgs: orgsBlended, public: pub },
    narrow: { orgs: narrow },
  };
}

// ── Party CRUD ──────────────────────────────────────────────────────────────

export interface CreatePartyInput {
  kind: PartyKind;
  displayName: string;
  orgId: string;
  firstName?: string;
  lastName?: string;
  jobTitle?: string;
  primaryDomain?: string;
  headline?: string;
  /** Flexible per-record data (crm.party.attributes jsonb), e.g. research provenance. */
  attributes?: Record<string, unknown>;
}

export async function createParty(input: CreatePartyInput): Promise<PartyRow> {
  const { data, error } = await supabase
    .schema("crm")
    .from("party")
    .insert({
      party_kind: input.kind,
      display_name: input.displayName.trim(),
      organization_id: input.orgId,
      first_name: input.firstName?.trim() || null,
      last_name: input.lastName?.trim() || null,
      job_title: input.jobTitle?.trim() || null,
      primary_domain: input.primaryDomain?.trim() || null,
      headline: input.headline?.trim() || null,
      ...(input.attributes ? { attributes: input.attributes } : {}),
    })
    .select("*")
    .single();
  if (error) throw pgError(error);
  return data;
}

/**
 * Hydrate a set of party ids (e.g. ids collected off association edges) into
 * live rows. Soft-deleted parties are dropped — callers render what remains
 * and treat a missing id as an unlinked/trashed record, never an error.
 */
export async function fetchPartiesByIds(ids: string[]): Promise<PartyRow[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .schema("crm")
    .from("party")
    .select("*")
    .in("id", ids)
    .is("deleted_at", null);
  if (error) throw pgError(error);
  return data ?? [];
}

export async function updateParty(
  id: string,
  patch: PartyUpdate,
): Promise<void> {
  const { error } = await supabase
    .schema("crm")
    .from("party")
    .update(patch)
    .eq("id", id);
  if (error) throw pgError(error);
}

/** Soft-delete (trash). Real erasure is `crm_party_purge` — a separate act. */
export async function deleteParty(id: string): Promise<void> {
  const { error } = await supabase
    .schema("crm")
    .from("party")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw pgError(error);
}

/** Undo a soft delete — the row returns to every active list. */
export async function restoreParty(id: string): Promise<void> {
  const { error } = await supabase
    .schema("crm")
    .from("party")
    .update({ deleted_at: null })
    .eq("id", id);
  if (error) throw pgError(error);
}

/**
 * TRUE erasure via `public.crm_party_purge` — admin-gated in the RPC; also
 * clears `history.row_versions`, comments and user_entity_state. Irreversible.
 */
export async function purgeParty(id: string): Promise<void> {
  const { error } = await supabase.rpc("crm_party_purge", { p_party: id });
  if (error) throw pgError(error);
}

// ── Record detail ───────────────────────────────────────────────────────────

export async function fetchPartyDetail(partyId: string): Promise<PartyDetail> {
  const crm = supabase.schema("crm");

  const [party, points, addresses, affiliations, members, interactions] =
    await Promise.all([
      // Same `.returns<>` rationale as fetchPartyPage (column-as-target embed).
      crm
        .from("party")
        .select(EMPLOYER_EMBED)
        .eq("id", partyId)
        .single()
        .returns<PartyListRow>(),
      // RULE 1: contact points are ALWAYS read joined to their medium.
      crm
        .from("party_contact_point")
        .select("*, medium:contact_medium(*)")
        .eq("party_id", partyId)
        .is("deleted_at", null)
        .order("is_primary", { ascending: false })
        .order("created_at", { ascending: true }),
      crm
        .from("address")
        .select("*")
        .eq("party_id", partyId)
        .is("deleted_at", null)
        .order("is_primary", { ascending: false })
        .order("created_at", { ascending: true }),
      crm
        .from("affiliation")
        .select(
          "*, employer:party!employer_party_id(id,display_name,party_kind)",
        )
        .eq("party_id", partyId)
        .is("deleted_at", null)
        .order("is_current", { ascending: false })
        .order("start_date", { ascending: false, nullsFirst: false }),
      crm
        .from("affiliation")
        .select("*, person:party!party_id(id,display_name,party_kind)")
        .eq("employer_party_id", partyId)
        .is("deleted_at", null)
        .order("is_current", { ascending: false })
        .order("start_date", { ascending: false, nullsFirst: false }),
      crm
        .from("interaction")
        .select("*")
        .eq("party_id", partyId)
        .is("deleted_at", null)
        .order("occurred_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(200),
    ]);

  if (party.error) throw pgError(party.error);
  if (points.error) throw pgError(points.error);
  if (addresses.error) throw pgError(addresses.error);
  if (affiliations.error) throw pgError(affiliations.error);
  if (members.error) throw pgError(members.error);
  if (interactions.error) throw pgError(interactions.error);

  return {
    party: party.data,
    contactPoints: points.data ?? [],
    addresses: addresses.data ?? [],
    affiliations: affiliations.data ?? [],
    members: members.data ?? [],
    interactions: interactions.data ?? [],
  };
}

// ── Contact points (medium find-or-create, then link) ───────────────────────

/**
 * Find or create the org-level medium row for a normalized value. The unique
 * key is `(organization_id, channel, coalesce(platform_slug,''), value_key)`
 * — an expression index PostgREST upsert can't target, so this is
 * select → insert → re-select on a 23505 race.
 */
export async function findOrCreateMedium(args: {
  orgId: string;
  channel: ContactChannel;
  value: string;
}): Promise<ContactMediumRow> {
  const { valueKey, valueRaw, displayValue } = normalizeMediumValue(
    args.channel,
    args.value,
  );

  const lookup = () =>
    supabase
      .schema("crm")
      .from("contact_medium")
      .select("*")
      .eq("organization_id", args.orgId)
      .eq("channel", args.channel)
      .eq("value_key", valueKey)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();

  const existing = await lookup();
  if (existing.error) throw pgError(existing.error);
  if (existing.data) return existing.data;

  const inserted = await supabase
    .schema("crm")
    .from("contact_medium")
    .insert({
      organization_id: args.orgId,
      channel: args.channel,
      value_key: valueKey,
      value_raw: valueRaw,
      display_value: displayValue,
    })
    .select("*")
    .single();

  if (inserted.error) {
    // 23505 = someone else created it between our select and insert. Re-read.
    if (inserted.error.code === "23505") {
      const raced = await lookup();
      if (raced.error) throw pgError(raced.error);
      if (raced.data) return raced.data;
    }
    throw pgError(inserted.error);
  }
  return inserted.data;
}

export async function addContactPoint(args: {
  partyId: string;
  orgId: string;
  channel: ContactChannel;
  value: string;
  label?: string;
  purpose?: ContactPurpose;
  /** Promoted via the RPC after insert — never written directly. */
  makePrimary?: boolean;
}): Promise<void> {
  const medium = await findOrCreateMedium({
    orgId: args.orgId,
    channel: args.channel,
    value: args.value,
  });

  // NOTE: `channel` is deliberately NOT written — crm._contact_point_shape()
  // denormalizes it from the medium; a client-written value would be a lie.
  //
  // NOTE: no `.select()` on this insert. Component tables carry an id-list
  // std_select policy (`id IN accessible_entity_ids(...)`), and the subquery
  // runs on the statement's snapshot — it can never contain the row being
  // inserted, so INSERT…RETURNING 42501s for every authenticated user. The
  // row IS visible to the very next statement (created_by lane), so needing
  // the id means re-reading it. Platform-wide defect: FOUND_DEFECTS.md.
  const { error } = await supabase
    .schema("crm")
    .from("party_contact_point")
    .insert({
      party_id: args.partyId,
      medium_id: medium.id,
      organization_id: args.orgId,
      label: args.label?.trim() || null,
      purpose_code: args.purpose ?? "work",
    });
  if (error) {
    if (error.code === "23505") {
      throw new Error("This contact method is already on this record");
    }
    throw pgError(error);
  }

  if (args.makePrimary) {
    const point = await supabase
      .schema("crm")
      .from("party_contact_point")
      .select("id")
      .eq("party_id", args.partyId)
      .eq("medium_id", medium.id)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();
    if (point.error) throw pgError(point.error);
    if (point.data) await setPrimaryContactPoint(point.data.id);
  }
}

/** RULE 2: primaries flip ONLY through the RPC (direct updates 23505). */
export async function setPrimaryContactPoint(id: string): Promise<void> {
  const { error } = await supabase.rpc("crm_set_primary_contact_point", {
    p_id: id,
  });
  if (error) throw pgError(error);
}

export async function removeContactPoint(id: string): Promise<void> {
  const { error } = await supabase
    .schema("crm")
    .from("party_contact_point")
    .update({ deleted_at: new Date().toISOString(), is_primary: false })
    .eq("id", id);
  if (error) throw pgError(error);
}

// ── Addresses ───────────────────────────────────────────────────────────────

export async function addAddress(
  input: Pick<
    AddressInsert,
    | "party_id"
    | "organization_id"
    | "label"
    | "purpose_code"
    | "line1"
    | "line2"
    | "locality"
    | "region"
    | "postal_code"
    | "country_code"
  >,
): Promise<void> {
  // No `.select()` — see addContactPoint: component INSERT…RETURNING 42501s
  // under the id-list std_select policy. Callers refetch the detail.
  const { error } = await supabase.schema("crm").from("address").insert(input);
  if (error) throw pgError(error);
}

export async function removeAddress(id: string): Promise<void> {
  const { error } = await supabase
    .schema("crm")
    .from("address")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw pgError(error);
}

// ── Employment (crm.affiliation — a real table, NEVER an association edge) ──

export async function addAffiliation(args: {
  partyId: string;
  employerPartyId: string;
  orgId: string;
  title?: string;
  department?: string;
  startDate?: string | null;
  isCurrent?: boolean;
  isPrimary?: boolean;
}): Promise<void> {
  const { error } = await supabase
    .schema("crm")
    .from("affiliation")
    .insert({
      party_id: args.partyId,
      employer_party_id: args.employerPartyId,
      organization_id: args.orgId,
      title: args.title?.trim() || null,
      department: args.department?.trim() || null,
      start_date: args.startDate || null,
      is_current: args.isCurrent ?? true,
      is_primary: args.isPrimary ?? false,
    });
  if (error) throw pgError(error);
}

/** "They left": end the stint — history stays, nothing is erased. */
export async function endAffiliation(id: string): Promise<void> {
  const { error } = await supabase
    .schema("crm")
    .from("affiliation")
    .update({
      is_current: false,
      is_primary: false,
      end_date: new Date().toISOString().slice(0, 10),
    })
    .eq("id", id);
  if (error) throw pgError(error);
}

/**
 * Name-search live parties (any kind) in one org workspace — the generic
 * "link an existing person/company" picker read. Small page, canonical rows
 * only (merged losers excluded).
 */
export async function searchPartiesByName(args: {
  orgId: string;
  search: string;
}): Promise<PartyRef[]> {
  let q = supabase
    .schema("crm")
    .from("party")
    .select("id,display_name,party_kind")
    .eq("organization_id", args.orgId)
    .is("deleted_at", null)
    .is("canonical_id", null)
    .order("display_name", { ascending: true })
    .limit(12);
  const term = sanitizeSearch(args.search);
  if (term) q = q.ilike("display_name", `%${term}%`);
  const { data, error } = await q;
  if (error) throw pgError(error);
  return data ?? [];
}

/**
 * Company candidates for the employer picker — organizations in the same org
 * workspace, name-searched, small page.
 */
export async function searchEmployerCandidates(args: {
  orgId: string;
  search: string;
  excludeId?: string;
}): Promise<PartyRef[]> {
  let q = supabase
    .schema("crm")
    .from("party")
    .select("id,display_name,party_kind")
    .eq("organization_id", args.orgId)
    .eq("party_kind", "organization")
    .is("deleted_at", null)
    .is("canonical_id", null)
    .order("display_name", { ascending: true })
    .limit(12);
  const term = sanitizeSearch(args.search);
  if (term) q = q.ilike("display_name", `%${term}%`);
  if (args.excludeId) q = q.neq("id", args.excludeId);
  const { data, error } = await q;
  if (error) throw pgError(error);
  return data ?? [];
}

// ── Bulk lookups (CSV import dry-run) ───────────────────────────────────────

/** Chunk a key list so no single PostgREST `in()` grows unbounded. */
function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Which of these normalized value keys already belong to a LIVE canonical
 * party in this org — the import dry-run's dedup source. Returns
 * valueKey → the owning party (first owner wins when a value sits on many).
 */
export async function findExistingMediumOwners(args: {
  orgId: string;
  channel: ContactChannel;
  valueKeys: string[];
}): Promise<Map<string, PartyRef>> {
  const out = new Map<string, PartyRef>();
  if (args.valueKeys.length === 0) return out;

  for (const keys of chunk(args.valueKeys, 200)) {
    const { data, error } = await supabase
      .schema("crm")
      .from("party_contact_point")
      // Table-name embeds are unambiguous here (exactly one FK each);
      // `!inner` makes the embed filters below narrow the point rows.
      .select(
        "medium:contact_medium!inner(value_key,channel), party:party!inner(id,display_name,party_kind)",
      )
      .eq("organization_id", args.orgId)
      .is("deleted_at", null)
      .eq("medium.channel", args.channel)
      .in("medium.value_key", keys)
      .is("party.deleted_at", null)
      .is("party.canonical_id", null);
    if (error) throw pgError(error);
    for (const row of data ?? []) {
      const key = row.medium?.value_key;
      const party = row.party;
      if (key && party && !out.has(key)) {
        out.set(key, {
          id: party.id,
          display_name: party.display_name,
          party_kind: party.party_kind,
        });
      }
    }
  }
  return out;
}

/**
 * Live canonical parties in this org whose display name matches one of these
 * names, case-insensitively — how the import links "Acme Corp" in a CSV cell
 * to the Acme record that already exists. Returns lowercased name → party.
 */
export async function findPartiesByNames(args: {
  orgId: string;
  kind: PartyKind;
  names: string[];
}): Promise<Map<string, PartyRef>> {
  const out = new Map<string, PartyRef>();
  const cleaned = args.names.map((n) => n.trim()).filter(Boolean);
  if (cleaned.length === 0) return out;

  // `ilike` with no wildcard = case-insensitive EXACT match — which requires
  // escaping the LIKE wildcards (%/_/\), or "Fifty% Off" would pattern-match
  // strangers. Double-quoting the whole value lets commas/parens ("Acme,
  // Inc.", "Foo (UK) Ltd") travel through PostgREST `or()` safely.
  const quote = (n: string) =>
    `"${n.replace(/\\/g, "\\\\").replace(/[%_]/g, "\\$&").replace(/"/g, '\\"')}"`;

  for (const names of chunk(cleaned, 50)) {
    const { data, error } = await supabase
      .schema("crm")
      .from("party")
      .select("id,display_name,party_kind")
      .eq("organization_id", args.orgId)
      .eq("party_kind", args.kind)
      .is("deleted_at", null)
      .is("canonical_id", null)
      .or(names.map((n) => `display_name.ilike.${quote(n)}`).join(","));
    if (error) throw pgError(error);
    for (const row of data ?? []) {
      const key = row.display_name.trim().toLowerCase();
      if (!out.has(key)) out.set(key, row);
    }
  }
  return out;
}

/**
 * Live canonical companies in this org by exact primary domain (stored
 * lowercase). Returns domain → party.
 */
export async function findPartiesByDomains(args: {
  orgId: string;
  domains: string[];
}): Promise<Map<string, PartyRef>> {
  const out = new Map<string, PartyRef>();
  const domains = args.domains.map((d) => d.trim().toLowerCase()).filter(Boolean);
  if (domains.length === 0) return out;

  for (const batch of chunk(domains, 200)) {
    const { data, error } = await supabase
      .schema("crm")
      .from("party")
      .select("id,display_name,party_kind,primary_domain")
      .eq("organization_id", args.orgId)
      .eq("party_kind", "organization")
      .is("deleted_at", null)
      .is("canonical_id", null)
      .in("primary_domain", batch);
    if (error) throw pgError(error);
    for (const row of data ?? []) {
      if (row.primary_domain && !out.has(row.primary_domain)) {
        out.set(row.primary_domain, {
          id: row.id,
          display_name: row.display_name,
          party_kind: row.party_kind,
        });
      }
    }
  }
  return out;
}

/**
 * Find-or-create a company by name (import commit path for employer cells).
 * Lookup is case-insensitive exact; creation writes the name as given.
 */
export async function findOrCreateCompanyByName(args: {
  orgId: string;
  name: string;
}): Promise<PartyRef> {
  const name = args.name.trim();
  const found = await findPartiesByNames({
    orgId: args.orgId,
    kind: "organization",
    names: [name],
  });
  const existing = found.get(name.toLowerCase());
  if (existing) return existing;
  const created = await createParty({
    kind: "organization",
    displayName: name,
    orgId: args.orgId,
  });
  return {
    id: created.id,
    display_name: created.display_name,
    party_kind: created.party_kind,
  };
}

// ── Dedup + merge (crm_03_dedup.sql) ────────────────────────────────────────
//
// Auto-merge fires ONLY inside the detection RPC, on identity-key collisions.
// Everything else is a suggestion the human decides on the review UI. A pair
// row is ordered (source_id < target_id) so mirrored duplicates can't exist,
// and a dismissal is durable across every future scan.

// Candidate embeds target the FK COLUMN (same rationale as EMPLOYER_EMBED —
// self-joins to crm.party are directionally ambiguous by table/FK name).
const MERGE_PARTY_COLS =
  "id,display_name,party_kind,job_title,primary_domain,created_at,canonical_id,deleted_at,organization_id";
const CANDIDATE_EMBED = `*, source:source_id(${MERGE_PARTY_COLS}), target:target_id(${MERGE_PARTY_COLS})`;

/**
 * Run detection for ONE org: auto-merges both-sides identity-key medium
 * collisions, refreshes weak-signal suggestions, returns the receipt.
 */
export async function runDedupScan(orgId: string): Promise<DedupScanResult> {
  const { data, error } = await supabase.rpc("crm_detect_merge_candidates", {
    p_org: orgId,
  });
  if (error) throw pgError(error);
  const result = data as unknown as DedupScanResult;
  if (!result || !Array.isArray(result.auto_merged)) {
    throw new Error("[crm] dedup scan returned an unexpected shape");
  }
  return result;
}

/**
 * Pending duplicate suggestions across the caller's orgs, both parties
 * resolved. Pairs whose parties are no longer both live canonical records are
 * filtered here (the next scan retires them server-side as 'stale').
 */
export async function fetchMergeCandidates(
  orgIds: string[],
): Promise<MergeCandidateWithParties[]> {
  if (orgIds.length === 0) return [];
  const { data, error } = await supabase
    .schema("crm")
    .from("merge_candidate")
    .select(CANDIDATE_EMBED)
    .eq("status", "pending")
    .is("deleted_at", null)
    .in("organization_id", orgIds)
    .order("confidence", { ascending: false })
    .order("last_detected_at", { ascending: false })
    .order("id", { ascending: true })
    .limit(200)
    .returns<MergeCandidateWithParties[]>();
  if (error) throw pgError(error);
  return (data ?? []).filter(
    (c) =>
      c.source &&
      c.target &&
      !c.source.deleted_at &&
      !c.target.deleted_at &&
      !c.source.canonical_id &&
      !c.target.canonical_id,
  );
}

/** True pending-suggestion count for the /crm indicator badge. */
export async function fetchPendingCandidateCount(
  orgIds: string[],
): Promise<number> {
  if (orgIds.length === 0) return 0;
  const { count, error } = await supabase
    .schema("crm")
    .from("merge_candidate")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending")
    .is("deleted_at", null)
    .in("organization_id", orgIds);
  if (error) throw pgError(error);
  return count ?? 0;
}

/** Pending suggestions naming THIS party (record-page indicator). */
export async function fetchCandidatesForParty(
  partyId: string,
): Promise<MergeCandidateWithParties[]> {
  const { data, error } = await supabase
    .schema("crm")
    .from("merge_candidate")
    .select(CANDIDATE_EMBED)
    .eq("status", "pending")
    .is("deleted_at", null)
    .or(`source_id.eq.${partyId},target_id.eq.${partyId}`)
    .order("confidence", { ascending: false })
    .returns<MergeCandidateWithParties[]>();
  if (error) throw pgError(error);
  return (data ?? []).filter(
    (c) =>
      c.source &&
      c.target &&
      !c.source.deleted_at &&
      !c.target.deleted_at &&
      !c.source.canonical_id &&
      !c.target.canonical_id,
  );
}

/** "Not duplicates" — durable: no future scan resurrects the pair. */
export async function dismissMergeCandidate(id: string): Promise<void> {
  const { error } = await supabase.rpc("crm_dismiss_merge_candidate", {
    p_id: id,
  });
  if (error) throw pgError(error);
}

/**
 * Merge loser into winner via `public.crm_merge_parties`. Children that would
 * collide stay on the loser (kept live with canonical_id set) so the recorded
 * unmerge is exact. Returns the merge id.
 */
export async function mergeParties(args: {
  winnerId: string;
  loserId: string;
  reason?: string;
}): Promise<string> {
  const { data, error } = await supabase.rpc("crm_merge_parties", {
    p_winner: args.winnerId,
    p_loser: args.loserId,
    p_method: "manual",
    p_reason: args.reason,
  });
  if (error) throw pgError(error);
  return data as string;
}

/** Exact replay of one recorded merge — the loser gets its children back. */
export async function unmergeParties(mergeId: string): Promise<void> {
  const { error } = await supabase.rpc("crm_unmerge_parties", {
    p_merge_id: mergeId,
  });
  if (error) throw pgError(error);
}

/** Active (un-undone) merges across the caller's orgs, newest first. */
export async function fetchRecentMerges(
  orgIds: string[],
): Promise<PartyMergeWithParties[]> {
  if (orgIds.length === 0) return [];
  const { data, error } = await supabase
    .schema("crm")
    .from("party_merge")
    .select(
      "*, winner:winner_id(id,display_name,party_kind), loser:loser_id(id,display_name,party_kind)",
    )
    .is("unmerged_at", null)
    .in("organization_id", orgIds)
    .order("merged_at", { ascending: false })
    .order("id", { ascending: true })
    .limit(25)
    .returns<PartyMergeWithParties[]>();
  if (error) throw pgError(error);
  return data ?? [];
}

/** Merge history touching THIS party (winner or loser side), newest first. */
export async function fetchMergesForParty(
  partyId: string,
): Promise<PartyMergeWithParties[]> {
  const { data, error } = await supabase
    .schema("crm")
    .from("party_merge")
    .select(
      "*, winner:winner_id(id,display_name,party_kind), loser:loser_id(id,display_name,party_kind)",
    )
    .or(`winner_id.eq.${partyId},loser_id.eq.${partyId}`)
    .order("merged_at", { ascending: false })
    .order("id", { ascending: true })
    .limit(25)
    .returns<PartyMergeWithParties[]>();
  if (error) throw pgError(error);
  return data ?? [];
}

// ── Interactions ────────────────────────────────────────────────────────────

export async function logInteraction(args: {
  partyId: string;
  orgId: string;
  channel: InteractionChannel;
  direction: InteractionDirection;
  subject?: string;
  body?: string;
  durationSeconds?: number | null;
  occurredAt?: string;
}): Promise<void> {
  // No `.select()` — see addContactPoint: component INSERT…RETURNING 42501s
  // under the id-list std_select policy. Callers refetch the timeline.
  const { error } = await supabase
    .schema("crm")
    .from("interaction")
    .insert({
      party_id: args.partyId,
      organization_id: args.orgId,
      channel_code: args.channel,
      direction: args.direction,
      status: "completed",
      subject: args.subject?.trim() || null,
      body: args.body?.trim() || null,
      duration_seconds: args.durationSeconds ?? null,
      occurred_at: args.occurredAt ?? new Date().toISOString(),
    });
  if (error) throw pgError(error);
}

export async function removeInteraction(id: string): Promise<void> {
  const { error } = await supabase
    .schema("crm")
    .from("interaction")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw pgError(error);
}
