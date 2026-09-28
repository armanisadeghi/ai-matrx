/**
 * The tracker editor's pure model (BRIEFS-STRATEGY-AND-ORG-CHART §5.1).
 *
 * One draft for both lenses, filled from the saved monitor, then from the
 * proposal (§5.3), then by the person. Every item carries its basis — where it
 * came from — so the editor can show a "why" chip and the person can tell a
 * term they typed from one the proposer read on their site. Counts outside the
 * `news.setup.counts` knob ranges WARN; nothing here ever blocks a save
 * (validation offers, never blocks).
 */

import type { components } from "@/types/python-generated/api-types";

export type BasisKind =
  | "user"
  | "site_page"
  | "business_fact"
  | "brand_record"
  | "named_entity"
  | "recent_coverage";

export interface Basis {
  kind: BasisKind;
  ref: string;
}

export interface DraftItem {
  text: string;
  basis: Basis;
}

export interface DraftKeyword {
  keyword: string;
  means: string;
  /** Ignore words: matches containing these are not about us. */
  excludeHints: string[];
  basis: Basis;
}

export interface DraftCompetitor {
  name: string;
  means: string;
  excludeHints: string[];
  basis: Basis;
}

export interface DraftFeed {
  feedId: string;
  why: string;
  /** True when the proposer picked it; false when the person ticked it. */
  proposed: boolean;
}

export interface DraftBrief {
  audience: string;
  pitch: string;
  never: string;
  surface: string;
}

/** A schedule choice id from the `news.setup.schedule_presets` knob ("" until the knob loads). */
export type SchedulePreset = string;

export interface MonitorDraft {
  name: string;
  coverage: boolean;
  opportunity: boolean;
  siteId: string | null;
  keywords: DraftKeyword[];
  competitors: DraftCompetitor[];
  topics: DraftItem[];
  searchTerms: DraftItem[];
  standing: DraftItem[];
  feeds: DraftFeed[];
  xTrends: boolean;
  exclusions: string[];
  brief: DraftBrief;
  briefSourceId: string | null;
  schedule: SchedulePreset;
  timezone: string;
}

export type CountRanges = Record<string, [number, number]>;

export const USER_BASIS: Basis = { kind: "user", ref: "user" };

/** The chip a person reads: the brief's five words. */
export function basisChip(basis: Basis): string {
  switch (basis.kind) {
    case "user":
      return "you said it";
    case "site_page":
      return "your site";
    case "business_fact":
    case "brand_record":
      return "your brand";
    case "named_entity":
      return "named company";
    case "recent_coverage":
      return "recent coverage";
    default:
      return "other";
  }
}

export interface ScheduleOption {
  id: string;
  label: string;
  /** How many runs a month the choice makes — the cost estimate's multiplier. */
  runsPerMonth: number;
  recommended: boolean;
}

/** The `news.setup.schedule_presets` knob, read into options. Malformed
 *  entries are skipped, never guessed. */
export function scheduleOptions(raw: unknown): ScheduleOption[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    const e = asRecord(entry);
    const id = typeof e.id === "string" ? e.id : "";
    const label = typeof e.label === "string" ? e.label : "";
    const runs = Number(e.runs_per_month);
    if (!id || !label || !Number.isFinite(runs)) return [];
    return [{ id, label, runsPerMonth: runs, recommended: e.recommended === true }];
  });
}

/** The `news.setup.schedule_default` knob: coverage-only monitors and monitors
 *  with the opportunity lens each start on their own choice (brief §5.1 8). */
export function defaultSchedule(
  opportunity: boolean,
  defaults: Record<string, string> | undefined,
): SchedulePreset {
  return (opportunity ? defaults?.opportunity : defaults?.coverage_only) ?? "";
}

