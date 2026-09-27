/**
 * features/knowledge/api/knowledgeSearch.ts — the ONE client for
 * `POST /knowledge/search` (KNOWLEDGE-HUB.md §2 query, §3 typed sections).
 *
 * Shared by the hub (`features/knowledge/hub/`) and the ⌘K command bar
 * (`features/knowledge/command-bar/`). One query object, one section shape,
 * one runner signature — `knowledgeSearchFixture.ts` implements the same
 * runner over sample data, and `knowledgeQueryText.ts` turns typed operators
 * into chips over the same `KnowledgeQuery`.
 *
 * The server streams NDJSON through the canonical matrx-connect envelope
 * (`{"event":"data","data":{...}}` lines), one event per typed section as each
 * lane finishes — instant lanes first, Segments after. `postNdjson` is the
 * sanctioned streaming helper (lib/api/FEATURE.md: streaming endpoints keep
 * their helper); it owns URL resolution, auth, organization admission and
 * Error Inspector capture. This is a body-carried READ (§2: the query rides in
 * the body), so with no organization selected it searches every membership.
 *
 * ── THE ONE ADAPTER ─────────────────────────────────────────────────────────
 * `toServerRequest` + `adaptServerSearchEvent` are the only code that knows
 * the wire shape. They are written against the plan's shapes; when
 * `pnpm sync-types` generates the server's contract, flip these two functions
 * (and the hand-written types below) to `components["schemas"][…]`. Nothing
 * else in the hub or the bar reads the wire.
 *
 * ── UNTIL THE ENDPOINT IS ON THE SERVER ─────────────────────────────────────
 * The server lane is building the endpoint (H1). When the server answers that
 * the route does not exist, `searchKnowledge` does not go blank and does not
 * invent rows: it falls back to `searchKnowledgeTitles` — the platform's
 * existing cross-type TITLE search (`reference_search_candidates`, the reader
 * every reference picker uses) — grouped into the same sections, and reports
 * `engine: "title_stand_in"` so every surface can show its banner. Real rows,
 * so open / attach / file-under work on real records. Segments answer with an
 * honest section error (passage search needs the service). Delete the
 * stand-in the day the endpoint ships.
 */

import { postNdjson } from "@/lib/python-client";
import { BackendApiError, describeBackendFailure } from "@/lib/api/errors";
import type { TypedStreamEvent } from "@/lib/api/types";
import { searchCandidatesAcrossTokens } from "@/features/scopes/service/associationCandidates";
import type { EntityTypeToken } from "@ai-matrx/associations";

// ─── The query (§2) ─────────────────────────────────────────────────────────

export type KnowledgeSort = "relevance" | "recent" | "title";
export type TriageState = "inbox" | "kept" | "archived";

/** A container or record named by type + id, or by name before its id is known. */
export interface EntityRef {
  type: string;
  id?: string;
  name?: string | null;
}

export interface KnowledgeDateFilter {
  field: "created" | "updated" | "captured";
  from?: string;
  to?: string;
  /** today · yesterday · this_week · last_week · last_7_days · last_30_days · last_month · this_year */
  relative?: string;
}

export interface KnowledgeQuery {
  text?: string;
  /** `find` lists results; `ask` answers with citations. Defaults to `find`. */
  mode?: "find" | "ask";
  types?: string[];
  source_kinds?: string[];
  within?: EntityRef[];
  entities?: string[];
  captured_by?: "me" | "anyone" | string[];
  origin?: string[];
  date?: KnowledgeDateFilter;
  state?: TriageState[];
  organizations?: string[];
  sort?: KnowledgeSort;
  limit?: number;
  cursors?: Record<string, string>;
}

// ─── The result (§3) ────────────────────────────────────────────────────────

export const KNOWLEDGE_SECTION_KEYS = [
  "top_hit",
  "sources",
  "segments",
  "chats",
  "projects_tasks",
  "notes",
  "files",
  "records",
  "agents_workflows",
] as const;

export type KnowledgeSectionKey = (typeof KNOWLEDGE_SECTION_KEYS)[number];

export const KNOWLEDGE_SECTION_LABEL: Record<KnowledgeSectionKey, string> = {
  top_hit: "Top hit",
  sources: "Sources",
  segments: "Segments",
  chats: "Chats",
  projects_tasks: "Projects & tasks",
  notes: "Notes",
  files: "Files",
  records: "Records",
  agents_workflows: "Agents & workflows",
};

/** Where a hit is filed (a container reached through associations). */
export interface FiledRef {
  type: string;
  id: string;
  name?: string | null;
}

