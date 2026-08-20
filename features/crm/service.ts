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
import { apiPost } from "@/lib/api/typed-client";
import { isUuid } from "@/features/scopes/service/associationGuards";
import { associationsService } from "@/features/scopes/service/associationsService";
import { recordUnavailable } from "@/lib/records/recordUnavailable";
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
  ExpertStatus,
  ExpertTopicRef,
  TopicExpertLink,
} from "./types";
import {
  DATE_BUCKETS,
  DEFAULT_RECORD_CLASS_FILTER,
  EXPERT_EDGE_ROLE,
  PARTY_SORT_KEYS,
  RECORD_CLASS_FILTER_VALUE,
} from "./types";
import type { MediumBlock } from "./reachability";
import { blocksSurvivingUnsuppress } from "./reachability";
import type { EntityScopeCounts } from "@/lib/entity-list/types";

const CRM_PRIMARY_RECORD_CLASS = "contact";

// ── Error mapping ───────────────────────────────────────────────────────────

function pgError(error: { message?: string; code?: string }): Error {
  return new Error(
    error.message?.trim()
      ? `${error.message}${error.code ? ` (${error.code})` : ""}`
      : "Supabase returned an error with no message — usually a gateway/PostgREST " +
          "failure rather than a query error.",
  );
}

// ── Value normalization ─────────────────────────────────────────────────────
// Lives in `./normalize` so pure consumers (the selection parser) can use it
// without importing this module's Supabase client. Re-exported here because
// this is where every existing caller reaches for it.
import { normalizeMediumValue } from "./normalize";
export { normalizeMediumValue };

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
 * embed select and the outreach list flow's id-only select). PostgREST builder
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
 * list page AND the outreach list "add members from filters" flow, so the records
 * a filter previews and the records an outreach list enrolls can never diverge.
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
  // Expert tier. "any"/"none" are not tiers — they are "has a status at all"
  // and "explicitly has none", which is why the column's own null-ness is the
  // predicate rather than a value comparison.
  if (f.expert_status === "any") q = q.not("expert_status", "is", null);
  else if (f.expert_status === "none") q = q.is("expert_status", null);
  else if (f.expert_status) q = q.eq("expert_status", f.expert_status);
  // Record class — the default when the caller says nothing is CONTACTS, not
  // everything. An unset filter must never mean "show the 900 organizations the
  // platform discovered"; `all` is how a caller asks for that on purpose.
  const recordClass =
    RECORD_CLASS_FILTER_VALUE[f.record_class ?? DEFAULT_RECORD_CLASS_FILTER];
  if (recordClass) q = q.eq("record_class", recordClass);
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
 *
 * ONE round trip (D139). This used to fan out into `3 + N_orgs` head-count
 * queries — one per scope tab plus one per organization — re-fired on every
 * 200ms search-debounce tick, so a user in 8 orgs paid 11 requests per
 * keystroke. `public.crm_list_scope_counts` computes all of it in a single
 * SECURITY DEFINER call, exactly like the agents (`agx_list_scope_counts`) and
 * transcripts (`trx_list_scope_counts`) twins, and returns each org's LABEL
 * with its count so no name lookup is needed either.
 *
 * The RPC restates crm.party's `std_select` RLS predicate internally, so the
 * numbers are identical to the old RLS-filtered client reads — verified across
 * every view × kind × search × org combination before the fan-out was deleted.
 */