/** 32-bit FNV-1a over the UTF-8 bytes of `text`. */
export function fnv32a(text: string): number {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(text)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** The minute a monitor runs, fixed per monitor: never :00, so a thousand
 *  monitors never fire in the same second (brief §5.1 8). */
export function scheduleMinute(trackerId: string): number {
  return (fnv32a(trackerId) % 59) + 1;
}

export function countWarning(
  what: string,
  count: number,
  range: [number, number] | undefined,
): string | null {
  if (!range) return null;
  const [low, high] = range;
  if (count < low) {
    return `${count} ${what} — we suggest ${low} to ${high}. You can save anyway.`;
  }
  if (count > high) {
    return `${count} ${what} — we suggest at most ${high}; more makes the monitor noisier. You can save anyway.`;
  }
  return null;
}

/** A beat is 2–3 words (the `topic_words` range); longer beats catch headlines,
 *  not subjects. Returns the beats outside the range. */
export function beatsOutsideWordRange(
  topics: DraftItem[],
  range: [number, number] | undefined,
): string[] {
  if (!range) return [];
  const [, high] = range;
  return topics
    .map((t) => t.text.trim())
    .filter((t) => t && t.split(/\s+/).length > high);
}

export function slugKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function dedupe<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const k = key(item).trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

type Proposal = {
  topics?: Array<{ text: string; basis: Basis }>;
  competitors?: Array<{ text: string; basis: Basis }>;
  search_terms?: Array<{ text: string; basis: Basis }>;
  standing?: Array<{ text: string; basis: Basis }>;
  feed_picks?: Array<{ feed_id: string; why: string }>;
  coverage_keywords?: Array<{
    keyword: string;
    means: string;
    exclude_hints?: string[];
    side?: "brand" | "competitor";
    basis: Basis;
  }>;
  missing?: string[];
  dropped_without_basis?: string[];
};
export type SetupProposal = Proposal;

/**
 * Fold a proposal into the draft WITHOUT overwriting what the person already
 * has: a proposed item is added only when no item with the same text exists,
 * and a proposed means line fills only an empty one.
 */
export function applyProposal(draft: MonitorDraft, proposal: Proposal): MonitorDraft {
  const items = (list: Proposal["topics"]) =>
    (list ?? []).map((i) => ({ text: i.text, basis: i.basis }));
  const brandKeywords = (proposal.coverage_keywords ?? []).filter(
    (k) => (k.side ?? "brand") === "brand",
  );
  const competitorKeywords = (proposal.coverage_keywords ?? []).filter(
    (k) => k.side === "competitor",
  );

  const keywords = draft.keywords.map((k) => {
    const hit = brandKeywords.find(
      (p) => p.keyword.trim().toLowerCase() === k.keyword.trim().toLowerCase(),
    );
    if (!hit) return k;
    return {
      ...k,
      means: k.means.trim() ? k.means : hit.means,
      excludeHints: k.excludeHints.length ? k.excludeHints : (hit.exclude_hints ?? []),
    };
  });
  for (const p of brandKeywords) {
    if (!keywords.some((k) => k.keyword.trim().toLowerCase() === p.keyword.trim().toLowerCase())) {
      keywords.push({
        keyword: p.keyword,
        means: p.means,
        excludeHints: p.exclude_hints ?? [],
        basis: p.basis,
      });
    }
  }

  const competitors = [...draft.competitors];
  for (const c of [
    ...items(proposal.competitors).map((i) => ({ name: i.text, means: "", excludeHints: [] as string[], basis: i.basis })),
    ...competitorKeywords.map((k) => ({ name: k.keyword, means: k.means, excludeHints: k.exclude_hints ?? [], basis: k.basis })),
  ]) {
    const existing = competitors.findIndex(
      (x) => x.name.trim().toLowerCase() === c.name.trim().toLowerCase(),
    );
    if (existing < 0) competitors.push(c);
    else if (!competitors[existing].means.trim() && c.means.trim()) {
      competitors[existing] = { ...competitors[existing], means: c.means, excludeHints: c.excludeHints };
    }
  }

  const feeds = [...draft.feeds];
  for (const pick of proposal.feed_picks ?? []) {
    if (!feeds.some((f) => f.feedId === pick.feed_id)) {
      feeds.push({ feedId: pick.feed_id, why: pick.why, proposed: true });
    }
  }

  return {
    ...draft,
    keywords,
    competitors,
    topics: dedupe([...draft.topics, ...items(proposal.topics)], (i) => i.text),
    searchTerms: dedupe([...draft.searchTerms, ...items(proposal.search_terms)], (i) => i.text),
    standing: dedupe([...draft.standing, ...items(proposal.standing)], (i) => i.text),
    feeds,
  };
}

type TrackerRow = {
  id: string;
  name: string;
  lenses: string[];
  site_id: string | null;
  brand_terms: string[];
  competitors: unknown;
  topics: string[];
  search_terms: string[];
  standing: string[];
  feed_ids: string[];
  x_trends_woeids: number[];
  exclude_terms: string[];
  brief_source_id: string | null;
  term_meanings: unknown;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.map((v) => String(v)).filter(Boolean) : [];
}

/** The brand's own names: its name first, then every alias on the brand. */
export function brandKeywordsFromBrand(
  name: string,
  aliases: string[],
): DraftKeyword[] {
  return dedupe(
    [name, ...aliases].map((keyword, index) => ({
      keyword,
      means: "",
      excludeHints: [],
      basis: { kind: "brand_record" as const, ref: index === 0 ? "brand:company_name" : "brand:aliases" },
    })),
    (k) => k.keyword,
  );
}

/** A saved monitor, read back into the draft (everything saved is the person's). */
export function draftFromTracker(
  tracker: TrackerRow,
  fallbackKeywords: DraftKeyword[],
  timezone: string,
): MonitorDraft {
  const meanings = asRecord(tracker.term_meanings);
  const keywordNames = tracker.brand_terms.length
    ? tracker.brand_terms
    : fallbackKeywords.map((k) => k.keyword);
  const keywords = keywordNames.map((keyword) => {
    const entry = asRecord(meanings[keyword]);
    return {
      keyword,
      means: String(entry.means ?? ""),
      excludeHints: asStrings(entry.exclude_hints),
      basis: USER_BASIS,
    };
  });
  const competitors = (Array.isArray(tracker.competitors) ? tracker.competitors : []).map((raw) => {
    const c = asRecord(raw);
    const terms = asStrings(c.terms);
    return {
      name: terms[0] ?? String(c.key ?? ""),
      means: String(c.means ?? ""),
      excludeHints: asStrings(c.exclude_hints),
      basis: USER_BASIS,
    };
  });
  const user = (list: string[]) => list.map((text) => ({ text, basis: USER_BASIS }));
  const opportunity = tracker.lenses.includes("opportunity");
  return {
    name: tracker.name,
    coverage: tracker.lenses.includes("coverage"),
    opportunity,
    siteId: tracker.site_id,
    keywords,
    competitors,
    topics: user(tracker.topics),
    searchTerms: user(tracker.search_terms),
    standing: user(tracker.standing),
    feeds: tracker.feed_ids.map((feedId) => ({ feedId, why: "", proposed: false })),
    xTrends: tracker.x_trends_woeids.length > 0,
    exclusions: tracker.exclude_terms,
    brief: emptyBrief(),
    briefSourceId: tracker.brief_source_id,
    schedule: "",
    timezone,
  };
}

export function emptyBrief(): DraftBrief {
  return { audience: "", pitch: "", never: "", surface: "" };
}

export function newDraft(input: {
  brandName: string;
  aliases: string[];
  siteId: string | null;
  timezone: string;
}): MonitorDraft {
  const hasSite = Boolean(input.siteId);
  return {
    name: `${input.brandName} news monitor`,
    // Both lenses for a brand with a site; opportunity only without one (§5.1 1).
    coverage: hasSite,
    opportunity: true,
    siteId: input.siteId,
    keywords: brandKeywordsFromBrand(input.brandName, input.aliases),
    competitors: [],
    topics: [],
    searchTerms: [],
    standing: [],
    feeds: [],
    xTrends: false,
    exclusions: [],
    brief: emptyBrief(),
    briefSourceId: null,
    schedule: "",
    timezone: input.timezone,
  };
}

const BRIEF_SECTIONS: Array<[keyof DraftBrief, string]> = [
  ["audience", "Audience"],
  ["pitch", "We pitch"],
  ["never", "We never pitch"],
  ["surface", "How to surface"],
];

/** Only what the person typed; an empty section stays an empty heading, and an
 *  entirely empty brief is `null` (an empty brief carries no rules). */
export function briefMarkdown(brief: DraftBrief): string | null {
  if (BRIEF_SECTIONS.every(([key]) => !brief[key].trim())) return null;
  return BRIEF_SECTIONS.map(([key, heading]) =>
    `## ${heading}\n\n${brief[key].trim()}`.trimEnd(),
  ).join("\n\n");
}

/** Read a saved brief back into its four sections. */
export function parseBriefMarkdown(markdown: string): DraftBrief {
  const out = emptyBrief();
  const parts = markdown.split(/^##\s+/m);
  for (const part of parts) {
    const [headingLine, ...rest] = part.split("\n");
    const match = BRIEF_SECTIONS.find(
      ([, heading]) => heading.toLowerCase() === headingLine.trim().toLowerCase(),
    );
    if (match) out[match[0]] = rest.join("\n").trim();
  }
  return out;
}

export type DeclareTrackerBody = components["schemas"]["DeclareTrackerBody"];

/** The one save: `POST /coverage/trackers`. */
export function toDeclareBody(
  draft: MonitorDraft,
  input: {
    brandId: string;
    brandKey: string;
    declaredRef: Record<string, unknown>;
    xTrendsWoeids: number[];
  },
): DeclareTrackerBody {
  const lenses: Array<"coverage" | "opportunity"> = [];
  if (draft.coverage) lenses.push("coverage");
  if (draft.opportunity) lenses.push("opportunity");
  const keywords = draft.keywords.filter((k) => k.keyword.trim());
  const competitors = draft.competitors.filter((c) => c.name.trim());
  const texts = (list: DraftItem[]) => list.map((i) => i.text.trim()).filter(Boolean);
  const termMeanings: NonNullable<DeclareTrackerBody["term_meanings"]> = {};
  for (const k of keywords) {
    termMeanings[k.keyword.trim()] = {
      means: k.means.trim(),
      exclude_hints: k.excludeHints,
    };
  }
  return {
    name: draft.name.trim(),
    lenses,
    site_id: draft.siteId,
    brand_id: draft.siteId ? null : input.brandId,
    brand_key: draft.coverage ? input.brandKey : null,
    brand_terms: keywords.map((k) => k.keyword.trim()),
    term_meanings: termMeanings,
    competitors: competitors.map((c) => ({
      key: slugKey(c.name),
      terms: [c.name.trim()],
      means: c.means.trim(),
      exclude_hints: c.excludeHints,
    })),
    exclude_terms: draft.exclusions.map((e) => e.trim()).filter(Boolean),
    topics: texts(draft.topics),
    search_terms: texts(draft.searchTerms),
    standing: texts(draft.standing),
    feed_ids: draft.feeds.map((f) => f.feedId),
    x_trends_woeids: draft.xTrends ? input.xTrendsWoeids : [],
    brief_source_id: draft.briefSourceId,
    declared_by: "user",
    declared_ref: input.declaredRef as DeclareTrackerBody["declared_ref"],
  };
}