export interface KnowledgeHit {
  /** Registry token (`processed_document`, `conversation`, `note`, … `segment`). */
  entity: string;
  id: string;
  title: string;
  snippet?: string | null;
  source_kind?: string | null;
  origin?: string | null;
  captured_by?: { id: string; name?: string | null } | null;
  organization_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  filed_under?: FiledRef[];
  entities?: string[];
  triage_state?: TriageState | null;
  /** The server's own address for the hit; wins over the registry. */
  href?: string | null;
  /** The underlying stored file, when there is one (attachable as a file). */
  file_id?: string | null;
  /** Recent/frequent score from the view-event writer; absent until it has data. */
  frecency?: number | null;
  top_segments?: { id: string; text: string; locator?: string | null }[];
  suggestions?: { target: FiledRef; reason: string }[];
  segment?: { source_id: string; source_title: string; locator?: string | null };
}

export interface KnowledgeSection {
  key: KnowledgeSectionKey;
  label: string;
  /** Total matches; `null` when the lane did not answer. */
  count: number | null;
  items: KnowledgeHit[];
  next_cursor: string | null;
  /** The lane failed — shown inline in its section, never a vanished section. */
  error?: { message: string; retryable: boolean } | null;
  /** Private-class rule: the lane ran but withheld rows, with the reason. */
  withheld?: string | null;
}

/** Which engine answered — every surface announces anything but `server`. */
export type KnowledgeSearchEngine = "server" | "title_stand_in" | "fixture";

export interface KnowledgeSearchOptions {
  signal?: AbortSignal;
  /** Called as each section arrives (streaming). */
  onSection?: (section: KnowledgeSection) => void;
  /** Typing (debounced; rerank skipped) vs submit (full lanes + rerank). */
  asYouType?: boolean;
  /** Called once with the engine that actually answered. */
  onEngine?: (engine: KnowledgeSearchEngine) => void;
}

/** One search. Resolves with every section once the stream ends. */
export type KnowledgeSearchRunner = (
  query: KnowledgeQuery,
  options?: KnowledgeSearchOptions,
) => Promise<KnowledgeSection[]>;

// ─── THE ONE ADAPTER ────────────────────────────────────────────────────────

export const KNOWLEDGE_SEARCH_PATH = "/knowledge/search";