export async function fetchPartyScopeCounts(
  query: PartyListQuery,
): Promise<EntityScopeCounts> {
  const { data, error } = await supabase.rpc("crm_list_scope_counts", {
    p_view: query.view,
    p_kind: query.kind,
    // Same sanitizer the page query uses, so a tab's number can never describe
    // a different search term than the rows below it.
    p_search: sanitizeSearch(query.search) || undefined,
    // The tabs must count exactly what the list shows — same record-class
    // filter, or a tab reads 1,181 above a list of 6 rows.
    p_record_class:
      query.filters.record_class === "all"
        ? "all"
        : (RECORD_CLASS_FILTER_VALUE[
            query.filters.record_class ?? DEFAULT_RECORD_CLASS_FILTER
          ] ?? "all"),
  });
  if (error) throw pgError(error);

  const counts: EntityScopeCounts = { byKind: {}, narrow: {} };
  for (const row of data ?? []) {
    const total = Number(row.total ?? 0);
    const kind = row.scope;
    if (kind !== "mine" && kind !== "orgs" && kind !== "public") continue;
    // A narrow_id means "one org inside this scope"; no id is the scope's own
    // blended total. Zero-count orgs stay out of the dropdown, as before.
    if (row.narrow_id) {
      if (total > 0) {
        (counts.narrow[kind] ??= []).push({
          id: row.narrow_id,
          label: row.label ?? "Unnamed org",
          count: total,
        });
      }
      continue;
    }
    counts.byKind[kind] = total;
  }
  return counts;
}

// ── Party CRUD ──────────────────────────────────────────────────────────────

/**
 * RULE 3 (features/crm/FEATURE.md): a party is NEVER created by this client.
 *
 * `resolveParty` is the only create path. It calls the governed resolver on the
 * server, which canonicalizes the name, matches on the real natural keys
 * (email / phone / company domain / platform id), follows merge lineage, and
 * enriches an existing record instead of duplicating it.
 *
 * A `supabase.schema("crm").from("party").insert()` is FORBIDDEN here and has
 * no exception. It cannot do any of the above, so it does the one thing the
 * whole dedup system exists to undo: it manufactures a second row for someone
 * we already know. The 8 live parties carrying a NULL `source` are what that
 * looked like in production.
 *
 * `source` is required, not defaulted: the stamp is the audit trail, and a
 * default would re-create the same blind spot under a different name.
 */
export interface ResolvePartyInput {
  kind: PartyKind;
  displayName: string;
  orgId: string;
  /** Producer stamp — 'manual', 'import', 'content_plan', … Never omitted. */
  source: string;
  /** Free-form provenance, e.g. the import file name. */
  sourceDetail?: string;
  firstName?: string;
  lastName?: string;
  jobTitle?: string;
  primaryDomain?: string;
  headline?: string;
  legalName?: string;
  /**
   * Sent WITH the party, never attached afterwards. The old path created the
   * row first and added the email second, so the strongest key the user gave
   * us could never participate in its own match.
   */
  emails?: string[];
  phones?: string[];
  /**
   * Stable ids at an external source (a Google People resourceName, a Graph
   * contact id). The resolver's STRONGEST match key — the only kind that earns
   * `is_identity_key` — so a connector re-sync matches the party it created
   * last time even when every email changed.
   */
  externalIds?: {
    platform: string;
    value: string;
    handle?: string;
    profileUrl?: string;
  }[];
  /** Flexible per-record data (crm.party.attributes jsonb), e.g. research provenance. */
  attributes?: Record<string, unknown>;
  /**
   * Match a PERSON on name alone. Off by default and it should stay off: two
   * different people share a name far too often for it to be an identity key.
   * Organizations always match on name — that is the resolver's own rule.
   */
  allowNameMatch?: boolean;
}

export interface ResolvedParty {
  partyId: string;
  displayName: string;
  partyKind: string;
  /** False = we matched an existing record. The caller should say so. */
  created: boolean;
  /** 'created' | 'email' | 'phone' | 'domain' | 'name' | 'external_id:<slug>' */
  matchedBy: string;
  canonicalFollowed: boolean;
  contactPointsAdded: number;
  fieldsFilled: string[];
}

const RESOLVE_PARTY = "/crm/parties/resolve";
const RESOLVE_PARTY_BATCH = "/crm/parties/resolve-batch";

