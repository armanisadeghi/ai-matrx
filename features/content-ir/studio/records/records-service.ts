// features/content-ir/studio/records/records-service.ts
//
// The reader + the four doors for one kind's saved records
// (`content_ir.kind_instance`), for /shapes/[kind]/table.
//
// SCOPE — THE VIEW LAW (lib/list-scope/FEATURE.md): this list is ORG-WIDE by
// default, never `created_by = me`. `listMyKindInstances` in
// ../instance-service.ts answers a different question ("my instances") and is
// deliberately NOT reused here. Every query declares its own predicate:
//   mine → created_by = me
//   orgs → organization_id = one org, or IN (every org I belong to)
// The blended set comes from the canonical membership read
// (`getUserOrganizations`), never from RLS "probably doing the right thing"
// and never from a Redux slice that may not have been hydrated.
//
// CONFIRMATION IS NEVER WRITTEN FROM HERE. `confirmation` has no DDL default
// and a database trigger is its only INSERT writer; the transitions are the
// four SECURITY DEFINER doors below. A client-side UPDATE of the column is
// refused by the database, so this module does not own one to be tempted by.
//
// ARCHIVE is a separate axis with its own parameter (`archiveFilter`), per THE
// ARCHIVED-ITEMS LAW (common-docs/policies/archived-items.md): the default
// hides archived rows and one click reveals them. Never a literal predicate.

import { supabase } from "@/utils/supabase/client";
import { DEFAULT_ARCHIVE_FILTER } from "@ai-matrx/design-system";
import type { ArchiveFilterValue } from "@ai-matrx/design-system";
import type { ColumnFiltersState } from "@ai-matrx/design-system/data-table/types";
import { associationsService } from "@/features/scopes/service/associationsService";
import { getUserOrganizations } from "@/features/organizations/service";
import { getOrganizationMembers } from "@/features/organizations/service";
import type { Json } from "@/types/database.types";
import type {
  ConfirmationFilter,
  KindRecordRow,
  KindRecordsPage,
  KindRecordsQuery,
  RecordConfirmation,
  RecordWriterTier,
  WriterFilter,
} from "./types";

/** The share/association token this table's rows are addressed by. */
export const KIND_INSTANCE_TOKEN = "content_ir_kind_instance";

/** The association label that ties a record back to the message that made it. */
export const PRODUCED_BY_LABEL = "produced_by";

// ONE string literal, deliberately: supabase-js infers the row type from the
// literal it is handed, and a concatenated expression collapses it to
// `GenericStringError` — which type-checks as garbage at every read site.
const ROW_COLUMNS =
  "id,title,data,confirmation,confirmed_at,confirmed_by,created_at,created_by,created_by_tier,created_by_system,organization_id,archived_at,kind_version,validation_status,metadata";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The tier that CREATED a row. NULL means "nobody stamped it", which the
 * platform reads as a person — see the provenance SoR. Never backfilled, and
 * never rendered as "unknown", which would invent a third kind of author.
 */
function toWriterTier(raw: string | null): RecordWriterTier {
  return raw === "ai" || raw === "code" ? raw : "human";
}

