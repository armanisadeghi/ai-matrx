import { supabase } from "@/utils/supabase/client";
import { requireUserId } from "@/utils/auth/getUserId";
import { getUserOrganizations } from "@/features/organizations/service";
import {
  MASTERWORK_SELECT_COLUMNS,
  parseMasterworkRow,
} from "../service";
import type { Masterwork, RulebookSource } from "../types";

/**
 * Encore — the Operator-facing invocation surface. An Operator sees only
 * RELEASED Masterworks (metadata.released_at stamped by the Expert in the
 * Studio); drafts never appear here. Direct supabase-js per platform doctrine.
 *
 * THE VIEW LAW: every list below declares its own scope predicate — mine /
 * my orgs (blended) / public — never a bare RLS-filtered read. A generic
 * shared-with-me filter does not exist yet (lib/list-scope Brief 3A); when it
 * lands, Encore adds the "shared" section the same day.
 */

/** What Encore shows about the Rulebook behind a Masterwork — the Expert. */
export interface EncoreRulebookRef {
  id: string;
  name: string;
  /** The Expert behind the Masterwork (Rulebook source.author, else its name). */
  expert: string;
  created_by: string;
}

export interface EncoreMasterwork extends Masterwork {
  /** Null when the viewer cannot read the Rulebook — then it is not a door. */
  rulebook: EncoreRulebookRef | null;
}

export interface EncoreShelf {
  /** "mine" | "orgs" | "public" — the declared scope this shelf was read with. */
  scope: "mine" | "orgs" | "public";
  masterworks: EncoreMasterwork[];
}

function releasedBase() {
  return supabase
    .schema("workflow")
    .from("definition")
    .select(MASTERWORK_SELECT_COLUMNS)
    .is("deleted_at", null)
    .not("metadata->>built_from_rulebook", "is", null)
    .not("metadata->>released_at", "is", null)
    .order("updated_at", { ascending: false });
}

/**
 * Attach the Rulebook (the Expert) to each Masterwork. One batched read;
 * a Rulebook the viewer cannot read simply resolves null — the card then
 * names no Expert rather than rendering an id it cannot open (Door Law).
 */
async function withRulebooks(
  masterworks: Masterwork[],
): Promise<EncoreMasterwork[]> {
  const rulebookIds = [
    ...new Set(
      masterworks
        .map((m) => m.built_from_rulebook)
        .filter((id): id is string => id !== null),
    ),
  ];
  const refs = new Map<string, EncoreRulebookRef>();
  if (rulebookIds.length > 0) {
    const { data, error } = await supabase
      .schema("platform")
      .from("rulebook")
      .select("id,name,source,created_by")
      .in("id", rulebookIds)
      .is("deleted_at", null);
    if (error) throw error;
    for (const row of data ?? []) {
      const source = (row.source ?? {}) as RulebookSource;
      refs.set(row.id, {
        id: row.id,
        name: row.name,
        expert:
          typeof source.author === "string" && source.author.trim()
            ? source.author
            : row.name,
        created_by: row.created_by ?? "",
      });
    }
  }
  return masterworks.map((m) => ({
    ...m,
    rulebook: m.built_from_rulebook
      ? (refs.get(m.built_from_rulebook) ?? null)
      : null,
  }));
}

/**
 * Every released Masterwork the Operator can reach, shelved by declared
 * scope: yours / from your organizations / public. A Masterwork matching
 * more than one scope shows once, on the closest shelf.
 */
export async function listEncoreShelves(): Promise<EncoreShelf[]> {
  const userId = requireUserId();
  const orgs = await getUserOrganizations();
  const orgIds = orgs.filter((o) => !o.isPersonal).map((o) => o.id);

  const [mineRes, orgsRes, publicRes] = await Promise.all([
    releasedBase().eq("created_by", userId),
    orgIds.length > 0
      ? releasedBase().in("organization_id", orgIds)
      : Promise.resolve({ data: [], error: null }),
    releasedBase().eq("visibility", "public"),
  ]);
  for (const res of [mineRes, orgsRes, publicRes]) {
    if (res.error) throw res.error;
  }

  const seen = new Set<string>();
  const shelf = (rows: unknown[]): Masterwork[] => {
    const out: Masterwork[] = [];
    for (const raw of rows) {
      const m = parseMasterworkRow(raw as Parameters<typeof parseMasterworkRow>[0]);
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      out.push(m);
    }
    return out;
  };
  const mine = shelf(mineRes.data ?? []);
  const fromOrgs = shelf(orgsRes.data ?? []);
  const pub = shelf(publicRes.data ?? []);

  const all = await withRulebooks([...mine, ...fromOrgs, ...pub]);
  const byId = new Map(all.map((m) => [m.id, m]));
  const pick = (list: Masterwork[]) =>
    list.map((m) => byId.get(m.id)).filter((m): m is EncoreMasterwork => !!m);
  return [
    { scope: "mine" as const, masterworks: pick(mine) },
    { scope: "orgs" as const, masterworks: pick(fromOrgs) },
    { scope: "public" as const, masterworks: pick(pub) },
  ].filter((s) => s.masterworks.length > 0);
}

/**
 * One Masterwork for the Encore run page. Returns null when unreachable.
 * A DRAFT (un-released) Masterwork is returned with released_at null — the
 * page refuses to run it and doors the owner back to the Studio instead of
 * pretending it does not exist.
 */
export async function getEncoreMasterwork(
  id: string,
): Promise<EncoreMasterwork | null> {
  const { data, error } = await supabase
    .schema("workflow")
    .from("definition")
    .select(MASTERWORK_SELECT_COLUMNS)
    .eq("id", id)
    .is("deleted_at", null)
    .not("metadata->>built_from_rulebook", "is", null)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const [withRef] = await withRulebooks([parseMasterworkRow(data)]);
  return withRef ?? null;
}

export interface EncoreRun {
  id: string;
  status: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

const ENCORE_RUN_LIMIT = 10;

/**
 * THIS Operator's recent runs of one Masterwork — their own history, never
 * the whole ledger. A preview surface: bounded read is correct.
 */
export async function listMyEncoreRuns(
  masterworkId: string,
): Promise<EncoreRun[]> {
  const userId = requireUserId();
  const { data, error } = await supabase
    .schema("workflow")
    .from("run")
    .select("id,status,created_at,started_at,completed_at")
    .eq("definition_id", masterworkId)
    .eq("created_by", userId)
    .order("created_at", { ascending: false })
    .limit(ENCORE_RUN_LIMIT);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    status: String(row.status),
    created_at: row.created_at,
    started_at: row.started_at,
    completed_at: row.completed_at,
  }));
}
