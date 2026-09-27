/**
 * features/knowledge/api/knowledgeSearchFixture.ts — SAMPLE DATA for the one
 * Knowledge search, in the exact wire shape of `knowledgeSearch.ts`.
 *
 * It exists so the hub and the command bar can be built, walked and tested
 * while `POST /knowledge/search` (server phase H1) lands in parallel. It is a
 * STAND-IN and announces itself: the hub shows a "Sample data" banner whenever
 * this runner answers, and every write action refuses with a sentence instead
 * of pretending to file sample rows. Nothing here reads or writes the database.
 *
 * The runner applies the query the way the service promises to (types, Source
 * kinds, origin, containers, entities, captured by, state, date, sort, text,
 * per-section cursors), so the UI is exercised against real behaviour, not a
 * static list.
 */

import {
  KNOWLEDGE_SECTION_KEYS,
  KNOWLEDGE_SECTION_LABEL,
  type FiledRef,
  type KnowledgeHit,
  type KnowledgeQuery,
  type KnowledgeSearchRunner,
  type KnowledgeSection,
  type KnowledgeSectionKey,
} from "./knowledgeSearch";

export const FIXTURE_ME = "00000000-0000-4000-8000-00000000a001";
const FIXTURE_ORG = "00000000-0000-4000-8000-00000000b001";