function homeConversationId(metadata: Json | null): string | null {
  if (!isRecord(metadata)) return null;
  const home = metadata.home;
  if (!isRecord(home)) return null;
  const id = home.conversation_id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

/** PostgREST `or=(...)` is comma/paren delimited — strip what would break it. */
function safeSearchTerm(search: string): string {
  return search.trim().replace(/[(),"'\\%*]/g, " ").trim();
}

async function currentUserId(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  const id = data.user?.id;
  if (!id) throw new Error("Not signed in — no records can be listed.");
  return id;
}

function db() {
  return supabase.schema("content_ir");
}

/**
 * The organizations whose records this viewer may see, newest-membership
 * order. Cached per session by the caller — this is the canonical membership
 * read, not a cheap one.
 */
export async function readableOrganizations(): Promise<
  { id: string; name: string; isPersonal: boolean }[]
> {
  const orgs = await getUserOrganizations();
  return orgs.map((o) => ({
    id: o.id,
    name: o.name,
    isPersonal: o.isPersonal,
  }));
}

/**
 * Display names for the people who wrote rows on this page, resolved through
 * the canonical org-member RPC. A creator the viewer cannot resolve is NOT
 * given a made-up name — the caller renders the row's own truth instead.
 */
export async function creatorNames(
  organizationIds: string[],
): Promise<Map<string, string>> {
  const byUser = new Map<string, string>();
  const unique = [...new Set(organizationIds)].filter(Boolean);
  const lists = await Promise.all(unique.map((id) => getOrganizationMembers(id)));
  for (const members of lists) {
    for (const m of members) {
      // A member row without a resolvable user is skipped rather than named:
      // the column then falls back to the row's own truth ("A teammate"),
      // which is honest, instead of inventing a person.
      const name = m.user?.displayName || m.user?.email;
      if (name) byUser.set(m.userId, name);
    }
  }
  return byUser;
}

/**
 * The organizations a BLENDED `orgs` scope covers: every organization the
 * viewer belongs to EXCEPT their personal one, whose content is what "Mine"
 * answers (lib/list-scope/types.ts). Every reader here — the page, the scope
 * counts, the archive counts — goes through this one function, because the
 * first version did not: the list included the personal org and the tab count
 * did not, so the tab said 9 over a list of 10. A screen never lies.
 */
async function blendedOrgIds(): Promise<string[]> {
  const orgs = await readableOrganizations();
  return orgs.filter((o) => !o.isPersonal).map((o) => o.id);
}

/** Narrow the raw enum text without widening an unknown value to "confirmed". */
function toConfirmation(raw: string): RecordConfirmation {
  return raw === "confirmed" ? "confirmed" : "unconfirmed";
}

type RecordQueryShape = {
  eq: (column: string, value: string | number | boolean) => RecordQueryShape;
  in: (column: string, values: readonly string[]) => RecordQueryShape;
  is: (column: string, value: null) => RecordQueryShape;
  not: (column: string, op: string, value: null) => RecordQueryShape;
  or: (filters: string) => RecordQueryShape;
  ilike: (column: string, pattern: string) => RecordQueryShape;
  gte: (column: string, value: number) => RecordQueryShape;
  lte: (column: string, value: number) => RecordQueryShape;
};

/**
 * Per-column filters, translated to SERVER predicates.
 *
 * They run over the whole result set, never over the loaded page: a filter
 * that silently narrowed only what is on screen would make the total, the
 * scope counts and the archive counts all disagree with the rows.
 */
function applyColumnFilters<Q extends RecordQueryShape>(
  query: Q,
  columnFilters: ColumnFiltersState,
): Q {
  let out = query;
  for (const [id, filter] of Object.entries(columnFilters)) {
    if (!filter) continue;
    const column =
      id === "title" ? "title" : id.startsWith("data:") ? `data->>${id.slice(5)}` : null;
    if (!column) continue;
    const jsonbColumn = id.startsWith("data:") ? `data->${id.slice(5)}` : column;

    if (filter.kind === "text") {
      const term = safeSearchTerm(filter.value ?? "");
      if (term) out = out.ilike(column, `%${term}%`) as Q;
    } else if (filter.kind === "select") {
      const values = filter.values?.length
        ? filter.values
        : filter.value
          ? [filter.value]
          : [];
      if (values.length > 0) out = out.in(column, values) as Q;
    } else if (filter.kind === "boolean") {
      out = out.eq(jsonbColumn, filter.value) as Q;
    } else if (filter.kind === "number") {
      if (typeof filter.min === "number") out = out.gte(jsonbColumn, filter.min) as Q;
      if (typeof filter.max === "number") out = out.lte(jsonbColumn, filter.max) as Q;
    }
  }
  return out;
}

/**
 * Apply scope + archive + confirmation + writer + search to a builder.
 *
 * Written once and shared by the page read and every count, so a number can
 * never describe a different set than the rows underneath it.
 */
function applyRecordFilters<Q extends RecordQueryShape>(
  query: Q,
  q: Pick<
    KindRecordsQuery,
    "scope" | "archiveFilter" | "confirmation" | "writer" | "search" | "columnFilters"
  >,
  ctx: { userId: string; orgIds: string[]; searchKeys: string[] },
): Q {
  let out = query;

  // Scope — explicit, always. Never RLS alone (THE VIEW LAW).
  if (q.scope.kind === "mine") {
    out = out.eq("created_by", ctx.userId) as Q;
  } else if (q.scope.organizationId) {
    out = out.eq("organization_id", q.scope.organizationId) as Q;
  } else {
    out = out.in("organization_id", ctx.orgIds) as Q;
  }

  // Archive — THE ARCHIVED-ITEMS LAW axis, parameterised, default hides.
  if (q.archiveFilter === "active") {
    out = out.is("archived_at", null) as Q;
  } else if (q.archiveFilter === "archived") {
    out = out.not("archived_at", "is", null) as Q;
  }

  if (q.confirmation !== "all") {
    out = out.eq("confirmation", q.confirmation) as Q;
  }

  // Agent-written = the two MACHINE tiers. A person-written row is `human` or
  // an unstamped NULL, so "person" is expressed as "not ai and not code"
  // rather than `eq(human)`, which would silently hide every unstamped row.
  if (q.writer === "agent") {
    out = out.in("created_by_tier", ["ai", "code"]) as Q;
  } else if (q.writer === "person") {
    out = out.or("created_by_tier.is.null,created_by_tier.eq.human") as Q;
  }

  const term = safeSearchTerm(q.search);
  if (term) {
    const clauses = [
      `title.ilike.%${term}%`,
      ...ctx.searchKeys.map((key) => `data->>${key}.ilike.%${term}%`),
    ];
    out = out.or(clauses.join(",")) as Q;
  }

  return applyColumnFilters(out, q.columnFilters);
}

/** The PostgREST order expression for a sort key. */
function orderExpression(
  sort: KindRecordsQuery["sort"],
  numericKeys: string[],
): string {
  if (!sort.startsWith("data:")) return sort;
  const key = sort.slice("data:".length);
  // `->` keeps jsonb ordering (numbers compare as numbers); `->>` is text,
  // which is what a string column actually wants.
  return numericKeys.includes(key) ? `data->${key}` : `data->>${key}`;
}

export interface ListKindRecordsArgs extends KindRecordsQuery {
  kindDefinitionId: string;
  /** String-valued schema keys, searched alongside `title`. */
  searchKeys: string[];
  /** Number/integer/boolean schema keys — sorted as jsonb, not as text. */
  numericKeys: string[];
}

/** One page of a kind's records, with the TRUE total for that same query. */
export async function listKindRecords(
  args: ListKindRecordsArgs,
): Promise<KindRecordsPage> {
  const userId = await currentUserId();
  const orgIds =
    args.scope.kind === "orgs" && !args.scope.organizationId
      ? await blendedOrgIds()
      : [];

  if (args.scope.kind === "orgs" && !args.scope.organizationId && orgIds.length === 0) {
    return { rows: [], total: 0 };
  }

  const base = db()
    .from("kind_instance")
    .select(ROW_COLUMNS, { count: "exact" })
    .eq("kind_definition_id", args.kindDefinitionId)
    .is("deleted_at", null);

  const filtered = applyRecordFilters(
    base as unknown as RecordQueryShape,
    args,
    { userId, orgIds, searchKeys: args.searchKeys },
  ) as unknown as typeof base;

  // `page` is ONE-based — MatrxDataTable's controlled pagination speaks that,
  // and a zero-based reader asks PostgREST for a range past the end on the
  // very first render ("Requested range not satisfiable"), which is what this
  // surface shipped for exactly one browser pass.
  const from = (args.page - 1) * args.pageSize;
  const { data, error, count } = await filtered
    .order(orderExpression(args.sort, args.numericKeys), {
      ascending: args.direction === "asc",
      nullsFirst: false,
    })
    .range(from, from + args.pageSize - 1);

  if (error) {
    throw new Error(`The records could not be listed: ${error.message}`);
  }

  const rows: KindRecordRow[] = (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    data: isRecord(row.data) ? row.data : {},
    confirmation: toConfirmation(row.confirmation),
    confirmedAt: row.confirmed_at,
    confirmedBy: row.confirmed_by,
    createdAt: row.created_at,
    createdBy: row.created_by,
    createdByTier: toWriterTier(row.created_by_tier),
    createdBySystem: row.created_by_system,
    organizationId: row.organization_id,
    archivedAt: row.archived_at,
    kindVersion: row.kind_version,
    validationStatus: row.validation_status,
    conversationId: homeConversationId(row.metadata),
    sourceMessageId: null,
  }));

  await attachProducedBy(rows);
  return { rows, total: count ?? rows.length };
}

/**
 * Fill each row's `sourceMessageId` from its `produced_by` association edge.
 *
 * An association read that finds nothing is NOT an error — a record a person
 * typed has no producing message, and the cell says so in words. A FAILED read
 * is different and is re-thrown, so the surface can say the source column
 * could not be read instead of printing "typed here" over a broken query.
 */
async function attachProducedBy(rows: KindRecordRow[]): Promise<void> {
  if (rows.length === 0) return;
  const result = await associationsService.listForTargets(
    KIND_INSTANCE_TOKEN,
    rows.map((r) => r.id),
  );
  if (!result.ok) {
    throw new Error(
      `The records listed, but their source conversations could not be read: ${result.error.message}`,
    );
  }
  const byTarget = new Map<string, string>();
  for (const edge of result.data.edges) {
    if (edge.sourceType !== "message") continue;
    if (edge.label !== PRODUCED_BY_LABEL) continue;
    if (!byTarget.has(edge.targetId)) byTarget.set(edge.targetId, edge.sourceId);
  }
  for (const row of rows) {
    row.sourceMessageId = byTarget.get(row.id) ?? null;
  }
}

export interface RecordScopeCounts {
  mine: number;
  orgs: number;
  perOrg: { id: string; label: string; count: number }[];
}

/**
 * True server-side counts for the scope tabs, under the SAME filters the list
 * is running — a tab whose number describes a different query is a lie.
 */
export async function countKindRecordsByScope(
  args: Omit<ListKindRecordsArgs, "sort" | "direction" | "page" | "pageSize" | "scope">,
): Promise<RecordScopeCounts> {
  const userId = await currentUserId();
  const orgs = (await readableOrganizations()).filter((o) => !o.isPersonal);
  const orgIds = orgs.map((o) => o.id);


  async function countFor(
    scope: KindRecordsQuery["scope"],
  ): Promise<number> {
    if (scope.kind === "orgs" && !scope.organizationId && orgIds.length === 0) {
      return 0;
    }
    const base = db()
      .from("kind_instance")
      .select("id", { count: "exact", head: true })
      .eq("kind_definition_id", args.kindDefinitionId)
      .is("deleted_at", null);
    const filtered = applyRecordFilters(
      base as unknown as RecordQueryShape,
      { ...args, scope },
      { userId, orgIds, searchKeys: args.searchKeys },
    ) as unknown as typeof base;
    const { count, error } = await filtered;
    if (error) {
      throw new Error(`The scope counts could not be read: ${error.message}`);
    }
    return count ?? 0;
  }

  const [mine, blended, ...perOrgCounts] = await Promise.all([
    countFor({ kind: "mine" }),
    countFor({ kind: "orgs", organizationId: null }),
    ...orgs.map((o) => countFor({ kind: "orgs", organizationId: o.id })),
  ]);

  return {
    mine,
    orgs: blended,
    perOrg: orgs.map((o, i) => ({
      id: o.id,
      label: o.name,
      count: perOrgCounts[i] ?? 0,
    })),
  };
}

/**
 * Archive-axis counts for the SAME query the list is running, so the control's
 * numbers describe what each of its states would actually render.
 */
export async function countKindRecordsByArchiveState(
  args: Omit<ListKindRecordsArgs, "sort" | "direction" | "page" | "pageSize" | "archiveFilter">,
): Promise<Partial<Record<ArchiveFilterValue, number>>> {
  const userId = await currentUserId();
  const orgIds =
    args.scope.kind === "orgs" && !args.scope.organizationId
      ? await blendedOrgIds()
      : [];

  async function countFor(archiveFilter: ArchiveFilterValue): Promise<number> {
    const base = db()
      .from("kind_instance")
      .select("id", { count: "exact", head: true })
      .eq("kind_definition_id", args.kindDefinitionId)
      .is("deleted_at", null);
    const filtered = applyRecordFilters(
      base as unknown as RecordQueryShape,
      { ...args, archiveFilter },
      { userId, orgIds, searchKeys: args.searchKeys },
    ) as unknown as typeof base;
    const { count, error } = await filtered;
    if (error) {
      throw new Error(`The archive counts could not be read: ${error.message}`);
    }
    return count ?? 0;
  }

  const [active, archived, all] = await Promise.all([
    countFor("active"),
    countFor("archived"),
    countFor("all"),
  ]);
  return { active, archived, all };
}

// ───────────────────────────── the four doors ─────────────────────────────
//
// Every one of them is a SECURITY DEFINER RPC. The client may not write
// `confirmation` or `archived_at` directly, so a refusal here is the database
// speaking and its sentence is shown to the user verbatim.

export interface ConfirmationResult {
  id: string;
  confirmation: RecordConfirmation;
  confirmedBy: string | null;
  confirmedAt: string | null;
}

/** Confirm rows — a person stands behind them now. Idempotent; editor+. */
export async function confirmRecords(
  ids: string[],
): Promise<ConfirmationResult[]> {
  if (ids.length === 0) return [];
  const { data, error } = await db().rpc("confirm_kind_instances", {
    p_ids: ids,
  });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: row.id,
    confirmation: toConfirmation(row.confirmation),
    confirmedBy: row.confirmed_by,
    confirmedAt: row.confirmed_at,
  }));
}

