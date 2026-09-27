/**
 * features/knowledge/hub/hubState.ts — the hub's whole state IS the URL
 * (Linear: filters, view and layout live in the address, so a link, a reload,
 * Back and a saved view all reproduce exactly what a person saw).
 *
 *   /knowledge?view=in:project:<id>&q=budget&types=note,task&layout=board&peek=note:<id>
 *
 * Pure: `hubStateFromParams` and `hubStateToParams` round-trip every
 * normalized state; `selectionQuery` is what choosing a sidebar item does to
 * the query. No React, no network.
 */

import type {
  EntityRef,
  KnowledgeDateFilter,
  KnowledgeQuery,
  KnowledgeSort,
  TriageState,
} from "@/features/knowledge/api/knowledgeSearch";

export type HubLayout = "list" | "table" | "board" | "gallery";
export const HUB_LAYOUTS: readonly HubLayout[] = ["list", "table", "board", "gallery"];

export type HubView =
  | { kind: "inbox" }
  | { kind: "kept" }
  | { kind: "archived" }
  | { kind: "everything" }
  | { kind: "favorites" }
  | { kind: "saved"; id: string }
  | { kind: "container"; type: string; id: string }
  | { kind: "kind"; key: string };

export interface HubPeek {
  entity: string;
  id: string;
}

export interface HubState {
  view: HubView;
  query: KnowledgeQuery;
  layout: HubLayout;
  peek: HubPeek | null;
  /** "sample" = the fixture answers (announced on screen). */
  data: "live" | "sample";
}

export const DEFAULT_HUB_STATE: HubState = {
  view: { kind: "everything" },
  query: { mode: "find" },
  layout: "list",
  peek: null,
  data: "live",
};

// ─── Kinds (the sidebar's "Kinds" list) ─────────────────────────────────────

export interface HubKind {
  key: string;
  label: string;
  query: { types?: string[]; source_kinds?: string[] };
}

export const HUB_KINDS: readonly HubKind[] = [
  { key: "processed_document", label: "Sources", query: { types: ["processed_document"] } },
  { key: "sk.web_page", label: "Web pages", query: { source_kinds: ["web_page"] } },
  { key: "sk.cld_file", label: "Documents", query: { source_kinds: ["cld_file"] } },
  { key: "sk.transcript", label: "Transcripts", query: { source_kinds: ["transcript"] } },
  { key: "sk.inline", label: "Pasted text", query: { source_kinds: ["inline"] } },
  { key: "conversation", label: "Chats", query: { types: ["conversation"] } },
  { key: "note", label: "Notes", query: { types: ["note"] } },
  { key: "task", label: "Tasks", query: { types: ["task"] } },
  { key: "project", label: "Projects", query: { types: ["project"] } },
  { key: "file", label: "Files", query: { types: ["file"] } },
  { key: "agent", label: "Agents", query: { types: ["agent"] } },
  { key: "workflow", label: "Workflows", query: { types: ["workflow"] } },
];

// ─── Saved view definition (platform.saved_view.definition) ─────────────────

export interface HubSavedViewDefinition {
  query: KnowledgeQuery;
  layout: HubLayout;
  /** "Notify me when new items match" — stored now; the notifier is server work (coming soon). */
  notifyNewMatches?: boolean;
  /** Set only on the platform-owned preset views (`transcripts`, `files`, …). */
  preset?: string | null;
}

/** The `__kind` of a hub view definition (the kind-marker law: every stored schema declares it). */
export const HUB_VIEW_DEFINITION_KIND = "knowledge-hub-view";
export const HUB_VIEW_DEFINITION_VERSION = 1;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** A stored definition, validated — never trusted raw. Null when unreadable. */
export function parseSavedViewDefinition(raw: unknown): HubSavedViewDefinition | null {
  if (!isRecord(raw)) return null;
  if ("__kind" in raw && raw.__kind !== HUB_VIEW_DEFINITION_KIND) return null;
  const q = isRecord(raw.query) ? raw.query : raw;
  const params = hubStateToParams({ ...DEFAULT_HUB_STATE, query: normalizeQuery(q as unknown as KnowledgeQuery) });
  const query = hubStateFromParams(params).query;
  const layout = HUB_LAYOUTS.includes(raw.layout as HubLayout) ? (raw.layout as HubLayout) : "list";
  const def: HubSavedViewDefinition = { query, layout };
  if (raw.notify_new_matches === true) def.notifyNewMatches = true;
  if (typeof raw.preset === "string" && raw.preset) def.preset = raw.preset;
  return def;
}

