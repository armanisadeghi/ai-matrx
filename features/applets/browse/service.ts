// features/applets/browse/service.ts
//
// /applets on the canonical list shell. A person holds a handful of Applets,
// so the whole visible set is read COMPLETELY (`readAllRows`) and search,
// sort, lanes, the organization filter and paging run over all of it
// (`createMemoryListService`), the same shape as /board.
//
// Lanes (each an honest predicate over the row, never the active org — common-docs/policies/access-ladder.md §6):
//   all    — All = Mine ∪ My Orgs ∪ Shared, THE default (knob `lists.landing_tab/app` = all). It is never
//            "every row security lets her read": a Public Applet is readable by everyone on AI Matrx, so
//            that reading opened a brand-new person's list on 86 strangers' items (live audit 2026-10-09, L1).
//            Shared = a row she can read that is neither hers, her organizations', nor public — row
//            security can only have let her in by a share.
//   mine   — Applets the person made
//   public — the discovery lane: Applets anyone on AI Matrx can open (`is_public`: published to the web
//            or public visibility — the two facts row security reads). Whether one is LIVE at its link is
//            the Status column's one word (`appletState`); the separate "On the web" column that said
//            "Yes" beside "Draft" is gone (audit L6).
//
// SHOWN TO (the per-item "hide from lists" choice, `shown_to`, null follows the type's knob
// `access.shown_to_default/app` = everyone_on_ai_matrx): it hides a row from OTHER people's lists and
// never locks it (the link still opens). only_me → the maker's lists only; my_team / everyone → people
// in its organization; everyone_on_ai_matrx → everyone. A regression fixture is marked only_me.
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
import { appletState, type AppletState } from "@/features/applets/lib/applet-state";
import { readMemberOrganizationRows } from "@/features/organizations/service/memberOrganizationRows";

type DefinitionRow = Database["app"]["Tables"]["definition"]["Row"];

// The access ladder's lanes an Applet can be in (audit L4: an Applet shared with you had no lane of its own).
// An Applet is homed to an organization, never a team, so the config declares My team absent.
export const APPLET_LIST_SCOPES = ["all", "mine", "orgs", "shared", "public"] as const;
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
  /** Made in one of the person's organizations. */
  in_my_orgs: boolean;
  /** Anyone on AI Matrx can open it (published to the web, or public visibility) — the Public lane. */
  is_public: boolean;
  /** The maker's "Shown to" choice (null follows the type's knob). Hides from lists, never locks. */
  shown_to: string | null;
  total_executions: number;
  last_execution_at: string | null;
  created_at: string;
  updated_at: string;
  /** A build is still running — the row opens the live build. */
  build_open: boolean;
  /** Born at Build, no app saved yet — the row resumes the build; Archive is the usual door. */
  unbuilt: boolean;
  archived: boolean;
  deleted_at: string | null;
  /** THE state (`appletState`) — the same answer the manage header and the builder give. */
  state: AppletState;
}

const COLUMNS =
  "id, slug, name, tagline, description, status, published_to_web, visibility, shown_to, organization_id, created_by, total_executions, last_execution_at, created_at, updated_at, deleted_at, metadata, entry";

/** Where a row opens: its build while one runs or no app is saved yet, else the Applet's own page. */
export function appletRowHref(row: Pick<AppletListRow, "id" | "build_open" | "unbuilt">): string {
  return row.build_open || row.unbuilt ? `/applets/build/${row.id}` : `/applets/manage/${row.id}`;
}

async function currentUserId(): Promise<string | null> {
  const { data, error } = await getClaimsUser(supabase);
  if (error) {
    throw new Error(`We could not verify your sign-in just now (${error.message}). Try again.`);
  }
  return data?.user?.id ?? null;
}

/** The Applet's own page — its Overview, Run, Change, Versions and Settings. */
export function appletManageHref(row: Pick<AppletListRow, "id">): string {
  return `/applets/manage/${row.id}`;
}

/** The organizations the person belongs to — the "My Orgs" half of the All lane. A failed read fails the list. */
async function myOrganizationIds(): Promise<Set<string>> {
  const answer = await readMemberOrganizationRows();
  if (!answer.ok) {
    throw new Error(`We could not read your organizations just now (${answer.error.message}), so this list cannot tell yours from others'. Try again.`);
  }
  return new Set(answer.roleByOrgId.keys());
}