/** Take a confirmation back. ADMIN only, and the reason is required. */
export async function unconfirmRecords(
  ids: string[],
  reason: string,
): Promise<ConfirmationResult[]> {
  if (ids.length === 0) return [];
  const { data, error } = await db().rpc("unconfirm_kind_instances", {
    p_ids: ids,
    p_reason: reason,
  });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: row.id,
    confirmation: toConfirmation(row.confirmation),
    confirmedBy: row.confirmed_by,
    confirmedAt: row.confirmed_at,
  }));
}

/** Archive or restore rows. A SEPARATE axis: it never touches confirmation. */
export async function archiveRecords(
  ids: string[],
  archived: boolean,
): Promise<{ id: string; archivedAt: string | null }[]> {
  if (ids.length === 0) return [];
  const { data, error } = await db().rpc("archive_kind_instances", {
    p_ids: ids,
    p_archived: archived,
  });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({ id: row.id, archivedAt: row.archived_at }));
}

export interface EditValueResult {
  id: string;
  data: Record<string, unknown>;
  confirmation: RecordConfirmation;
  confirmedBy: string | null;
  confirmedAt: string | null;
  /**
   * True when THIS edit is what confirmed the row. The surface announces it at
   * that moment — a person editing a machine's record IS them standing behind
   * it, and a silent state change would hide the fact that they just did.
   */
  confirmedByThisEdit: boolean;
}

/** Write ONE key of one record. Confirms an unconfirmed row in the same commit. */
export async function editRecordValue(
  id: string,
  key: string,
  value: unknown,
): Promise<EditValueResult> {
  const { data, error } = await db().rpc("edit_kind_instance_value", {
    p_id: id,
    p_key: key,
    p_value: value as Json,
  });
  if (error) throw new Error(error.message);
  const row = (data ?? [])[0];
  if (!row) {
    throw new Error(
      "The edit returned no row — it was not written. Reload the list and try again.",
    );
  }
  return {
    id: row.id,
    data: isRecord(row.data) ? row.data : {},
    confirmation: toConfirmation(row.confirmation),
    confirmedBy: row.confirmed_by,
    confirmedAt: row.confirmed_at,
    confirmedByThisEdit: row.confirmed_by_this_edit,
  };
}

export { DEFAULT_ARCHIVE_FILTER };
export type { ConfirmationFilter, WriterFilter };