/** The stored shape (`platform.saved_view.definition`) — the one writer. */
export function encodeSavedViewDefinition(def: HubSavedViewDefinition): Record<string, unknown> {
  return {
    __kind: HUB_VIEW_DEFINITION_KIND,
    version: HUB_VIEW_DEFINITION_VERSION,
    query: normalizeQuery(def.query),
    layout: def.layout,
    notify_new_matches: def.notifyNewMatches === true,
    ...(def.preset ? { preset: def.preset } : {}),
  };
}

// ─── Selection → query ──────────────────────────────────────────────────────

/**
 * Choosing a sidebar item REPLACES the filters with that item's query (Linear:
 * a view is its filters). Saved views bring their stored layout too.
 */
export function selectionQuery(
  view: HubView,
  savedDefinition?: HubSavedViewDefinition | null,
): { query: KnowledgeQuery; layout?: HubLayout } {
  switch (view.kind) {
    case "inbox":
    case "kept":
    case "archived":
      return { query: { mode: "find", state: [view.kind] } };
    case "everything":
    case "favorites":
      return { query: { mode: "find" } };
    case "container":
      return { query: { mode: "find", within: [{ type: view.type, id: view.id }] } };
    case "kind": {
      const k = HUB_KINDS.find((x) => x.key === view.key);
      return {
        query: { mode: "find", ...(k?.query ?? { types: [view.key] }) },
      };
    }
    case "saved":
      return savedDefinition
        ? { query: savedDefinition.query, layout: savedDefinition.layout }
        : { query: { mode: "find" } };
  }
}

export function sameView(a: HubView, b: HubView): boolean {
  return viewToParam(a) === viewToParam(b);
}

// ─── URL codec ──────────────────────────────────────────────────────────────

function viewToParam(v: HubView): string {
  switch (v.kind) {
    case "inbox":
    case "kept":
    case "archived":
    case "everything":
    case "favorites":
      return v.kind;
    case "saved":
      return `saved:${v.id}`;
    case "container":
      return `in:${v.type}:${v.id}`;
    case "kind":
      return `kind:${v.key}`;
  }
}

function viewFromParam(p: string | null): HubView {
  if (!p) return { kind: "everything" };
  if (p === "inbox" || p === "kept" || p === "archived" || p === "everything" || p === "favorites")
    return { kind: p };
  if (p.startsWith("saved:") && p.length > 6) return { kind: "saved", id: p.slice(6) };
  if (p.startsWith("kind:") && p.length > 5) return { kind: "kind", key: p.slice(5) };
  if (p.startsWith("in:")) {
    const rest = p.slice(3);
    const i = rest.indexOf(":");
    if (i > 0 && i < rest.length - 1) return { kind: "container", type: rest.slice(0, i), id: rest.slice(i + 1) };
  }
  return { kind: "everything" };
}

/** Comma-joined; only `%` and `,` inside a value are escaped (URLSearchParams does the rest). */
const list = (v: string[] | undefined) =>
  v && v.length ? v.map((x) => x.replace(/%/g, "%25").replace(/,/g, "%2C")).join(",") : null;
const unlist = (v: string | null) =>
  v ? v.split(",").map((x) => decodeURIComponent(x)).filter(Boolean) : undefined;

/** `project:<id>` · `tag~grant-2026`. */
function refToToken(r: EntityRef): string {
  return r.id ? `${r.type}:${r.id}` : `${r.type}~${r.name ?? ""}`;
}
function refFromToken(t: string): EntityRef | null {
  const tilde = t.indexOf("~");
  const colon = t.indexOf(":");
  if (tilde > 0 && (colon < 0 || tilde < colon)) {
    const name = t.slice(tilde + 1);
    return name ? { type: t.slice(0, tilde), name } : null;
  }
  if (colon > 0 && colon < t.length - 1) return { type: t.slice(0, colon), id: t.slice(colon + 1) };
  return null;
}

function dateToParam(d: KnowledgeDateFilter): string {
  if (d.relative) return `${d.field}:${d.relative}`;
  return `${d.field}:${d.from ?? ""}..${d.to ?? ""}`;
}
function dateFromParam(p: string | null): KnowledgeDateFilter | undefined {
  if (!p) return undefined;
  const i = p.indexOf(":");
  if (i <= 0) return undefined;
  const field = p.slice(0, i);
  if (field !== "created" && field !== "updated" && field !== "captured") return undefined;
  const rest = p.slice(i + 1);
  const dots = rest.indexOf("..");
  if (dots >= 0) {
    const from = rest.slice(0, dots) || undefined;
    const to = rest.slice(dots + 2) || undefined;
    if (!from && !to) return undefined;
    return { field, ...(from ? { from } : {}), ...(to ? { to } : {}) };
  }
  return rest ? { field, relative: rest } : undefined;
}