function resolveRequestBody(input: ResolvePartyInput) {
  return {
    kind: input.kind,
    display_name: input.displayName.trim(),
    organization_id: input.orgId,
    source: input.source,
    source_detail: input.sourceDetail?.trim() || null,
    first_name: input.firstName?.trim() || null,
    last_name: input.lastName?.trim() || null,
    job_title: input.jobTitle?.trim() || null,
    primary_domain: input.primaryDomain?.trim() || null,
    headline: input.headline?.trim() || null,
    legal_name: input.legalName?.trim() || null,
    emails: (input.emails ?? []).map((v) => v.trim()).filter(Boolean),
    phones: (input.phones ?? []).map((v) => v.trim()).filter(Boolean),
    external_ids: (input.externalIds ?? [])
      .filter((ref) => ref.platform.trim() && ref.value.trim())
      .map((ref) => ({
        platform: ref.platform.trim(),
        value: ref.value.trim(),
        handle: ref.handle?.trim() || null,
        profile_url: ref.profileUrl?.trim() || null,
      })),
    attributes: input.attributes ?? {},
    allow_name_match: input.allowNameMatch ?? false,
  };
}

// The three tail fields carry server-side defaults, so the generated contract
// types them optional even though a response always includes them. Defaulting
// here keeps `ResolvedParty` total for every consumer.
function toResolvedParty(row: {
  party_id: string;
  display_name: string;
  party_kind: string;
  created: boolean;
  matched_by: string;
  canonical_followed?: boolean;
  contact_points_added?: number;
  fields_filled?: string[];
}): ResolvedParty {
  return {
    partyId: row.party_id,
    displayName: row.display_name,
    partyKind: row.party_kind,
    created: row.created,
    matchedBy: row.matched_by,
    canonicalFollowed: row.canonical_followed ?? false,
    contactPointsAdded: row.contact_points_added ?? 0,
    fieldsFilled: row.fields_filled ?? [],
  };
}

/** Find-or-create ONE party through the governed resolver. */
export async function resolveParty(
  input: ResolvePartyInput,
): Promise<ResolvedParty> {
  const { data } = await apiPost(RESOLVE_PARTY, resolveRequestBody(input));
  return toResolvedParty(data);
}

export interface ResolvePartyBatchItem {
  index: number;
  resolved?: ResolvedParty;
  /** Set when THIS row failed — the rest of the batch still landed. */
  error?: string;
}

/**
 * Resolve many parties in ONE round trip. The server runs them in order, so two
 * rows naming the same company cannot race each other into two organizations.
 */
export async function resolvePartiesBatch(
  inputs: ResolvePartyInput[],
): Promise<ResolvePartyBatchItem[]> {
  if (inputs.length === 0) return [];
  const { data } = await apiPost(RESOLVE_PARTY_BATCH, {
    parties: inputs.map(resolveRequestBody),
  });
  return data.map((row) => ({
    index: row.index,
    resolved: row.resolved ? toResolvedParty(row.resolved) : undefined,
    error: row.error ?? undefined,
  }));
}