const fid = (n: number) =>
  `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;

export const FIXTURE_CONTAINERS = {
  grant: { type: "project", id: fid(9001), name: "Grant 2026" },
  website: { type: "project", id: fid(9002), name: "Website relaunch" },
  ava: { type: "scope", id: fid(9003), name: "Client Ava" },
  tag: { type: "tag", id: fid(9004), name: "grant-2026" },
  library: { type: "media_source_library", id: fid(9005), name: "Research library" },
  topic: { type: "research_topic", id: fid(9006), name: "Solar storage" },
  store: { type: "data_store", id: fid(9007), name: "Support KB" },
} satisfies Record<string, FiledRef>;

const C = FIXTURE_CONTAINERS;

/** The sample data's containers, found by exact name (mention resolution). */
export async function findFixtureContainer(name: string): Promise<FiledRef | null> {
  const key = name.trim().toLowerCase();
  return Object.values(FIXTURE_CONTAINERS).find((c) => c.name.toLowerCase() === key) ?? null;
}
const DAY = 86_400_000;
const NOW = Date.now();
const ago = (days: number) => new Date(NOW - days * DAY).toISOString();

interface Seed {
  entity: string;
  title: string;
  snippet: string;
  kind?: string;
  origin: string;
  mine: boolean;
  days: number;
  filed: FiledRef[];
  entities?: string[];
  state?: "inbox" | "kept" | "archived";
  suggest?: FiledRef[];
}

const SEEDS: Seed[] = [
  { entity: "processed_document", title: "NSF grant solicitation 2026", snippet: "Proposals must describe broader impacts and a data management plan.", kind: "cld_file", origin: "upload", mine: true, days: 1, filed: [C.grant, C.tag], entities: ["National Science Foundation"], state: "inbox", suggest: [C.ava] },
  { entity: "processed_document", title: "How lithium-iron batteries age", snippet: "Capacity fade accelerates above 35°C and at high states of charge.", kind: "web_page", origin: "extension", mine: true, days: 2, filed: [C.topic, C.library], entities: ["Tesla", "CATL"], state: "inbox", suggest: [C.grant] },
  { entity: "processed_document", title: "Ava onboarding call transcript", snippet: "Ava wants weekly summaries and a single place for every contract.", kind: "transcript", origin: "local", mine: true, days: 3, filed: [C.ava], entities: ["Ava Chen"], state: "kept" },
  { entity: "processed_document", title: "Grid-scale storage market 2026", snippet: "Installed capacity doubled year over year, led by utility projects.", kind: "scrape_parsed_page", origin: "research", mine: false, days: 4, filed: [C.topic], entities: ["BloombergNEF"], state: "inbox", suggest: [C.library] },
  { entity: "processed_document", title: "Website style guide v3", snippet: "Primary actions use the solid button; destructive actions say what is lost.", kind: "inline", origin: "web", mine: true, days: 6, filed: [C.website], state: "kept" },
  { entity: "processed_document", title: "Ava master services agreement", snippet: "Either party may terminate with thirty days written notice.", kind: "cld_file", origin: "upload", mine: false, days: 9, filed: [C.ava], entities: ["Ava Chen", "Matrx Inc."], state: "kept" },
  { entity: "processed_document", title: "YouTube: Home batteries explained", snippet: "A 13 kWh battery covers an average evening peak for most homes.", kind: "transcript", origin: "youtube", mine: true, days: 12, filed: [C.topic], state: "archived" },
  { entity: "processed_document", title: "Competitor pricing page capture", snippet: "Three tiers; the middle tier is marked most popular.", kind: "web_page", origin: "crawl", mine: false, days: 20, filed: [C.website], entities: ["Acme Corp"], state: "inbox" },
  { entity: "processed_document", title: "Support macros export", snippet: "Refund requests older than 30 days go to the billing queue.", kind: "inline", origin: "agent", mine: false, days: 34, filed: [C.store], state: "kept" },
  { entity: "conversation", title: "Drafting the grant narrative", snippet: "We agreed the broader impacts section leads with the school pilot.", origin: "web", mine: true, days: 1, filed: [C.grant] },
  { entity: "conversation", title: "What did Ava ask for in the kickoff?", snippet: "Weekly summaries, one contract folder, and Friday check-ins.", origin: "web", mine: true, days: 3, filed: [C.ava], entities: ["Ava Chen"] },
  { entity: "conversation", title: "Battery degradation Q&A", snippet: "Heat is the largest single factor in calendar aging.", origin: "extension", mine: true, days: 8, filed: [C.topic] },
  { entity: "conversation", title: "Homepage copy brainstorm", snippet: "Lead with the outcome, not the feature list.", origin: "web", mine: true, days: 15, filed: [C.website] },
  { entity: "note", title: "Grant budget assumptions", snippet: "Two postdocs, one summer student, cloud credits at list price.", origin: "web", mine: true, days: 2, filed: [C.grant, C.tag] },
  { entity: "note", title: "Ava — open questions", snippet: "Who signs change orders? Which timezone for check-ins?", origin: "web", mine: true, days: 5, filed: [C.ava], entities: ["Ava Chen"] },
  { entity: "note", title: "Storage reading list", snippet: "Start with the NREL cost report, then the aging studies.", origin: "local", mine: true, days: 11, filed: [C.topic, C.library] },
  { entity: "task", title: "Submit letter of intent", snippet: "Due before the portal closes; needs the PI signature.", origin: "web", mine: true, days: 1, filed: [C.grant] },
  { entity: "task", title: "Send Ava the weekly summary", snippet: "Every Friday by noon Pacific.", origin: "agent", mine: false, days: 4, filed: [C.ava] },
  { entity: "task", title: "Replace hero illustration", snippet: "The current one does not work in dark mode.", origin: "web", mine: true, days: 18, filed: [C.website] },
  { entity: "project", title: "Grant 2026", snippet: "Everything for the 2026 NSF proposal.", origin: "web", mine: true, days: 30, filed: [] },
  { entity: "project", title: "Website relaunch", snippet: "New site, new pricing, new docs.", origin: "web", mine: true, days: 45, filed: [] },
  { entity: "file", title: "budget-draft.xlsx", snippet: "Spreadsheet · 42 KB", origin: "upload", mine: true, days: 2, filed: [C.grant] },
  { entity: "file", title: "ava-logo.svg", snippet: "Image · 8 KB", origin: "upload", mine: false, days: 7, filed: [C.ava] },
  { entity: "file", title: "battery-cycles.csv", snippet: "Table · 1.2 MB", origin: "local", mine: true, days: 13, filed: [C.topic] },
  { entity: "scope", title: "Client Ava", snippet: "Client record · 14 items filed", origin: "web", mine: true, days: 60, filed: [] },
  { entity: "research_topic", title: "Solar storage", snippet: "Research topic · 23 sources", origin: "research", mine: true, days: 40, filed: [] },
  { entity: "agent", title: "Grant reviewer", snippet: "Reads a draft section and scores it against the solicitation.", origin: "web", mine: true, days: 10, filed: [C.grant] },
  { entity: "workflow", title: "Weekly client summary", snippet: "Collects the week's notes and chats per client and drafts a summary.", origin: "web", mine: true, days: 22, filed: [C.ava] },
];

const SEGMENTS = [
  { src: 0, text: "Proposals must include a two-page data management plan describing how data will be shared.", locator: "p. 7" },
  { src: 0, text: "Broader impacts may include education, outreach, and benefits to society.", locator: "p. 4" },
  { src: 1, text: "Above 35°C, capacity fade roughly doubles for every 10°C increase.", locator: "§ Heat" },
  { src: 2, text: "Ava: I want one place where every contract lives, and a summary every Friday.", locator: "12:41" },
  { src: 3, text: "Utility-scale projects accounted for 71% of new storage capacity.", locator: "§ Market" },
  { src: 5, text: "Either party may terminate this agreement with thirty (30) days written notice.", locator: "§ 12.2" },
];

export const FIXTURE_HITS: KnowledgeHit[] = SEEDS.map((s, i) => {
  const id = fid(i + 1);
  const hit: KnowledgeHit = {
    entity: s.entity,
    id,
    title: s.title,
    snippet: s.snippet,
    source_kind: s.kind ?? null,
    origin: s.origin,
    captured_by: s.mine
      ? { id: FIXTURE_ME, name: "You" }
      : { id: fid(8001), name: "Sam Rivera" },
    organization_id: FIXTURE_ORG,
    created_at: ago(s.days + 1),
    updated_at: ago(s.days),
    filed_under: s.filed,
    entities: s.entities ?? [],
    triage_state: s.state ?? null,
  };
  if (s.entity === "processed_document") {
    hit.top_segments = SEGMENTS.filter((g) => g.src === i).map((g, j) => ({
      id: fid(7000 + i * 10 + j),
      text: g.text,
      locator: g.locator,
    }));
    hit.suggestions = (s.suggest ?? []).map((t) => ({
      target: t,
      reason: `Mentions the same people and topics as other items in ${t.name}.`,
    }));
  }
  return hit;
});

const SEGMENT_HITS: KnowledgeHit[] = SEGMENTS.map((g, j) => {
  const src = FIXTURE_HITS[g.src];
  return {
    entity: "segment",
    id: fid(7500 + j),
    title: src.title,
    snippet: g.text,
    source_kind: src.source_kind,
    origin: src.origin,
    captured_by: src.captured_by,
    organization_id: src.organization_id,
    created_at: src.created_at,
    updated_at: src.updated_at,
    filed_under: src.filed_under,
    entities: src.entities,
    segment: { source_id: src.id, source_title: src.title, locator: g.locator },
  };
});

export function sectionForEntity(entity: string): KnowledgeSectionKey {
  switch (entity) {
    case "processed_document":
      return "sources";
    case "segment":
      return "segments";
    case "conversation":
      return "chats";
    case "project":
    case "task":
      return "projects_tasks";
    case "note":
      return "notes";
    case "file":
    case "cld_file":
      return "files";
    case "agent":
    case "workflow":
      return "agents_workflows";
    default:
      return "records";
  }
}

function withinRelative(iso: string | null | undefined, relative: string): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  const d = new Date(NOW);
  const startOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  switch (relative) {
    case "today":
      return t >= startOfDay;
    case "yesterday":
      return t >= startOfDay - DAY && t < startOfDay;
    case "this_week":
    case "last_7_days":
      return t >= NOW - 7 * DAY;
    case "last_week":
      return t >= NOW - 14 * DAY && t < NOW - 7 * DAY;
    case "last_30_days":
    case "last_month":
      return t >= NOW - 30 * DAY;
    case "this_year":
      return new Date(t).getFullYear() === d.getFullYear();
    default:
      return true;
  }
}

function matchesText(hit: KnowledgeHit, text: string): number {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return 1;
  const hay = `${hit.title} ${hit.snippet ?? ""} ${(hit.entities ?? []).join(" ")}`.toLowerCase();
  let score = 0;
  for (const w of words) {
    if (!hay.includes(w)) return 0;
    score += hit.title.toLowerCase().includes(w) ? 3 : 1;
  }
  return score;
}

export function fixtureMatches(hit: KnowledgeHit, q: KnowledgeQuery): boolean {
  if (q.types?.length && !q.types.includes(hit.entity) && !(hit.entity === "segment" && q.types.includes("processed_document")))
    return false;
  if (q.source_kinds?.length && !q.source_kinds.includes(hit.source_kind ?? "")) return false;
  if (q.origin?.length && !q.origin.includes(hit.origin ?? "")) return false;
  if (q.entities?.length) {
    const ents = (hit.entities ?? []).map((e) => e.toLowerCase());
    if (!q.entities.every((e) => ents.some((x) => x.includes(e.toLowerCase())))) return false;
  }
  if (q.within?.length) {
    const filed = hit.filed_under ?? [];
    const ok = q.within.every((w) =>
      filed.some(
        (f) =>
          (w.id ? f.id === w.id : true) &&
          (w.name ? (f.name ?? "").toLowerCase() === w.name.toLowerCase() : true) &&
          (w.type === f.type || w.type === "tag" || !w.id),
      ) || (w.id !== undefined && hit.id === w.id),
    );
    if (!ok) return false;
  }
  if (q.captured_by === "me" && hit.captured_by?.id !== FIXTURE_ME) return false;
  if (Array.isArray(q.captured_by) && !q.captured_by.includes(hit.captured_by?.id ?? "")) return false;
  if (q.state?.length && !q.state.includes(hit.triage_state ?? ("__none" as never))) return false;
  if (q.date?.relative) {
    const iso = q.date.field === "created" ? hit.created_at : hit.updated_at;
    if (!withinRelative(iso, q.date.relative)) return false;
  }
  if (q.text && matchesText(hit, q.text) === 0) return false;
  return true;
}

function sortHits(hits: KnowledgeHit[], q: KnowledgeQuery): KnowledgeHit[] {
  const sort = q.sort ?? (q.text ? "relevance" : "recent");
  const copy = [...hits];
  if (sort === "title") copy.sort((a, b) => a.title.localeCompare(b.title));
  else if (sort === "relevance" && q.text)
    copy.sort((a, b) => matchesText(b, q.text ?? "") - matchesText(a, q.text ?? ""));
  else copy.sort((a, b) => Date.parse(b.updated_at ?? "") - Date.parse(a.updated_at ?? ""));
  return copy;
}

export interface FixtureRunnerOptions {
  /** Sections that answer with a lane failure (to exercise honest error states). */
  failSections?: KnowledgeSectionKey[];
  /** Artificial latency per lane, ms. Segments stream after the instant lanes. */
  delayMs?: number;
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (ms <= 0) return resolve();
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new DOMException("Aborted", "AbortError"));
    });
  });

export function createFixtureRunner(opts: FixtureRunnerOptions = {}): KnowledgeSearchRunner {
  const delay = opts.delayMs ?? 0;
  return async (query, options = {}) => {
    const searching = Boolean(query.text?.trim());
    const pageSize = query.limit ?? (searching ? 5 : 25);
    const pool = [...FIXTURE_HITS, ...(searching ? SEGMENT_HITS : [])].filter((h) =>
      fixtureMatches(h, query),
    );
    const sorted = sortHits(pool, query);
    const only = query.cursors ? Object.keys(query.cursors) : null;
    const out: KnowledgeSection[] = [];
    // The service's passes: typing / `instant` never runs Segments; `content` is Segments only.
    const pass = options.pass ?? (options.asYouType ? "instant" : undefined);
    const keys = KNOWLEDGE_SECTION_KEYS.filter((k) => (only ? only.includes(k) : true)).filter((k) =>
      pass === "instant" ? k !== "segments" : pass === "content" ? k === "segments" : true,
    );
    for (const key of keys) {
      if (key === "segments") await sleep(delay * 3, options.signal);
      else await sleep(delay, options.signal);
      let section: KnowledgeSection;
      if (opts.failSections?.includes(key)) {
        section = {
          key,
          label: KNOWLEDGE_SECTION_LABEL[key],
          count: null,
          items: [],
          next_cursor: null,
          error: { message: `The ${KNOWLEDGE_SECTION_LABEL[key]} lane did not answer (sample failure).`, retryable: true },
        };
      } else if (key === "top_hit") {
        const t = (query.text ?? "").trim().toLowerCase();
        const hit = t ? sorted.find((h) => h.entity !== "segment" && h.title.toLowerCase().startsWith(t)) : undefined;
        section = { key, label: KNOWLEDGE_SECTION_LABEL[key], count: hit ? 1 : 0, items: hit ? [hit] : [], next_cursor: null };
      } else {
        const all = sorted.filter((h) => sectionForEntity(h.entity) === key);
        const offset = Number(query.cursors?.[key] ?? 0) || 0;
        const items = all.slice(offset, offset + pageSize);
        const next = offset + pageSize < all.length ? String(offset + pageSize) : null;
        section = { key, label: KNOWLEDGE_SECTION_LABEL[key], count: all.length, items, next_cursor: next };
      }
      out.push(section);
      options.onSection?.(section);
    }
    return out;
  };
}

export const searchKnowledgeFixture = createFixtureRunner();
