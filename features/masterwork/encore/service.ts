import { supabase } from "@/utils/supabase/client";
import { requireUserId } from "@/utils/auth/getUserId";
import { operationFailed } from "@/utils/errors";
import { getUserOrganizations } from "@/features/organizations/service";
import {
  listRecentRunsForMasterworks,
  MASTERWORK_SELECT_COLUMNS,
  parseMasterworkRow,
  type MasterworkRun,
} from "../service";
import {
  latestScoreByRulebook,
  listAuditionScores,
} from "../audition/listAuditionScores";
import type { Masterwork, RulebookSource } from "../types";
import { scopeToOwner, type ListScopeWord } from "@/lib/list-scope";

/**
 * Encore — the Operator-facing invocation surface. Direct supabase-js per
 * platform doctrine.
 *
 * 🚨 RELEASE GOVERNS OTHER PEOPLE'S SHELVES, NEVER YOUR OWN.
 * Until 2026-09-16 every shelf here was hard-gated on `metadata.released_at`,
 * and NOTHING in the build path ever stamps it — so every Masterwork an Expert
 * built was invisible on the one screen whose entire job is to list what she
 * built, forever, with no reveal and no explanation (cold-walk finding #6: two
 * Masterworks, one already run to a real paid decision, absent from a shelf
 * reading "Mine 2"). The class fix is the same rule Linear, Stripe and Vercel
 * use for drafts: your OWN work is always on your own shelf, marked "Draft",
 * one click from publishing; release is what lets OTHER people see it. So the
 * `mine` shelf carries drafts (labelled), and `orgs` / `public` stay gated.
 *
 * Understudies are excluded everywhere here: an Understudy is the practice
 * stand-in the Rulebook bakes for itself, not something the Expert built, and
 * the Rulebook's own "Built" count already skips it (`listBuiltMasterworksByRulebook`).
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
  /**
   * THE PROOF. The latest Audition score (0-100) for the Rulebook this was
   * built from — the Masterwork's output judged against the Expert's own
   * published work, rule by rule. Null when nobody has auditioned it yet, and
   * then the Operator is told nothing rather than something reassuring.
   */
  auditionScore: number | null;
  /** The judge's own sentence about the vanilla-AI comparison, when there was one. */
  auditionVerdict: string | null;
  /** When that audition ran — a score with no date is not evidence. */
  auditionedAt: string | null;
}

export interface EncoreShelf {
  /** "mine" | "orgs" | "public" — the declared scope this shelf was read with. */
  scope: "mine" | "orgs" | "public";
  masterworks: EncoreMasterwork[];
}

function builtBase() {
  // archived-items-law-exempt: Encore is the Operator RUN shelf, not the
  // Expert's browsable list of systems. Archiving is the Expert retiring a
  // system from that shelf, so archived rows are excluded rather than
  // revealed, the same ruling F9 made for run/enrollment candidates. The
  // browsable lists that DO carry the control are the Masterworks lane, the
  // Rulebook page, the browse cards and the home grid.
  return supabase
    .schema("workflow")
    .from("definition")
    .select(MASTERWORK_SELECT_COLUMNS)
    .is("deleted_at", null)
    .eq("is_archived", false)
    .not("metadata->>built_from_rulebook", "is", null)
    .order("updated_at", { ascending: false });
}

/** Other people's shelves: released only. See the release rule at the top. */
function releasedBase() {
  return builtBase().not("metadata->>released_at", "is", null);
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
    if (error) throw operationFailed("load the Encore shelves", error);
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
  // THE PROOF travels with the card: the Audition score is the one thing that
  // makes "expert judgment built in" a claim an Operator can check.
  const scores = latestScoreByRulebook(await listAuditionScores(rulebookIds));

  return masterworks.map((m) => {
    const audition = m.built_from_rulebook
      ? (scores.get(m.built_from_rulebook) ?? null)
      : null;
    return {
      ...m,
      rulebook: m.built_from_rulebook
        ? (refs.get(m.built_from_rulebook) ?? null)
        : null,
      auditionScore: audition?.qualityScore ?? null,
      auditionVerdict: audition?.verdictSentence ?? null,
      auditionedAt: audition?.createdAt ?? null,
    };
  });
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
    // YOUR shelf shows everything you built, draft or released.
    builtBase().eq("created_by", userId),
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
      // An Understudy is the Rulebook's own practice stand-in, not a thing the
      // Expert built — the Rulebook's "Built" count skips it, and so does Encore.
      if (m.understudy) continue;
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
  if (error) throw operationFailed("open that Masterwork", error);
  if (!data) return null;
  const [withRef] = await withRulebooks([parseMasterworkRow(data)]);
  return withRef ?? null;
}

/**
 * An Encore history row IS a Masterwork run row. Encore used to define its own
 * five-column shape with no preview, no cost and no duration, which is why its
 * "Your recent runs" was eight identical lines (jobs-bar-2026-09-16, item 18).
 * One shape, one reader, one row component.
 */
export type EncoreRun = MasterworkRun;

const ENCORE_RUN_LIMIT = 10;

/**
 * THIS Operator's recent runs of one Masterwork — their own history, never
 * the whole ledger. A preview surface: bounded read is correct.
 *
 * The read itself is the platform's one recent-runs reader, so this history
 * carries exactly what the Masterworks lane carries: what the run said, what
 * it cost, and how long it took.
 */
export async function listMyEncoreRuns(
  masterworkId: string,
): Promise<EncoreRun[]> {
  const userId = requireUserId();
  // DECLARED `mine` (DD-137c / §3.3): this preview is THIS Operator's own history of one
  // Masterwork, never the whole ledger — said through the registry helper rather than assumed.
  const ownerOnly = await scopeToOwner("workflow_run", "mine");
  const byMasterwork = await listRecentRunsForMasterworks([masterworkId], {
    perMasterwork: ENCORE_RUN_LIMIT,
    onlyCreatedBy: ownerOnly ? userId : null,
  });
  return byMasterwork[masterworkId] ?? [];
}