/** Hydrate a resolver result into the `PartyRef` shape the CRM UI passes around. */
export function resolvedPartyRef(resolved: ResolvedParty): PartyRef {
  return {
    id: resolved.partyId,
    display_name: resolved.displayName,
    party_kind: resolved.partyKind as PartyKind,
  };
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
    .is("deleted_at", null)
    .is("canonical_id", null)
    .eq("record_class", CRM_PRIMARY_RECORD_CLASS);
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

/**
 * Move a person up (or off) the expert ladder — the human half of the tier
 * system. The server-side research promotion may only ever propose the entry
 * tier (`registered`, filled when NULL by the party resolver); `approved` and
 * `vetted` are verdicts a person makes, here.
 *
 * `null` clears the status — "this is not an expert after all" — which is a
 * real answer and not the same as leaving it at `registered`.
 */
export async function setExpertStatus(
  id: string,
  status: ExpertStatus | null,
): Promise<void> {
  await updateParty(id, { expert_status: status });
}

/**
 * The experts a research topic promoted, newest first.
 *
 * The link is the canonical `party -> research_topic` association edge with
 * role `expert_for` (registered in `crm_02_core.sql`) — never a column on
 * either table. Reads the edges, then hydrates the parties; a party that was
 * trashed after the edge was written simply drops out.
 */
export async function fetchTopicExperts(
  topicId: string,
): Promise<TopicExpertLink[]> {
  const result = await associationsService.listForTargets("research_topic", [
    topicId,
  ]);
  if (!result.ok) throw new Error(result.error.message);
  const edges = result.data.edges.filter(
    (edge) => edge.sourceType === "party" && edge.role === EXPERT_EDGE_ROLE,
  );
  if (edges.length === 0) return [];
  const parties = await fetchPartiesByIds(edges.map((e) => e.sourceId));
  const byId = new Map(parties.map((p) => [p.id, p]));
  return edges
    .map((edge) => {
      const party = byId.get(edge.sourceId);
      return party ? { party, edge } : null;
    })
    .filter((link): link is TopicExpertLink => link !== null)
    .sort((a, b) => b.edge.createdAt.localeCompare(a.edge.createdAt));
}

/**
 * The research topics this person is an expert FOR — the other direction of
 * the same `expert_for` edge, resolved to real names so the record page can
 * open each one (THE DOOR LAW: never render an id you can't click).
 */
export async function fetchPartyExpertTopics(
  partyId: string,
): Promise<ExpertTopicRef[]> {
  const result = await associationsService.listForSources(
    "party",
    [partyId],
    "research_topic",
  );
  if (!result.ok) throw new Error(result.error.message);
  const ids = result.data.edges
    .filter((edge) => edge.role === EXPERT_EDGE_ROLE)
    .map((edge) => edge.targetId);
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .schema("research")
    .from("rs_topic")
    .select("id,name")
    .in("id", ids);
  if (error) throw pgError(error);
  // An unreadable topic (deleted, or outside this user's reach) still gets a
  // row — with an honest label instead of a link into nothing.
  const byId = new Map((data ?? []).map((row) => [row.id, row.name]));
  return ids.map((id) => ({ id, name: byId.get(id) ?? null }));
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

// ── Bulk list actions (the work-queue verbs) ────────────────────────────────
//
// One statement per action over an explicit id list — never a predicate-driven
// mass update, so what the user selected is exactly what changes.

/** Chunk so no single PostgREST `in()` grows unbounded (bulk selections). */
function chunkIds(ids: string[], size = 200): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size));
  return out;
}

/** Trash many records at once (restorable, same as the row action). */
export async function deleteParties(ids: string[]): Promise<void> {
  const now = new Date().toISOString();
  for (const batch of chunkIds(ids)) {
    const { error } = await supabase
      .schema("crm")
      .from("party")
      .update({ deleted_at: now })
      .in("id", batch);
    if (error) throw pgError(error);
  }
}

/**
 * Flag or UNFLAG do-not-contact across a selection.
 *
 * Clearing it is the party half of the unsuppress affordance (see
 * `reachability.ts` § THE REVERSIBILITY RULE): the stance we set is the stance
 * we can lift. It does NOT touch any medium — a number suppressed on the value
 * itself stays suppressed until that value is unsuppressed too, which the
 * record page and the dialer both offer at the point where it bites.
 */
export async function setPartiesDoNotContact(args: {
  ids: string[];
  doNotContact: boolean;
  reason?: string;
}): Promise<void> {
  const patch: PartyUpdate = args.doNotContact
    ? {
        do_not_contact: true,
        do_not_contact_reason: args.reason?.trim() || null,
      }
    : { do_not_contact: false, do_not_contact_reason: null };
  for (const batch of chunkIds(args.ids)) {
    const { error } = await supabase
      .schema("crm")
      .from("party")
      .update(patch)
      .in("id", batch);
    if (error) throw pgError(error);
  }
}

// ── Unsuppress (the reverse of "Do not call") ───────────────────────────────

/**
 * Lift the do-not-contact stance on ONE record and say so on its timeline.
 * (`crm.party` is versioned, so `history.row_versions` already records who
 * changed the flag; the note is the trail a rep will actually read.)
 */
