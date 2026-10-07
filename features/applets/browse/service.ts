// features/applets/browse/service.ts
//
// /applets on the canonical list shell. A person holds a handful of Applets,
// so the whole visible set is read COMPLETELY (`readAllRows`) and search,
// sort, lanes, the organization filter and paging run over all of it
// (`createMemoryListService`), the same shape as /board.
//
// Lanes (each an honest predicate over the row, never the active org):
//   all    — every Applet row security lets the person read (the default)
//   mine   — Applets the person made
//   public — Applets published to the web
//
// THE ARCHIVED-ITEMS LAW: an archived Applet is a row with `deleted_at`. The
// shell's Archived filter is passed to the read, so the default hides them and
// "Archived" lists them with Restore (the owner restores their own; /trash
// lists them too, as `agent_app`).

import { readAllRows } from "@ai-matrx/data/db";
import type { EntityListService } from "@/lib/entity-list/config";
import type { ArchivedFilter, EntityListQuery, EntityScopeCounts } from "@/lib/entity-list/types";
import { createMemoryListService, type MemoryServiceOptions } from "@/lib/entity-list/memoryService";
import { supabase } from "@/utils/supabase/client";
import { getClaimsUser } from "@/utils/supabase/claimsUser";
import { tryWriteOne } from "@/utils/supabase/writeOne";
import { pgErrorToError } from "@ai-matrx/data";
import type { Database } from "@/types/database.types";
import { isOpenEntry, readBuildRequests } from "@/features/applets-host/builder/build-session";

type DefinitionRow = Database["app"]["Tables"]["definition"]["Row"];

export const APPLET_LIST_SCOPES = ["all", "mine", "public"] as const;
type AppletLane = (typeof APPLET_LIST_SCOPES)[number];

/** One row of the /applets list — the person-facing facts only. */
export interface AppletListRow {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  status: string;
  published_to_web: boolean;
  organization_id: string | null;
  created_by: string | null;
  is_mine: boolean;
  total_executions: number;
  last_execution_at: string | null;
  created_at: string;
  updated_at: string;
  /** A build is still running — the row opens the live build. */
  build_open: boolean;
  archived: boolean;
  deleted_at: string | null;
}

const COLUMNS =
  "id, slug, name, tagline, status, published_to_web, organization_id, created_by, total_executions, last_execution_at, created_at, updated_at, deleted_at, metadata";

/** Where a row opens: the live build while one runs, else the Applet's own page. */
export function appletRowHref(row: Pick<AppletListRow, "id" | "build_open">): string {
  return row.build_open ? `/applets/build/${row.id}` : `/applets/manage/${row.id}`;
}

/** "Draft" / "Published" — the stored status, as a person says it. */
export function appletStatusLabel(status: string | null | undefined): string {
  const s = (status ?? "").trim();
  if (!s) return "Draft";
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

async function currentUserId(): Promise<string | null> {
  const { data, error } = await getClaimsUser(supabase);
  if (error) {
    throw new Error(`We could not verify your sign-in just now (${error.message}). Try again.`);
  }
  return data?.user?.id ?? null;
}

export async function listApplets(archived: ArchivedFilter): Promise<AppletListRow[]> {
  const userId = await currentUserId();
  const rows = await readAllRows<DefinitionRow>(
    ({ from, to }) => {
      let q = supabase.schema("app").from("definition").select(COLUMNS).order("updated_at", { ascending: false });
      if (archived === "active") q = q.is("deleted_at", null);
      else if (archived === "archived") q = q.not("deleted_at", "is", null);
      return q.range(from, to) as unknown as PromiseLike<{ data: DefinitionRow[] | null; error: { message: string } | null }>;
    },
    { label: "app.definition (/applets list)" },
  );
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    tagline: r.tagline,
    status: r.status,
    published_to_web: Boolean(r.published_to_web),
    organization_id: r.organization_id,
    created_by: r.created_by,
    is_mine: userId != null && r.created_by === userId,
    total_executions: r.total_executions ?? 0,
    last_execution_at: r.last_execution_at,
    created_at: r.created_at,
    updated_at: r.updated_at,
    build_open: isOpenEntry(readBuildRequests(r.metadata).at(-1)),
    archived: r.deleted_at != null,
    deleted_at: r.deleted_at,
  }));
}

/** Bring an archived Applet back. Only its maker may (the same rule as archiving it). */
export async function restoreApplet(appId: string): Promise<void> {
  const userId = await currentUserId();
  if (!userId) throw new Error("Sign in to restore this Applet.");
  const { error } = await tryWriteOne(
    supabase
      .schema("app")
      .from("definition")
      .update({ deleted_at: null })
      .eq("id", appId)
      .eq("created_by", userId)
      .select("id, deleted_at"),
    {
      action: "restore",
      noun: "Applet",
      alreadyDone: {
        reread: () => supabase.schema("app").from("definition").select("id, deleted_at").eq("id", appId).maybeSingle(),
        isDone: (row) => row.deleted_at == null,
      },
    },
  );
  if (error) throw pgErrorToError(error);
}

const FIELDS: MemoryServiceOptions<AppletListRow>["fields"] = {
  name: { value: (r) => r.name, search: true },
  tagline: { value: (r) => r.tagline, search: true },
  status: { value: (r) => appletStatusLabel(r.status), facet: true },
  published_to_web: { value: (r) => r.published_to_web },
  total_executions: { value: (r) => r.total_executions },
  last_execution_at: { value: (r) => r.last_execution_at },
  updated_at: { value: (r) => r.updated_at },
  created_at: { value: (r) => r.created_at },
};

function inLane(row: AppletListRow, lane: AppletLane): boolean {
  if (lane === "mine") return row.is_mine;
  if (lane === "public") return row.published_to_web;
  return true;
}

export function createAppletListService(
  load: (archived: ArchivedFilter) => Promise<AppletListRow[]> = listApplets,
): EntityListService<AppletListRow> {
  // One read per Archived value per tick: page, counts, facets and the shell's
  // all-archived probe share it; the next refresh reads again.
  const inFlight = new Map<ArchivedFilter, Promise<AppletListRow[]>>();
  const shared = (archived: ArchivedFilter) => {
    let read = inFlight.get(archived);
    if (!read) {
      read = load(archived);
      inFlight.set(archived, read);
      read.then(
        () => queueMicrotask(() => inFlight.delete(archived)),
        () => inFlight.delete(archived),
      );
    }
    return read;
  };
  const laneOf = (query: EntityListQuery): AppletLane =>
    (APPLET_LIST_SCOPES as readonly string[]).includes(query.scope.kind) ? (query.scope.kind as AppletLane) : "all";
  const fresh = (archived: ArchivedFilter, lane: AppletLane) =>
    createMemoryListService<AppletListRow>({
      load: async () => (await shared(archived)).filter((row) => inLane(row, lane)),
      fields: FIELDS,
      scope: lane,
      defaultSort: "updated_at",
      organizationOf: (row) => row.organization_id,
    });
  return {
    fetchPage: (query, sort) => fresh(query.archived, laneOf(query)).fetchPage(query, sort),
    async fetchCounts(query): Promise<EntityScopeCounts> {
      const byKind: EntityScopeCounts["byKind"] = {};
      for (const lane of APPLET_LIST_SCOPES) {
        const counts = await fresh(query.archived, lane).fetchCounts(query);
        byKind[lane] = counts.byKind[lane] ?? 0;
      }
      return { byKind, narrow: {} };
    },
    fetchFacets: (query) => fresh(query.archived, laneOf(query)).fetchFacets(query),
  };
}
