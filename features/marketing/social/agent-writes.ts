/**
 * The Socials pages' agent writes: pure readers for every `create_/update_/delete_<plural>` target
 * the social surfaces declare (`features/surfaces/manifests/marketing-social-*.manifest.ts`).
 *
 * Each reader checks the agent's WHOLE list against what the page holds and throws every problem at
 * once (`collectProblems`), so a bad list is refused before the person's approval card. Saving goes
 * through the same functions the page's buttons call (`social-actions.ts`, `service.ts`,
 * `server.ts`) — never a second write path.
 */

import {
  collectProblems,
  readCollectionList,
  refuseRepeats,
} from "@ai-matrx/chat/surfaces/runtime/collection-write-targets";

import { KPI_METRICS, KPI_PERIODS, type KpiMetricId } from "./kpi";
import { looksLikePostUrl, parseSocialAccount } from "./link";
import { isSocialPlatform, isTrackedRole, type SocialPlatform, type TrackedRole } from "./types";

type Rec = Record<string, unknown>;

function rec(raw: unknown, what: string): Rec {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`Each entry must be an object (${what}).`);
  return raw as Rec;
}

function str(r: Rec, key: string): string | undefined {
  const v = r[key];
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function refuseUnknownKeys(r: Rec, allowed: readonly string[]): void {
  const extra = Object.keys(r).filter((k) => !allowed.includes(k));
  if (extra.length > 0) throw new Error(`Unknown field${extra.length === 1 ? "" : "s"} ${extra.join(", ")}; allowed: ${allowed.join(", ")}.`);
}

// -- KPI goals ----------------------------------------------------------------

export const KPI_METRIC_IDS = KPI_METRICS.map((m) => m.id) as readonly KpiMetricId[];
export const KPI_PERIOD_IDS = KPI_PERIODS.map((p) => p.value) as readonly string[];

export interface GoalDraft {
  metric: KpiMetricId;
  target: number;
  period: string;
  /** "all" | "platform:<id>" | "account:<tracked_account_id>" — a value from goal_scope_options. */
  scope: string;
}

export interface GoalUpdatePlan {
  id: string;
  label: string;
  /** Present when metric / target / period / scope change (an Edit goal save). */
  draft: GoalDraft | null;
  status: "active" | "paused" | null;
  changed: string[];
}

export interface GoalRef {
  id: string;
  label: string;
  metric: KpiMetricId | null;
  target: number;
  period: string;
  scope: string;
  status: string;
}

function readGoalFields(r: Rec, scopes: readonly string[], base: GoalDraft | null): { draft: GoalDraft; changed: string[] } {
  const problems: string[] = [];
  const changed: string[] = [];
  const draft: GoalDraft = base ? { ...base } : { metric: "followers", target: 0, period: "month", scope: "all" };
  if (r.metric !== undefined) {
    if (typeof r.metric === "string" && (KPI_METRIC_IDS as readonly string[]).includes(r.metric)) {
      draft.metric = r.metric as KpiMetricId;
      changed.push("metric");
    } else problems.push(`metric must be one of ${KPI_METRIC_IDS.join(", ")}.`);
  } else if (!base) problems.push(`metric is required: one of ${KPI_METRIC_IDS.join(", ")}.`);
  if (r.target !== undefined) {
    const n = typeof r.target === "number" ? r.target : Number(r.target);
    if (Number.isFinite(n) && n > 0) {
      draft.target = n;
      changed.push("target");
    } else problems.push("target must be a number above 0.");
  } else if (!base) problems.push("target is required (a number above 0).");
  if (r.period !== undefined) {
    if (typeof r.period === "string" && KPI_PERIOD_IDS.includes(r.period)) {
      draft.period = r.period;
      changed.push("period");
    } else problems.push(`period must be one of ${KPI_PERIOD_IDS.join(", ")}.`);
  }
  if (r.scope !== undefined) {
    if (typeof r.scope === "string" && scopes.includes(r.scope)) {
      draft.scope = r.scope;
      changed.push("scope");
    } else problems.push(`scope must be a value from goal_scope_options (${scopes.slice(0, 8).join(", ")}${scopes.length > 8 ? ", …" : ""}).`);
  }
  if (problems.length > 0) throw new Error(problems.join(" "));
  return { draft, changed };
}

export function parseCreateGoals(value: unknown, scopes: readonly string[]): GoalDraft[] {
  const list = readCollectionList("create_goals", "goals", value);
  return collectProblems("create_goals", list, (raw) => {
    const r = rec(raw, "a goal");
    refuseUnknownKeys(r, ["metric", "target", "period", "scope"]);
    return readGoalFields(r, scopes, null).draft;
  });
}

export function parseUpdateGoals(value: unknown, goals: readonly GoalRef[], scopes: readonly string[]): GoalUpdatePlan[] {
  const list = readCollectionList("update_goals", "goals", value);
  refuseRepeats("update_goals", list.map((raw) => String((raw as Rec | null)?.id ?? "")), "goal ids");
  return collectProblems(
    "update_goals",
    list,
    (raw) => {
      const r = rec(raw, "a goal change");
      refuseUnknownKeys(r, ["id", "metric", "target", "period", "scope", "status"]);
      const id = str(r, "id");
      const goal = goals.find((g) => g.id === id);
      if (!goal) throw new Error(`id ${id ?? "(missing)"} is not a goal on this page; use an id from goals.`);
      if (!goal.metric) throw new Error(`goal ${goal.id} measures something this page does not edit; only its status can change.`);
      let status: GoalUpdatePlan["status"] = null;
      if (r.status !== undefined) {
        if (r.status === "active" || r.status === "paused") status = r.status;
        else throw new Error('status must be "active" or "paused".');
      }
      const base: GoalDraft = { metric: goal.metric, target: goal.target, period: goal.period, scope: goal.scope };
      const { draft, changed } = readGoalFields(r, scopes, base);
      if (changed.length === 0 && status === null) throw new Error("Nothing to change: send metric, target, period, scope or status.");
      return { id: goal.id, label: goal.label, draft: changed.length > 0 ? draft : null, status, changed: status ? [...changed, "status"] : changed };
    },
    { nameOf: (raw) => String((raw as Rec | null)?.id ?? "") },
  );
}

export function parseDeleteIds<T extends { id: string }>(target: string, plural: string, value: unknown, known: readonly T[], what: string): T[] {
  const list = readCollectionList(target, plural, value);
  const ids = list.map((raw) => (typeof raw === "string" ? raw : String((raw as Rec | null)?.id ?? "")));
  refuseRepeats(target, ids, "ids");
  return collectProblems(target, ids, (id) => {
    const hit = known.find((k) => k.id === id);
    if (!hit) throw new Error(`id ${String(id) || "(missing)"} is not ${what} on this page.`);
    return hit;
  });
}

// -- Outliers -------------------------------------------------------------------

export interface OutlierStatePlan {
  postId: string;
  state: "seen" | "dismissed";
}

export function parseUpdateOutliers(value: unknown, postIds: readonly string[]): OutlierStatePlan[] {
  const list = readCollectionList("update_outliers", "outliers", value, 100);
  refuseRepeats("update_outliers", list.map((raw) => String((raw as Rec | null)?.post_id ?? "")), "post ids");
  return collectProblems(
    "update_outliers",
    list,
    (raw) => {
      const r = rec(raw, "an outlier");
      refuseUnknownKeys(r, ["post_id", "state"]);
      const postId = str(r, "post_id");
      if (!postId || !postIds.includes(postId)) throw new Error(`post_id ${postId ?? "(missing)"} is not in the feed; use one from outliers.`);
      if (r.state !== "seen" && r.state !== "dismissed") throw new Error('state must be "seen" or "dismissed" (seen also restores a dismissed post).');
      return { postId, state: r.state };
    },
    { nameOf: (raw) => String((raw as Rec | null)?.post_id ?? "") },
  );
}

// -- Swipe file ---------------------------------------------------------------

export interface SwipeLinkPlan {
  url: string;
  collectionId: string | null;
  newCollectionName: string | null;
  note: string;
  tags: string[];
}

function readTags(r: Rec): string[] | undefined {
  if (r.tags === undefined) return undefined;
  if (!Array.isArray(r.tags) || r.tags.some((t) => typeof t !== "string")) throw new Error("tags must be an array of strings.");
  return [...new Set((r.tags as string[]).map((t) => t.trim().replace(/^#/, "").toLowerCase()).filter(Boolean))];
}

export function parseCreateSwipeLinks(value: unknown, collectionIds: readonly string[]): SwipeLinkPlan[] {
  const list = readCollectionList("create_swipe_links", "links", value, 10);
  refuseRepeats("create_swipe_links", list.map((raw) => String((raw as Rec | null)?.url ?? "")), "links");
  return collectProblems(
    "create_swipe_links",
    list,
    (raw) => {
      const r = rec(raw, "a link");
      refuseUnknownKeys(r, ["url", "collection_id", "new_collection_name", "note", "tags"]);
      const url = str(r, "url");
      if (!url || !looksLikePostUrl(url)) throw new Error(`url ${url ?? "(missing)"} is not a link to one post (a profile is tracked on Accounts instead).`);
      const collectionId = str(r, "collection_id") ?? null;
      const newCollectionName = str(r, "new_collection_name") ?? null;
      if (!!collectionId === !!newCollectionName) throw new Error("Send exactly one of collection_id (from collections) or new_collection_name.");
      if (collectionId && !collectionIds.includes(collectionId)) throw new Error(`collection_id ${collectionId} is not a live collection; use one from collections.`);
      if (r.note !== undefined && typeof r.note !== "string") throw new Error("note must be a string.");
      return { url, collectionId, newCollectionName, note: typeof r.note === "string" ? r.note.trim() : "", tags: readTags(r) ?? [] };
    },
    { nameOf: (raw) => String((raw as Rec | null)?.url ?? "") },
  );
}

export interface SwipeCollectionPlan {
  id: string;
  name: string;
  rename: string | null;
  archived: boolean | null;
}

export function parseUpdateSwipeCollections(value: unknown, collections: readonly { id: string; name: string }[]): SwipeCollectionPlan[] {
  const list = readCollectionList("update_swipe_collections", "collections", value);
  refuseRepeats("update_swipe_collections", list.map((raw) => String((raw as Rec | null)?.id ?? "")), "collection ids");
  return collectProblems(
    "update_swipe_collections",
    list,
    (raw) => {
      const r = rec(raw, "a collection change");
      refuseUnknownKeys(r, ["id", "name", "archived"]);
      const id = str(r, "id");
      const hit = collections.find((c) => c.id === id);
      if (!hit) throw new Error(`id ${id ?? "(missing)"} is not a collection here; use one from collections or archived_collections.`);
      const rename = r.name === undefined ? null : str(r, "name") ?? "";
      if (rename === "") throw new Error("name cannot be empty.");
      if (r.archived !== undefined && typeof r.archived !== "boolean") throw new Error("archived must be true or false.");
      const archived = typeof r.archived === "boolean" ? r.archived : null;
      if (rename === null && archived === null) throw new Error("Nothing to change: send name or archived.");
      return { id: hit.id, name: hit.name, rename, archived };
    },
    { nameOf: (raw) => String((raw as Rec | null)?.id ?? "") },
  );
}

export interface SwipeNotePlan {
  key: string;
  itemType: string;
  itemId: string;
  collectionId: string;
  note: string;
  tags: string[];
}

export interface SwipeItemRef {
  key: string;
  itemType: string;
  itemId: string;
  edges: readonly { collectionId: string; note: string; tags: string[] }[];
}

export function parseUpdateSwipeItems(value: unknown, items: readonly SwipeItemRef[]): SwipeNotePlan[] {
  const list = readCollectionList("update_swipe_items", "items", value);
  return collectProblems(
    "update_swipe_items",
    list,
    (raw) => {
      const r = rec(raw, "an item change");
      refuseUnknownKeys(r, ["key", "collection_id", "note", "tags"]);
      const key = str(r, "key");
      const item = items.find((i) => i.key === key);
      if (!item) throw new Error(`key ${key ?? "(missing)"} is not a saved item shown here; use a key from items.`);
      const cid = str(r, "collection_id");
      const edge = cid ? item.edges.find((e) => e.collectionId === cid) : item.edges.length === 1 ? item.edges[0] : undefined;
      if (!edge)
        throw new Error(
          cid
            ? `item ${key} is not in collection ${cid}.`
            : `item ${key} is in ${item.edges.length} collections; name which with collection_id.`,
        );
      if (r.note !== undefined && typeof r.note !== "string") throw new Error("note must be a string.");
      const tags = readTags(r);
      if (r.note === undefined && tags === undefined) throw new Error("Nothing to change: send note or tags.");
      return {
        key: item.key,
        itemType: item.itemType,
        itemId: item.itemId,
        collectionId: edge.collectionId,
        note: typeof r.note === "string" ? r.note.trim() : edge.note,
        tags: tags ?? edge.tags,
      };
    },
    { nameOf: (raw) => String((raw as Rec | null)?.key ?? "") },
  );
}

// -- Ad library -----------------------------------------------------------------

export function parseAdIds(target: string, value: unknown): string[] {
  const list = readCollectionList(target, "ads", value, 10);
  const ids = list.map((raw) => (typeof raw === "string" ? raw : String((raw as Rec | null)?.ad_id ?? "")));
  refuseRepeats(target, ids, "ad ids");
  return collectProblems(target, ids, (id) => {
    if (typeof id !== "string" || !id.trim()) throw new Error("Each entry is an ad_id from results (or { ad_id }).");
    return id.trim();
  });
}

export interface AdvertiserUpdatePlan {
  id: string;
  name: string;
  lookAgain: boolean;
  markSeen: boolean;
}

export function parseUpdateAdvertisers(value: unknown, known: readonly { id: string; name: string }[]): AdvertiserUpdatePlan[] {
  const list = readCollectionList("update_tracked_advertisers", "advertisers", value, 10);
  refuseRepeats("update_tracked_advertisers", list.map((raw) => String((raw as Rec | null)?.id ?? "")), "advertiser ids");
  return collectProblems(
    "update_tracked_advertisers",
    list,
    (raw) => {
      const r = rec(raw, "an advertiser change");
      refuseUnknownKeys(r, ["id", "look_again", "mark_seen"]);
      const id = str(r, "id");
      const hit = known.find((k) => k.id === id);
      if (!hit) throw new Error(`id ${id ?? "(missing)"} is not a tracked advertiser; use an id from tracked_advertisers.`);
      const lookAgain = r.look_again === true;
      const markSeen = r.mark_seen === true;
      if (!lookAgain && !markSeen) throw new Error("Nothing to do: send look_again: true or mark_seen: true.");
      return { id: hit.id, name: hit.name, lookAgain, markSeen };
    },
    { nameOf: (raw) => String((raw as Rec | null)?.id ?? "") },
  );
}

// -- Accounts -------------------------------------------------------------------

export interface TrackAccountPlan {
  handleOrUrl: string;
  platform: SocialPlatform;
  role: TrackedRole;
  label: string;
}

export function parseCreateAccounts(value: unknown): TrackAccountPlan[] {
  const list = readCollectionList("create_accounts", "accounts", value, 10);
  return collectProblems(
    "create_accounts",
    list,
    (raw) => {
      const r = rec(raw, "an account");
      refuseUnknownKeys(r, ["handle_or_url", "platform", "role"]);
      const text = str(r, "handle_or_url");
      if (!text) throw new Error("handle_or_url is required: a profile link or a handle.");
      const fallback = str(r, "platform");
      if (fallback && !isSocialPlatform(fallback)) throw new Error(`platform ${fallback} is not a social platform this page tracks.`);
      const role = str(r, "role") ?? "competitor";
      if (!isTrackedRole(role)) throw new Error("role must be own, competitor, inspiration or client.");
      const parsed = parseSocialAccount(text, (fallback as SocialPlatform | undefined) ?? null);
      if (parsed.status === "post") throw new Error(`${text} is a link to one post, not an account; save posts from the Swipe file.`);
      if (parsed.status !== "ok") throw new Error(`${text} is not a profile link or handle${fallback ? "" : " (a bare handle needs platform)"}.`);
      return { handleOrUrl: parsed.url, platform: parsed.platform, role, label: `${parsed.platform} @${parsed.handle}` };
    },
    { nameOf: (raw) => String((raw as Rec | null)?.handle_or_url ?? "") },
  );
}

export interface AccountUpdatePlan<Row> {
  row: Row;
  label: string;
  role: TrackedRole | null;
  tracked: boolean | null;
  refresh: boolean;
  changed: string[];
}

export function parseUpdateAccounts<Row extends { rowId: string; handle: string; platform: string; trackedAccountId: string | null; profileId: string | null; role: string }>(
  value: unknown,
  rows: readonly Row[],
): AccountUpdatePlan<Row>[] {
  const list = readCollectionList("update_accounts", "accounts", value, 10);
  refuseRepeats("update_accounts", list.map((raw) => String((raw as Rec | null)?.row_id ?? "")), "row ids");
  return collectProblems(
    "update_accounts",
    list,
    (raw) => {
      const r = rec(raw, "an account change");
      refuseUnknownKeys(r, ["row_id", "role", "tracked", "refresh"]);
      const id = str(r, "row_id");
      const row = rows.find((x) => x.rowId === id);
      if (!row) throw new Error(`row_id ${id ?? "(missing)"} is not an account on this page; use one from accounts.`);
      const label = `${row.platform} @${row.handle}`;
      const changed: string[] = [];
      let role: TrackedRole | null = null;
      if (r.role !== undefined) {
        if (typeof r.role !== "string" || !isTrackedRole(r.role)) throw new Error("role must be own, competitor, inspiration or client.");
        if (!row.trackedAccountId) throw new Error(`${label} is not tracked yet, so it has no role to change; track it first (tracked: true).`);
        role = r.role;
        changed.push("role");
      }
      let tracked: boolean | null = null;
      if (r.tracked !== undefined) {
        if (typeof r.tracked !== "boolean") throw new Error("tracked must be true or false.");
        if (r.tracked && row.trackedAccountId) throw new Error(`${label} is already tracked.`);
        if (r.tracked && row.role !== "own") throw new Error(`${label} is not one of the brand's own accounts; add it with create_accounts.`);
        if (!r.tracked && !row.trackedAccountId) throw new Error(`${label} is not tracked.`);
        tracked = r.tracked;
        changed.push(r.tracked ? "tracked" : "untracked");
      }
      const refresh = r.refresh === true;
      if (refresh) {
        if (!row.profileId) throw new Error(`${label} has no stored profile to refresh; track it first.`);
        changed.push("refresh");
      }
      if (changed.length === 0) throw new Error("Nothing to change: send role, tracked or refresh.");
      if (tracked === false && (role || refresh)) throw new Error("Untracking cannot be combined with role or refresh.");
      return { row, label, role, tracked, refresh, changed };
    },
    { nameOf: (raw) => String((raw as Rec | null)?.row_id ?? "") },
  );
}