export async function listApplets(archived: ArchivedFilter): Promise<AppletListRow[]> {
  const [userId, myOrgs] = await Promise.all([currentUserId(), myOrganizationIds()]);
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
    // About: the one-line tagline when one was written, else what the Applet IS — the description the build
    // saves (the builder writes no tagline, so every built Applet read "—", final live test 2026-10-08).
    tagline: r.tagline || r.description || null,
    status: r.status,
    published_to_web: Boolean(r.published_to_web),
    organization_id: r.organization_id,
    created_by: r.created_by,
    is_mine: userId != null && r.created_by === userId,
    in_my_orgs: r.organization_id != null && myOrgs.has(r.organization_id),
    shown_to: r.shown_to ?? null,
    is_public: Boolean(r.published_to_web) || r.visibility === "public",
    total_executions: r.total_executions ?? 0,
    last_execution_at: r.last_execution_at,
    created_at: r.created_at,
    updated_at: r.updated_at,
    build_open: isOpenEntry(readBuildRequests(r.metadata).at(-1)),
    unbuilt: !r.entry,
    archived: r.deleted_at != null,
    deleted_at: r.deleted_at,
    state: appletState(r),
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
  status: { value: (r) => r.state.label, facet: true },
  total_executions: { value: (r) => r.total_executions },
  last_execution_at: { value: (r) => r.last_execution_at },
  updated_at: { value: (r) => r.updated_at },
  created_at: { value: (r) => r.created_at },
};

/** The maker's "Shown to" choice, for someone else's list. Exported for tests. */
export function shownToViewer(row: Pick<AppletListRow, "is_mine" | "in_my_orgs" | "shown_to">): boolean {
  if (row.is_mine) return true;
  if (row.shown_to === "only_me") return false;
  if (row.shown_to === "my_team" || row.shown_to === "everyone") return row.in_my_orgs;
  return true;
}

/** Exported for tests. */
export function inLane(row: AppletListRow, lane: AppletLane): boolean {
  if (!shownToViewer(row)) return false;
  if (lane === "mine") return row.is_mine;
  if (lane === "public") return row.is_public;
  if (lane === "orgs") return row.in_my_orgs;
  // Shared: someone else's, outside her organizations, not public — readable only because it was shared with her.
  if (lane === "shared") return !row.is_mine && !row.in_my_orgs && !row.is_public;
  // All = Mine ∪ My Orgs ∪ Shared. A row that is someone else's, outside her organizations and public is
  // in Public only; one that is not public can only be readable because it was shared with her.
  return row.is_mine || row.in_my_orgs || !row.is_public;
}

/** How long one settled list read answers the page's other askers (counts, facets, probe). */
const SHARE_MS = 3000;
const sharedReads = new Set<Map<ArchivedFilter, Promise<AppletListRow[]>>>();

/** A write on this page (archive, restore) makes the next list read fresh. */
export function forgetAppletListReads(): void {
  for (const reads of sharedReads) reads.clear();
}

export function createAppletListService(
  load: (archived: ArchivedFilter) => Promise<AppletListRow[]> = listApplets,
): EntityListService<AppletListRow> {
  // ONE read per Archived value per page load: page, counts, facets and the shell's all-archived probe
  // ask at different moments (live 2026-10-08: the same app.definition read ran 3× within 2 s, because the
  // answer was forgotten one microtask after it settled). A settled answer is shared for SHARE_MS; a write
  // from this page forgets it first (`forgetAppletListReads`), so a refresh after archive/restore reads again.
  const inFlight = new Map<ArchivedFilter, Promise<AppletListRow[]>>();
  sharedReads.add(inFlight);
  const shared = (archived: ArchivedFilter) => {
    let read = inFlight.get(archived);
    if (!read) {
      const mine = load(archived);
      read = mine;
      inFlight.set(archived, mine);
      const drop = () => {
        if (inFlight.get(archived) === mine) inFlight.delete(archived);
      };
      mine.then(() => setTimeout(drop, SHARE_MS), drop);
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