export async function allowPartyContact(args: {
  partyId: string;
  orgId: string;
  userId: string;
  note?: string;
}): Promise<void> {
  await setPartiesDoNotContact({ ids: [args.partyId], doNotContact: false });

  // Bare insert — component INSERT…RETURNING 42501s (D181).
  const logged = await supabase
    .schema("crm")
    .from("interaction")
    .insert({
      party_id: args.partyId,
      organization_id: args.orgId,
      channel_code: "note",
      direction: "outbound",
      status: "completed",
      subject: "Do-not-contact lifted",
      body:
        "This record can be contacted again." +
        (args.note?.trim() ? ` ${args.note.trim()}` : ""),
      occurred_at: new Date().toISOString(),
      performed_by: args.userId,
    });
  if (logged.error) {
    console.error(
      "[crm] do-not-contact lifted but the audit note failed:",
      pgError(logged.error).message,
    );
  }
}

/**
 * Lift OUR suppression on one medium — the undo the dialer never had. Clears
 * `suppressed_at` / `suppression_reason` / `suppression_expires_at` and
 * NOTHING else: an unsubscribe, complaint, hard bounce, DNC listing or invalid
 * verification is a fact from outside, not our stance (reachability.ts).
 *
 * Two audit trails, because this affects every party sharing the value:
 *   * the medium's own `details.suppression_history` — travels with the value;
 *   * a `crm.interaction` note on the party the user acted from — so the
 *     record's timeline says who re-opened it and why, where a rep will look.
 *
 * Returns what still blocks the value, so the caller can tell the truth
 * instead of implying the number is now dialable.
 */
export async function unsuppressMedium(args: {
  mediumId: string;
  /** The record the user acted from — gets the timeline note. */
  partyId?: string;
  orgId: string;
  userId: string;
  note?: string;
}): Promise<{ remainingBlocks: MediumBlock[] }> {
  const current = await supabase
    .schema("crm")
    .from("contact_medium")
    .select("*")
    .eq("id", args.mediumId)
    .single();
  if (current.error) throw pgError(current.error);
  const medium = current.data;

  const details =
    medium.details &&
    typeof medium.details === "object" &&
    !Array.isArray(medium.details)
      ? (medium.details as Record<string, unknown>)
      : {};
  const priorHistory = Array.isArray(details.suppression_history)
    ? (details.suppression_history as unknown[])
    : [];
  const now = new Date().toISOString();

  const { error } = await supabase
    .schema("crm")
    .from("contact_medium")
    .update({
      suppressed_at: null,
      suppression_reason: null,
      suppression_expires_at: null,
      details: {
        ...details,
        suppression_history: [
          ...priorHistory,
          {
            action: "unsuppressed",
            at: now,
            by: args.userId,
            from_party_id: args.partyId ?? null,
            previous_suppressed_at: medium.suppressed_at,
            previous_reason: medium.suppression_reason,
            note: args.note?.trim() || null,
          },
        ],
      },
    })
    .eq("id", args.mediumId);
  if (error) throw pgError(error);

  const value = medium.display_value ?? medium.value_raw;
  if (args.partyId) {
    // Bare insert — component INSERT…RETURNING 42501s (D181).
    const logged = await supabase
      .schema("crm")
      .from("interaction")
      .insert({
        party_id: args.partyId,
        organization_id: args.orgId,
        channel_code: "note",
        direction: "outbound",
        status: "completed",
        subject: `Suppression lifted — ${value}`,
        body:
          `Contact re-opened for ${value}` +
          (medium.suppression_reason
            ? ` (was suppressed: ${medium.suppression_reason})`
            : "") +
          (args.note?.trim() ? `. ${args.note.trim()}` : ""),
        occurred_at: now,
        performed_by: args.userId,
      });
    // The lift already landed; a failed note is a broken trail, not a broken
    // action — scream, never swallow, never roll the lift back silently.
    if (logged.error) {
      console.error(
        "[crm] suppression lifted but the audit note failed:",
        pgError(logged.error).message,
      );
    }
  }

  return { remainingBlocks: blocksSurvivingUnsuppress(medium) };
}