/** Client query → request body. The query object IS the argument (§2). */
export function toServerRequest(
  query: KnowledgeQuery,
  asYouType: boolean,
): KnowledgeQuery & { mode: "find" | "ask"; as_you_type: boolean } {
  // `id: "*"` ("any container of this type", a preset's `library:*`) is a
  // client-side marker the service cannot read; never send it as an id. The
  // hub announces the unsupported filter itself (hubSavedViews.anyContainerTypes).
  const within = query.within?.filter((r) => r.id !== "*");
  const { within: _dropped, ...rest } = query;
  return {
    ...rest,
    ...(within && within.length ? { within } : {}),
    mode: query.mode ?? "find",
    as_you_type: asYouType,
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function isSectionKey(v: unknown): v is KnowledgeSectionKey {
  return (
    typeof v === "string" &&
    (KNOWLEDGE_SECTION_KEYS as readonly string[]).includes(v)
  );
}

function adaptHit(raw: unknown): KnowledgeHit | null {
  if (!isRecord(raw)) return null;
  const id = str(raw.id);
  const entity = str(raw.entity) ?? str(raw.token) ?? str(raw.entity_token);
  if (!id || !entity) return null;
  // Every other field already matches the plan's shape; keep what the server
  // sent and only guarantee the three the UI cannot render without.
  return {
    ...(raw as Partial<KnowledgeHit>),
    id,
    entity,
    title: str(raw.title) ?? str(raw.label) ?? "Untitled",
  };
}

export type AdaptedSearchEvent =
  | { type: "section"; section: KnowledgeSection }
  | { type: "stream_error"; message: string }
  | { type: "started" }
  | { type: "done" };

/**
 * One wire event → one client event, or null for heartbeats and anything no
 * surface renders. Accepts the section payload as `type: "section"` or
 * `"knowledge_section"`, and a lane failure as `"section_error"`, until the
 * generated contract fixes the names.
 */
export function adaptServerSearchEvent(
  evt: TypedStreamEvent,
): AdaptedSearchEvent | null {
  if (evt.event === "end") return { type: "done" };
  if (evt.event === "error") {
    const data: unknown = evt.data;
    return {
      type: "stream_error",
      message:
        (isRecord(data) && (str(data.user_message) ?? str(data.message))) ||
        "The search stopped before every section answered.",
    };
  }
  if (evt.event !== "data") return null;
  const data: unknown = evt.data;
  if (!isRecord(data)) return null;
  const kind = str(data.type);
  const key = data.key ?? data.section;
  if ((kind === "section" || kind === "knowledge_section") && isSectionKey(key)) {
    const items = Array.isArray(data.items)
      ? data.items.map(adaptHit).filter((h): h is KnowledgeHit => h !== null)
      : [];
    return {
      type: "section",
      section: {
        key,
        label: KNOWLEDGE_SECTION_LABEL[key],
        count: typeof data.count === "number" ? data.count : items.length,
        items,
        next_cursor: str(data.next_cursor) ?? str(data.cursor),
        withheld: str(data.withheld),
        error: null,
      },
    };
  }
  if (
    (kind === "section_error" || kind === "knowledge_section_error") &&
    isSectionKey(key)
  ) {
    return {
      type: "section",
      section: {
        key,
        label: KNOWLEDGE_SECTION_LABEL[key],
        count: null,
        items: [],
        next_cursor: null,
        error: {
          message: str(data.message) ?? "This section could not be searched.",
          retryable: data.retryable !== false,
        },
      },
    };
  }
  if (kind === "search_started") return { type: "started" };
  if (kind === "done") return { type: "done" };
  return null;
}

// ─── Runners ────────────────────────────────────────────────────────────────

/** The route is not deployed on the server this client points at. */
export class KnowledgeSearchUnavailableError extends Error {
  constructor() {
    super("Knowledge search is not on this server yet.");
    this.name = "KnowledgeSearchUnavailableError";
  }
}

/** No route here at all — the only HTTP refusal that means "not the hub's service". */
function isRouteMissing(err: unknown): boolean {
  return (
    err instanceof BackendApiError && (err.status === 404 || err.status === 405)
  );
}

/** A refusal in the server's own words (a 4xx names what was wrong). */
function refusalSentence(err: unknown): string {
  if (err instanceof BackendApiError && err.status !== null && err.status >= 400 && err.status < 500) {
    const own = err.detail?.trim();
    if (own) return own;
  }
  return describeBackendFailure(err).headline;
}

function erroredSection(
  key: KnowledgeSectionKey,
  message: string,
  retryable = true,
): KnowledgeSection {
  return {
    key,
    label: KNOWLEDGE_SECTION_LABEL[key],
    count: null,
    items: [],
    next_cursor: null,
    error: { message, retryable },
  };
}

/**
 * The real service. Throws `KnowledgeSearchUnavailableError` when the hub's
 * service did not answer: a 404/405, or a stream that ended without ever
 * saying `search_started` (the older RAG route at this path answers that way).
 * Every other failure — a 422 validation refusal included — becomes an error
 * on every section that had not answered yet, in the server's own words.
 */
export const searchKnowledgeServer: KnowledgeSearchRunner = async (
  query,
  options = {},
) => {
  const received = new Map<KnowledgeSectionKey, KnowledgeSection>();
  let started = false;
  const failRest = (message: string) => {
    for (const key of KNOWLEDGE_SECTION_KEYS) {
      if (received.has(key)) continue;
      const s = erroredSection(key, message);
      received.set(key, s);
      options.onSection?.(s);
    }
  };
  try {
    const stream = postNdjson(
      KNOWLEDGE_SEARCH_PATH,
      toServerRequest(query, options.asYouType ?? false),
      { signal: options.signal, bodyCarriedRead: true },
    );
    for await (const evt of stream) {
      const adapted = adaptServerSearchEvent(evt);
      if (!adapted) continue;
      if (adapted.type === "started") {
        started = true;
      } else if (adapted.type === "section") {
        received.set(adapted.section.key, adapted.section);
        options.onSection?.(adapted.section);
      } else if (adapted.type === "stream_error") {
        // An in-band error is the envelope speaking: show it, never fall back.
        started = true;
        failRest(adapted.message);
      }
    }
  } catch (err) {
    if (options.signal?.aborted) throw err;
    if (isRouteMissing(err)) throw new KnowledgeSearchUnavailableError();
    failRest(refusalSentence(err));
    started = true;
  }
  if (!started) throw new KnowledgeSearchUnavailableError();
  return KNOWLEDGE_SECTION_KEYS.flatMap((k) => {
    const s = received.get(k);
    return s ? [s] : [];
  });
};

/** Which registry tokens each section lists (drives the title stand-in). */
export const SECTION_TOKENS: Partial<Record<KnowledgeSectionKey, EntityTypeToken[]>> = {
  sources: ["processed_document"],
  chats: ["conversation"],
  projects_tasks: ["project", "task"],
  notes: ["note"],
  files: ["file"],
  records: ["scope", "research_topic"],
  agents_workflows: ["agent", "workflow"],
};

/**
 * TEMPORARY STAND-IN (see header): the platform's existing cross-type title
 * search, grouped into the plan's sections. Deleted when the endpoint ships.
 */
export const searchKnowledgeTitles: KnowledgeSearchRunner = async (
  query,
  options = {},
) => {
  const wanted = query.types?.length ? new Set(query.types) : null;
  const plan = (Object.keys(SECTION_TOKENS) as KnowledgeSectionKey[])
    .map((key) => ({
      key,
      tokens: (SECTION_TOKENS[key] ?? []).filter((t) => !wanted || wanted.has(t)),
    }))
    .filter((p) => p.tokens.length > 0);
  const { results, failures } = await searchCandidatesAcrossTokens({
    tokens: plan.flatMap((p) => p.tokens),
    search: query.text ?? "",
    perTokenLimit: query.limit ?? 8,
  });
  if (options.signal?.aborted) throw new DOMException("Aborted", "AbortError");
  const out: KnowledgeSection[] = [];
  const emit = (s: KnowledgeSection) => {
    out.push(s);
    options.onSection?.(s);
  };
  const text = (query.text ?? "").trim().toLowerCase();
  const top = text
    ? results.find((r) => r.title.trim().toLowerCase().startsWith(text))
    : undefined;
  emit({
    key: "top_hit",
    label: KNOWLEDGE_SECTION_LABEL.top_hit,
    count: top ? 1 : 0,
    items: top ? [{ entity: top.token, id: top.id, title: top.title }] : [],
    next_cursor: null,
  });
  for (const { key, tokens } of plan) {
    const failed = failures.filter((f) => tokens.includes(f.token));
    if (failed.length === tokens.length) {
      emit(erroredSection(key, failed.map((f) => f.error).join("; ")));
      continue;
    }
    const items: KnowledgeHit[] = results
      .filter((r) => tokens.includes(r.token))
      .map((r) => ({ entity: r.token, id: r.id, title: r.title }));
    emit({
      key,
      label: KNOWLEDGE_SECTION_LABEL[key],
      count: items.length,
      items,
      next_cursor: null,
    });
  }
  // A section the `types` filter rules out answered — with nothing, and a
  // section the title search cannot serve at all (no registry token — e.g.
  // message text) says so. Leaving either unsent reads as "this section did
  // not answer" (felt in the H5 walk: a Notes-only view showed six red errors).
  for (const key of KNOWLEDGE_SECTION_KEYS) {
    if (key === "top_hit" || key === "segments" || plan.some((p) => p.key === key)) continue;
    const served = SECTION_TOKENS[key];
    if (served || (wanted && !wanted.has("conversation"))) {
      emit({ key, label: KNOWLEDGE_SECTION_LABEL[key], count: 0, items: [], next_cursor: null });
    } else {
      emit(
        erroredSection(
          key,
          `Searching ${KNOWLEDGE_SECTION_LABEL[key].toLowerCase()} needs the knowledge search service, which is not on this server yet.`,
          false,
        ),
      );
    }
  }
  if (!wanted || wanted.has("processed_document") || wanted.has("segment")) {
    emit(
      erroredSection(
        "segments",
        "Searching inside documents needs the knowledge search service, which is not on this server yet.",
        false,
      ),
    );
  } else {
    emit({ key: "segments", label: KNOWLEDGE_SECTION_LABEL.segments, count: 0, items: [], next_cursor: null });
  }
  return out;
};

let serverRouteMissing = false;

/** The retry button (and tests) forget a remembered "route missing". */
export function resetKnowledgeSearchEngine(): void {
  serverRouteMissing = false;
}

/**
 * THE runner surfaces call. Server first; when the server says the route does
 * not exist, the title stand-in answers (announced via `onEngine`) and the
 * miss is remembered for the session so typing does not re-hit a missing
 * route on every keystroke.
 */
export const searchKnowledge: KnowledgeSearchRunner = async (
  query,
  options = {},
) => {
  if (!serverRouteMissing) {
    try {
      const sections = await searchKnowledgeServer(query, options);
      options.onEngine?.("server");
      return sections;
    } catch (err) {
      if (!(err instanceof KnowledgeSearchUnavailableError)) throw err;
      serverRouteMissing = true;
    }
  }
  options.onEngine?.("title_stand_in");
  return searchKnowledgeTitles(query, options);
};