const STATES: readonly TriageState[] = ["inbox", "kept", "archived"];
const SORTS: readonly KnowledgeSort[] = ["relevance", "recent", "title"];

/** Drop empties so two equal queries have one spelling. */
export function normalizeQuery(q: KnowledgeQuery): KnowledgeQuery {
  const out: KnowledgeQuery = { mode: q.mode === "ask" ? "ask" : "find" };
  const text = typeof q.text === "string" ? q.text.trim() : "";
  if (text) out.text = text;
  if (q.types?.length) out.types = [...q.types];
  if (q.source_kinds?.length) out.source_kinds = [...q.source_kinds];
  if (q.within?.length) out.within = q.within.map((r) => ({ ...r }));
  if (q.entities?.length) out.entities = [...q.entities];
  if (q.captured_by === "me" || q.captured_by === "anyone") out.captured_by = q.captured_by;
  else if (Array.isArray(q.captured_by) && q.captured_by.length) out.captured_by = [...q.captured_by];
  if (q.origin?.length) out.origin = [...q.origin];
  if (q.date) out.date = { ...q.date };
  if (q.state?.length) out.state = q.state.filter((s) => STATES.includes(s));
  if (q.organizations?.length) out.organizations = [...q.organizations];
  if (q.sort && SORTS.includes(q.sort)) out.sort = q.sort;
  return out;
}

export function hubStateToParams(s: HubState): URLSearchParams {
  const p = new URLSearchParams();
  const q = normalizeQuery(s.query);
  const view = viewToParam(s.view);
  if (view !== "everything") p.set("view", view);
  if (q.text) p.set("q", q.text);
  if (q.mode === "ask") p.set("mode", "ask");
  const set = (k: string, v: string | null) => {
    if (v) p.set(k, v);
  };
  set("types", list(q.types));
  set("kinds", list(q.source_kinds));
  set("within", list(q.within?.map(refToToken)));
  set("entities", list(q.entities));
  if (q.captured_by === "me" || q.captured_by === "anyone") p.set("by", q.captured_by);
  else if (Array.isArray(q.captured_by)) set("by", list(q.captured_by));
  set("origin", list(q.origin));
  if (q.date) p.set("date", dateToParam(q.date));
  set("state", list(q.state));
  set("orgs", list(q.organizations));
  if (q.sort) p.set("sort", q.sort);
  if (s.layout !== "list") p.set("layout", s.layout);
  if (s.peek) p.set("peek", `${s.peek.entity}:${s.peek.id}`);
  if (s.data === "sample") p.set("data", "sample");
  return p;
}

export function hubStateFromParams(p: URLSearchParams | ReadonlyURLSearchParamsLike): HubState {
  const get = (k: string) => p.get(k);
  const by = get("by");
  const captured_by: KnowledgeQuery["captured_by"] =
    by === "me" || by === "anyone" ? by : unlist(by);
  const within = unlist(get("within"))
    ?.map(refFromToken)
    .filter((r): r is EntityRef => r !== null);
  const sort = get("sort");
  const state = unlist(get("state"))?.filter((s): s is TriageState =>
    (STATES as readonly string[]).includes(s),
  );
  const query = normalizeQuery({
    mode: get("mode") === "ask" ? "ask" : "find",
    text: get("q") ?? undefined,
    types: unlist(get("types")),
    source_kinds: unlist(get("kinds")),
    within,
    entities: unlist(get("entities")),
    captured_by,
    origin: unlist(get("origin")),
    date: dateFromParam(get("date")),
    state,
    organizations: unlist(get("orgs")),
    sort: (SORTS as readonly string[]).includes(sort ?? "") ? (sort as KnowledgeSort) : undefined,
  });
  const layoutParam = get("layout");
  const layout = HUB_LAYOUTS.includes(layoutParam as HubLayout) ? (layoutParam as HubLayout) : "list";
  const peekParam = get("peek");
  let peek: HubPeek | null = null;
  if (peekParam) {
    const i = peekParam.indexOf(":");
    if (i > 0 && i < peekParam.length - 1) peek = { entity: peekParam.slice(0, i), id: peekParam.slice(i + 1) };
  }
  return {
    view: viewFromParam(get("view")),
    query,
    layout,
    peek,
    data: get("data") === "sample" ? "sample" : "live",
  };
}

/** The subset of URLSearchParams Next's ReadonlyURLSearchParams offers. */
export interface ReadonlyURLSearchParamsLike {
  get(name: string): string | null;
}

export function hubHref(s: HubState): string {
  const qs = hubStateToParams(s).toString();
  return qs ? `/knowledge?${qs}` : "/knowledge";
}