// ── Record detail ───────────────────────────────────────────────────────────

export async function fetchPartyDetail(partyId: string): Promise<PartyDetail> {
  // `party.id` is a uuid PK, so a non-UUID id can never match — without this
  // guard it fires SIX parallel 22P02 PostgREST errors (one per query below).
  // Resolve it to the same "missing" outcome as an empty read; the record
  // page's AccessGate says the rest.
  if (!isUuid(partyId)) {
    throw recordUnavailable({
      entity: "record",
      reason: "unknown",
      recordId: partyId,
      token: "party",
      relation: "crm.party",
    });
  }

  const crm = supabase.schema("crm");

  const [party, points, addresses, affiliations, members, interactions] =
    await Promise.all([
      // Same `.returns<>` rationale as fetchPartyPage (column-as-target embed).
      // `maybeSingle`, NOT `single`: under RLS a party the caller may not read
      // is simply zero rows, and `.single()` turns that into "Cannot coerce the
      // result to a single JSON object · PGRST116" — PostgREST prose handed to
      // a person, on top of whichever surface then has to guess why. Zero rows
      // raises the canonical ambiguous-read error instead, which the record
      // page resolves through `<AccessGate>` and the call queue treats as an
      // unworkable member rather than a fatal queue error.
      crm
        .from("party")
        .select(EMPLOYER_EMBED)
        .eq("id", partyId)
        .maybeSingle()
        .returns<PartyListRow | null>(),
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
  if (!party.data) {
    throw recordUnavailable({
      entity: "record",
      reason: "unknown",
      recordId: partyId,
      token: "party",
      relation: "crm.party",
    });
  }
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

/**
 * Promote the first email and the first phone the caller supplied to primary,
 * but ONLY when the party has no primary on that channel yet.
 *
 * The resolver creates contact points and deliberately never marks one primary
 * (RULE 2 — that flip is the RPC's job, and picking a primary is a judgement
 * about which address a human actually uses). So a create flow that wants the
 * behaviour the old `addContactPoint({ makePrimary: true })` had asks for it
 * here, right after resolving.
 *
 * The "only when absent" guard is what makes this safe on a MATCHED party: a
 * re-import must never silently repoint an existing contact's primary email at
 * whatever address happened to be in the newest spreadsheet row.
 */
export async function ensurePrimaryContactPoints(args: {
  partyId: string;
  emails?: string[];
  phones?: string[];
}): Promise<void> {
  const wanted: ContactChannel[] = [];
  if (args.emails?.some((v) => v.trim())) wanted.push("email");
  if (args.phones?.some((v) => v.trim())) wanted.push("phone");
  if (wanted.length === 0) return;

  const { data, error } = await supabase
    .schema("crm")
    .from("party_contact_point")
    .select("id,is_primary,medium:contact_medium!inner(channel)")
    .eq("party_id", args.partyId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (error) throw pgError(error);

  for (const channel of wanted) {
    const onChannel = (data ?? []).filter(
      (row) =>
        (row.medium as unknown as { channel: string } | null)?.channel ===
        channel,
    );
    if (onChannel.length === 0) continue;
    if (onChannel.some((row) => row.is_primary)) continue;
    await setPrimaryContactPoint(onChannel[0].id);
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
    .eq("record_class", CRM_PRIMARY_RECORD_CLASS)
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
    .eq("record_class", CRM_PRIMARY_RECORD_CLASS)
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
  for (let i = 0; i < items.length; i += size)
    out.push(items.slice(i, i + size));
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
  /**
   * Required with `channel: "external_id"`: the same value on two platforms is
   * two different identities, so a platform-less external-id match would lie.
   */
  platformSlug?: string;
}): Promise<Map<string, PartyRef>> {
  const out = new Map<string, PartyRef>();
  if (args.valueKeys.length === 0) return out;

  for (const keys of chunk(args.valueKeys, 200)) {
    let query = supabase
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
      .is("party.canonical_id", null)
      .eq("party.record_class", CRM_PRIMARY_RECORD_CLASS);
    if (args.platformSlug) {
      query = query.eq("medium.platform_slug", args.platformSlug);
    }
    const { data, error } = await query;
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
      .eq("record_class", CRM_PRIMARY_RECORD_CLASS)
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
  const domains = args.domains
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
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
      .eq("record_class", CRM_PRIMARY_RECORD_CLASS)
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

// ── Dedup + merge (crm_03_dedup.sql) ────────────────────────────────────────
//
// Auto-merge fires ONLY inside the detection RPC, on identity-key collisions.
// Everything else is a suggestion the human decides on the review UI. A pair
// row is ordered (source_id < target_id) so mirrored duplicates can't exist,
// and a dismissal is durable across every future scan.

// Candidate embeds target the FK COLUMN (same rationale as EMPLOYER_EMBED —
// self-joins to crm.party are directionally ambiguous by table/FK name).
const MERGE_PARTY_COLS =
  "id,display_name,party_kind,job_title,primary_domain,created_at,canonical_id,deleted_at,organization_id,record_class";
const CANDIDATE_EMBED = `*, source:source_id!inner(${MERGE_PARTY_COLS}), target:target_id!inner(${MERGE_PARTY_COLS})`;
const CANDIDATE_COUNT_EMBED =
  "id,source:source_id!inner(id),target:target_id!inner(id)";

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
    .is("source.deleted_at", null)
    .is("source.canonical_id", null)
    .eq("source.record_class", CRM_PRIMARY_RECORD_CLASS)
    .is("target.deleted_at", null)
    .is("target.canonical_id", null)
    .eq("target.record_class", CRM_PRIMARY_RECORD_CLASS)
    .order("confidence", { ascending: false })
    .order("last_detected_at", { ascending: false })
    .order("id", { ascending: true })
    .limit(200)
    .returns<MergeCandidateWithParties[]>();
  if (error) throw pgError(error);
  return data ?? [];
}

/** True pending-suggestion count for the /crm indicator badge. */
export async function fetchPendingCandidateCount(
  orgIds: string[],
): Promise<number> {
  if (orgIds.length === 0) return 0;
  const { count, error } = await supabase
    .schema("crm")
    .from("merge_candidate")
    .select(CANDIDATE_COUNT_EMBED, { count: "exact", head: true })
    .eq("status", "pending")
    .is("deleted_at", null)
    .in("organization_id", orgIds)
    .is("source.deleted_at", null)
    .is("source.canonical_id", null)
    .eq("source.record_class", CRM_PRIMARY_RECORD_CLASS)
    .is("target.deleted_at", null)
    .is("target.canonical_id", null)
    .eq("target.record_class", CRM_PRIMARY_RECORD_CLASS);
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
    .is("source.deleted_at", null)
    .is("source.canonical_id", null)
    .eq("source.record_class", CRM_PRIMARY_RECORD_CLASS)
    .is("target.deleted_at", null)
    .is("target.canonical_id", null)
    .eq("target.record_class", CRM_PRIMARY_RECORD_CLASS)
    .order("confidence", { ascending: false })
    .returns<MergeCandidateWithParties[]>();
  if (error) throw pgError(error);
  return data ?? [];
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
      "*, winner:winner_id!inner(id,display_name,party_kind), loser:loser_id!inner(id,display_name,party_kind)",
    )
    .is("unmerged_at", null)
    .in("organization_id", orgIds)
    .eq("winner.record_class", CRM_PRIMARY_RECORD_CLASS)
    .eq("loser.record_class", CRM_PRIMARY_RECORD_CLASS)
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
      "*, winner:winner_id!inner(id,display_name,party_kind), loser:loser_id!inner(id,display_name,party_kind)",
    )
    .or(`winner_id.eq.${partyId},loser_id.eq.${partyId}`)
    .eq("winner.record_class", CRM_PRIMARY_RECORD_CLASS)
    .eq("loser.record_class", CRM_PRIMARY_RECORD_CLASS)
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
