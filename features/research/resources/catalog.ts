/**
 * THE RESOURCE CATALOG — one entry per thing an agent can be given.
 *
 * This registry is the whole point of the system: adding a new resource kind
 * (a keyword-metrics table from `seo.*`, brand facts from `web.*`, a RAG
 * library slice) is ONE entry here. The picker, the budget meter, the resolver,
 * and every saved bundle pick it up with no further changes. Nothing may
 * hard-code a resource type anywhere else.
 *
 * Two flavours of entry:
 *
 *   DB kinds       — items come from the manifest; `fetchBodies` reads the text
 *                    for the selected ids only, `render` turns each into a
 *                    labeled block.
 *   DERIVED kinds  — no rows of their own; `derive` computes text from the
 *                    manifest already in hand (the topic brief, the inventory,
 *                    the authority/importance tables, the tag map). These cost
 *                    nothing extra and are the highest-value inputs for
 *                    "what do we have / what is missing" work.
 *
 * `heavy: true` marks kinds that will blow a context window if selected whole
 * (raw provider payloads, full page bodies, link dumps). The picker never
 * pre-selects those; the user opts in and sees the cost.
 */

import {
  FileText,
  Globe,
  Braces,
  ScrollText,
  Sparkles,
  BookOpen,
  Tags,
  Image as ImageIcon,
  Link2,
  Gauge,
  ListTree,
  Layers,
  type LucideIcon,
} from "lucide-react";
import { supabase } from "@/utils/supabase/client";
import { estimateTokens } from "@/lib/tokens/estimate";
// NOT imported from `../utils/condensedAuthorityExport`, which owns the same
// parsing for the authority export: that module does not compile on main (it
// calls an undefined `stringArrayFromJson` — see FOUND_DEFECTS D104), so
// importing it would put a type error on this path. Consolidate onto ONE
// normalizer the moment that file is fixed; this duplication is a defect with a
// pointer, not a decision.
import type {
  ResourceBody,
  ResourceGranularity,
  ResourceGroup,
  ResourceItem,
  ResourceKey,
  ResourceManifest,
} from "./types";
import { itemsOf } from "./manifest";
import {
  block,
  bulletList,
  jsonBlock,
  sourceMeta,
  table,
  type RenderContext,
} from "./render";

/** Supabase `.in()` chunk size — keeps request URLs under gateway limits. */
const FETCH_CHUNK = 150;

/**
 * Per-snippet cap for the condensed index. Long enough to keep a real snippet
 * intact, short enough that one verbose result cannot dominate the budget.
 */
const CONDENSED_SNIPPET_MAX_CHARS = 500;

/**
 * Snippets as the provider gave them: sometimes plain strings, sometimes
 * `{text}` / `{snippet}` objects, sometimes on the column and sometimes only
 * inside the raw payload. All four shapes exist in live rows.
 */
function readSnippets(raw: unknown): string[] {
  if (raw == null) return [];
  if (typeof raw === "string") {
    const t = raw.trim();
    return t ? [t] : [];
  }
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item === "string") {
      const t = item.trim();
      if (t) out.push(t);
      continue;
    }
    if (item && typeof item === "object") {
      const rec = item as Record<string, unknown>;
      const text = rec.text ?? rec.snippet;
      if (typeof text === "string") {
        const t = text.trim();
        if (t) out.push(t);
      }
    }
  }
  return out;
}

/** Cap each snippet so one verbose result cannot dominate the budget. */
function capSnippets(snippets: string[], maxChars: number): string[] {
  if (maxChars <= 0) return snippets;
  return snippets.map((s) =>
    s.length <= maxChars ? s : `${s.slice(0, maxChars)}…`,
  );
}

/**
 * Kinds a fresh selection starts with.
 *
 * Sources is here because it is the one resource that is almost always worth
 * its tokens: scrapes fail constantly — plenty of the best sites simply refuse
 * — and for every one of those sources the search snippets are the ONLY
 * substance we hold. A run that omits them throws away the cheapest real
 * evidence in the topic. The brief frames the subject for a few hundred chars.
 *
 * These are DEFAULTS, not force: the picker pre-checks them and every shipped
 * bundle carries them, and the user can uncheck them like anything else.
 */
export const RECOMMENDED_KINDS: ResourceKey[] = [
  "topic.brief",
  "search.result",
];

export interface ResourceKindDef {
  key: ResourceKey;
  label: string;
  /** One line the user reads to decide whether to include this. */
  description: string;
  icon: LucideIcon;
  group: ResourceGroup;
  granularity: ResourceGranularity;
  /** Large enough that selecting it whole is a deliberate act. */
  heavy: boolean;
  /** Prose vs structured — feeds the token estimator's ratio. */
  shape: "prose" | "structured";
  /** Agent variable this kind lands in by default. */
  defaultVariable: string;
  /** Derived kinds compute their text from the manifest; they have no rows. */
  derive?: (manifest: ResourceManifest, ctx: RenderContext) => string;
  /** DB kinds fetch bodies for exactly the selected ids. */
  fetchBodies?: (ids: string[]) => Promise<Map<string, ResourceBody>>;
  /** DB kinds render one item + its body into a labeled block. */
  render?: (
    item: ResourceItem,
    body: ResourceBody | undefined,
    ctx: RenderContext,
  ) => string;
}

// ─────────────────────────────────────────────────────────── fetch helpers ───

/** The research tables a resource body can come from. */
type BodyTable =
  | "rs_source"
  | "rs_content"
  | "rs_analysis"
  | "rs_synthesis"
  | "rs_document"
  | "rs_keyword";

/**
 * Batched read of one table's text columns, keyed by id.
 *
 * `.returns<T[]>()` states the row shape at the boundary — the sanctioned way
 * to type a select whose column list is a runtime string (see
 * TYPESCRIPT_STANDARDS.md). It is a declaration, not a cast of a wider row.
 */
async function fetchRows<T extends { id: string }>(
  table_: BodyTable,
  columns: string,
  ids: string[],
): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += FETCH_CHUNK) {
    const chunk = ids.slice(i, i + FETCH_CHUNK);
    const { data, error } = await supabase
      .schema("research")
      .from(table_)
      .select(columns)
      .in("id", chunk)
      .returns<T[]>();
    if (error) throw error;
    out.push(...(data ?? []));
  }
  return out;
}

function textOf(v: unknown): string {
  return typeof v === "string" ? v : "";
}

// ─────────────────────────────────────────────────────────── derived kinds ───

function deriveBrief(manifest: ResourceManifest): string {
  const { topic, keywords } = manifest;
  const lines = [
    block(
      "Research brief",
      [
        ["Topic", topic.name],
        ["Started", topic.created_at],
        ["Voice & lens", topic.tone_profile],
      ],
      topic.description ?? "",
    ),
  ];
  if (keywords.length > 0) {
    lines.push(
      block(
        "Search keywords",
        [["Count", keywords.length]],
        keywords
          .map(
            (k) =>
              `- ${k.keyword}${k.searched_at ? "" : " (not searched yet)"}${
                k.result_count ? ` — ${k.result_count} results` : ""
              }`,
          )
          .join("\n"),
      ),
    );
  }
  return lines.join("\n\n");
}

/**
 * The inventory: what this research actually contains, as a table.
 *
 * This is the input a gap analysis needs and the one nothing else could give
 * it — an agent handed only the report cannot tell whether a keyword was never
 * searched or simply had nothing to say.
 */
function deriveInventory(manifest: ResourceManifest): string {
  const rows: Array<Array<string | number | null>> = [];
  for (const def of CATALOG) {
    if (def.derive) continue;
    const rollup = manifest.rollups.get(def.key);
    rows.push([
      def.label,
      rollup?.itemCount ?? 0,
      rollup?.chars ? rollup.chars.toLocaleString() : "0",
    ]);
  }
  const unsearched = manifest.keywords.filter((k) => !k.searched_at);
  const stale = manifest.keywords.filter((k) => k.stale);
  const sources = itemsOf(manifest, "search.result");
  const excluded = sources.filter((s) => !s.included).length;
  const pagesRead = itemsOf(manifest, "page.content").length;
  const analyzed = new Set(
    itemsOf(manifest, "page.analysis")
      .filter((a) => a.flags.latest === true && a.status === "success")
      .map((a) => a.sourceId),
  ).size;

  const coverage = [
    `- Keywords: ${manifest.keywords.length} (${unsearched.length} never searched, ${stale.length} stale)`,
    `- Sources discovered: ${sources.length} (${excluded} excluded during curation)`,
    `- Sources whose page was read: ${pagesRead}`,
    `- Sources with a successful AI analysis: ${analyzed}`,
    `- Tags: ${manifest.tags.length}`,
  ];
  if (unsearched.length > 0) {
    coverage.push(
      `- NOT SEARCHED: ${unsearched.map((k) => k.keyword).join(", ")}`,
    );
  }

  return [
    block("Research inventory — coverage", [], coverage.join("\n")),
    block(
      "Research inventory — holdings",
      [["Snapshot", manifest.generatedAt]],
      table(["Resource", "Items", "Characters"], rows),
    ),
  ].join("\n\n");
}

function deriveAuthorityTable(manifest: ResourceManifest): string {
  const rows = itemsOf(manifest, "search.result")
    .filter((s) => s.authority !== null)
    .sort((a, b) => (b.authority ?? 0) - (a.authority ?? 0))
    .map((s) => [
      s.label,
      typeof s.flags.hostname === "string" ? s.flags.hostname : "",
      s.authority,
      typeof s.flags.tier === "string" ? s.flags.tier : "",
    ]);
  if (rows.length === 0) return "";
  return block(
    "Source authority (AI-judged trustworthiness)",
    [["Ranked sources", rows.length]],
    table(["Source", "Site", "Score", "Tier"], rows),
  );
}

function deriveImportanceTable(manifest: ResourceManifest): string {
  const rows = itemsOf(manifest, "search.result")
    .filter((s) => s.importance !== null && s.importance > 0)
    .sort((a, b) => (b.importance ?? 0) - (a.importance ?? 0))
    .map((s) => [
      s.label,
      typeof s.flags.hostname === "string" ? s.flags.hostname : "",
      s.importance,
      s.bestRank !== null ? `#${s.bestRank}` : "",
      s.keywordIds.length,
    ]);
  if (rows.length === 0) return "";
  return block(
    "Source importance (search-position salience)",
    [
      ["Sources", rows.length],
      [
        "How to read",
        "importance sums each keyword's rank weight — breadth beats a single #1",
      ],
    ],
    table(["Source", "Site", "Importance", "Best rank", "Keywords"], rows),
  );
}

function deriveTagMap(manifest: ResourceManifest, ctx: RenderContext): string {
  if (manifest.tags.length === 0) return "";
  const sources = itemsOf(manifest, "search.result");
  const sections = manifest.tags.map((tag) => {
    const members = sources.filter((s) => s.tagIds.includes(tag.id));
    return block(
      `Tag: ${tag.name}`,
      [
        ["Sources", members.length],
        ["Description", tag.description],
      ],
      members
        .map((m) => `- ${m.label} (${ctx.urlForSource(m.sourceId) ?? "no URL"})`)
        .join("\n"),
    );
  });
  return sections.join("\n\n");
}

// ────────────────────────────────────────────────────────────── the catalog ──

export const CATALOG: ResourceKindDef[] = [
  // ── Framing ───────────────────────────────────────────────────────────────
  {
    key: "topic.brief",
    label: "Research brief",
    description:
      "The topic's own framing: name, description, voice & lens, and the keyword list.",
    icon: BookOpen,
    group: "brief",
    granularity: "topic",
    heavy: false,
    shape: "prose",
    defaultVariable: "research_brief",
    derive: deriveBrief,
  },
  {
    key: "topic.inventory",
    label: "Inventory & coverage",
    description:
      "What this research holds and what it is missing — counts per resource, unsearched keywords, unread and unanalyzed sources.",
    icon: ListTree,
    group: "brief",
    granularity: "topic",
    heavy: false,
    shape: "prose",
    defaultVariable: "research_inventory",
    derive: deriveInventory,
  },

  // ── Search ────────────────────────────────────────────────────────────────
  {
    key: "search.result",
    label: "Sources",
    description:
      "Every search result in the tightest useful form: URL, age, title, description and all snippets. The highest value per token in the whole catalogue — a page the reader could not fetch still contributes its snippets here, and many of the best sites never allow a read at all.",
    icon: Globe,
    group: "search",
    granularity: "source",
    heavy: false,
    shape: "prose",
    defaultVariable: "search_results",
    fetchBodies: async (ids) => {
      const rows = await fetchRows<{
        id: string;
        url: string | null;
        title: string | null;
        description: string | null;
        page_age: string | null;
        extra_snippets: unknown;
        raw_search_result: unknown;
      }>(
        "rs_source",
        "id,url,title,description,page_age,extra_snippets,raw_search_result",
        ids,
      );
      const map = new Map<string, ResourceBody>();
      for (const r of rows) {
        // Snippets live on `extra_snippets`, or inside the raw provider payload
        // on older rows. ONE normalizer — the same one the condensed authority
        // export proved — never a second copy of this parsing.
        const raw =
          r.raw_search_result && typeof r.raw_search_result === "object"
            ? (r.raw_search_result as Record<string, unknown>)
            : null;
        let snippets = readSnippets(r.extra_snippets);
        if (snippets.length === 0 && raw) {
          snippets = readSnippets(raw.extra_snippets);
        }
        snippets = capSnippets(snippets, CONDENSED_SNIPPET_MAX_CHARS);

        const age =
          r.page_age?.trim() ||
          (typeof raw?.age === "string" ? raw.age.trim() : "") ||
          "";

        // A flat record, NOT `block()`. On 236 sources a `## heading` plus a
        // `- URL:` meta line per row costs more than the content it labels, and
        // the URL already says what site it is. No authority / rank /
        // importance either — those chose what the model is looking at; saying
        // them again asks it to weight the same signal twice.
        const lines: string[] = [];
        lines.push(age ? `- ${r.url ?? ""} (${age})` : `- ${r.url ?? ""}`);
        if (r.title?.trim()) lines.push(`  ${r.title.trim()}`);
        if (r.description?.trim()) lines.push(`  ${r.description.trim()}`);
        for (const sn of snippets) lines.push(`  • ${sn}`);
        map.set(r.id, { id: r.id, text: lines.join("\n") });
      }
      return map;
    },
    // The record is already complete and self-labelling by its URL.
    render: (_item, body) => body?.text ?? "",
  },
  {
    key: "search.raw",
    label: "Raw search payloads",
    description:
      "The complete provider response per result (Brave et al.) — profiles, ratings, social links, deep metadata. Very large.",
    icon: Braces,
    group: "search",
    granularity: "source",
    heavy: true,
    shape: "structured",
    defaultVariable: "search_payloads",
    fetchBodies: async (ids) => {
      const rows = await fetchRows<{ id: string; raw_search_result: unknown }>(
        "rs_source",
        "id,raw_search_result",
        ids,
      );
      return new Map(
        rows.map((r) => [
          r.id,
          { id: r.id, text: jsonBlock(r.raw_search_result) } as ResourceBody,
        ]),
      );
    },
    render: (item, body, ctx) =>
      block(`Raw search payload — ${item.label}`, sourceMeta(item, ctx), body?.text ?? ""),
  },
  {
    key: "search.keyword_serp",
    label: "Keyword SERP payloads",
    description:
      "The full search API response for each keyword, including results we never read. Very large.",
    icon: Braces,
    group: "search",
    granularity: "keyword",
    heavy: true,
    shape: "structured",
    defaultVariable: "keyword_serps",
    fetchBodies: async (ids) => {
      const rows = await fetchRows<{
        id: string;
        keyword: string | null;
        raw_api_response: unknown;
      }>("rs_keyword", "id,keyword,raw_api_response", ids);
      return new Map(
        rows.map((r) => [
          r.id,
          {
            id: r.id,
            text: jsonBlock(r.raw_api_response),
            meta: { keyword: r.keyword ?? undefined },
          } as ResourceBody,
        ]),
      );
    },
    render: (item, body) =>
      block(
        `Keyword SERP — ${item.label}`,
        [["Provider", item.sublabel]],
        body?.text ?? "",
      ),
  },

  // ── Pages ─────────────────────────────────────────────────────────────────
  {
    key: "page.content",
    label: "Content",
    description:
      "The full text of each page that was read. The same rows the Content page lists — the richest input there is, and by far the largest at ~46k characters per page.",
    icon: FileText,
    group: "pages",
    granularity: "source",
    heavy: true,
    shape: "prose",
    defaultVariable: "scraped_pages",
    fetchBodies: async (ids) => {
      const rows = await fetchRows<{ id: string; content: string | null }>(
        "rs_content",
        "id,content",
        ids,
      );
      return new Map(
        rows.map((r) => [r.id, { id: r.id, text: textOf(r.content) }]),
      );
    },
    render: (item, body, ctx) =>
      block(item.label, sourceMeta(item, ctx), body?.text ?? ""),
  },
  {
    key: "page.analysis",
    label: "Analysis",
    description:
      "The AI write-up produced for each page — the same rows the Analysis page lists. Already distilled, far smaller than the page itself.",
    icon: Sparkles,
    group: "pages",
    granularity: "source",
    heavy: false,
    shape: "prose",
    defaultVariable: "page_analyses",
    fetchBodies: async (ids) => {
      const rows = await fetchRows<{
        id: string;
        result: string | null;
        model_id: string | null;
      }>("rs_analysis", "id,result,model_id", ids);
      return new Map(
        rows.map((r) => [
          r.id,
          {
            id: r.id,
            text: textOf(r.result),
            meta: { model: r.model_id ?? undefined },
          } as ResourceBody,
        ]),
      );
    },
    render: (item, body, ctx) =>
      block(
        `Analysis — ${item.label}`,
        [...sourceMeta(item, ctx), ["Analyst", item.sublabel]],
        body?.text ?? "",
      ),
  },
  {
    key: "page.scoring",
    label: "Page scoring",
    description:
      "The pre-read / post-read / final scores and recommended use shown on a source's detail page — the pipeline's own judgement of what a page is good for.",
    icon: Gauge,
    group: "pages",
    granularity: "source",
    heavy: false,
    shape: "structured",
    defaultVariable: "page_scoring",
    fetchBodies: async (ids) => {
      const rows = await fetchRows<{ id: string; page_analysis: unknown }>(
        "rs_source",
        "id,page_analysis",
        ids,
      );
      return new Map(
        rows.map((r) => [
          r.id,
          { id: r.id, text: jsonBlock(r.page_analysis) } as ResourceBody,
        ]),
      );
    },
    render: (item, body, ctx) =>
      block(
        `Scoring — ${item.label}`,
        [
          ...sourceMeta(item, ctx),
          ["Recommended use", item.sublabel],
          ["Pre-read", typeof item.flags.pre_read === "number" ? item.flags.pre_read : null],
          ["Post-read", typeof item.flags.post_read === "number" ? item.flags.post_read : null],
        ],
        body?.text ?? "",
      ),
  },
  {
    key: "page.links",
    label: "Links",
    description:
      "Links found on each page that was read — the same set the Links explorer shows. Useful for mapping an entity's own properties and partners.",
    icon: Link2,
    group: "pages",
    granularity: "source",
    heavy: true,
    shape: "structured",
    defaultVariable: "page_links",
    fetchBodies: async (ids) => {
      const rows = await fetchRows<{ id: string; extracted_links: unknown }>(
        "rs_content",
        "id,extracted_links",
        ids,
      );
      return new Map(
        rows.map((r) => [
          r.id,
          {
            id: r.id,
            text: bulletList(r.extracted_links, (e) => {
              const href = typeof e.href === "string" ? e.href : typeof e.url === "string" ? e.url : null;
              if (!href) return null;
              const label = typeof e.text === "string" && e.text ? e.text : null;
              return label ? `${label} — ${href}` : href;
            }),
          } as ResourceBody,
        ]),
      );
    },
    render: (item, body, ctx) =>
      block(`Links from ${item.label}`, sourceMeta(item, ctx), body?.text ?? ""),
  },
  {
    key: "page.images",
    label: "Page images (raw)",
    description:
      "The RAW image list found on each page, before curation — this is what the Media library was built from, so it overlaps Media and is larger (59 raw vs 35 curated on a live topic). Text only: URLs and alt text, never pixels.",
    icon: ImageIcon,
    group: "pages",
    granularity: "source",
    heavy: true,
    shape: "structured",
    defaultVariable: "page_images",
    fetchBodies: async (ids) => {
      const rows = await fetchRows<{ id: string; extracted_images: unknown }>(
        "rs_content",
        "id,extracted_images",
        ids,
      );
      return new Map(
        rows.map((r) => [
          r.id,
          {
            id: r.id,
            text: bulletList(r.extracted_images, (e) => {
              const src = typeof e.src === "string" ? e.src : typeof e.url === "string" ? e.url : null;
              if (!src) return null;
              const alt = typeof e.alt === "string" && e.alt ? e.alt : null;
              return alt ? `${alt} — ${src}` : src;
            }),
          } as ResourceBody,
        ]),
      );
    },
    render: (item, body, ctx) =>
      block(`Images on ${item.label}`, sourceMeta(item, ctx), body?.text ?? ""),
  },

  // ── Synthesis ─────────────────────────────────────────────────────────────
  {
    key: "synthesis.keyword",
    label: "Keyword syntheses",
    description:
      "The synthesis report written for each keyword — the pipeline's per-angle conclusions.",
    icon: ScrollText,
    group: "synthesis",
    granularity: "keyword",
    heavy: false,
    shape: "prose",
    defaultVariable: "keyword_syntheses",
    fetchBodies: async (ids) => {
      const rows = await fetchRows<{
        id: string;
        result: string | null;
        result_structured: unknown;
      }>("rs_synthesis", "id,result,result_structured", ids);
      return new Map(
        rows.map((r) => [
          r.id,
          {
            id: r.id,
            // The backend always persists `result` on success; falling back to
            // result_structured matches how every other surface reads these.
            text: textOf(r.result) || (r.result_structured ? jsonBlock(r.result_structured) : ""),
          } as ResourceBody,
        ]),
      );
    },
    render: (item, body) =>
      block(
        `Keyword synthesis — ${item.label}`,
        [["Version", typeof item.flags.version === "number" ? item.flags.version : null]],
        body?.text ?? "",
      ),
  },
  {
    key: "synthesis.tag",
    label: "Tag consolidations",
    description:
      "Syntheses written across a tag's sources — the hand-curated themes of this research.",
    icon: Tags,
    group: "synthesis",
    granularity: "tag",
    heavy: false,
    shape: "prose",
    defaultVariable: "tag_consolidations",
    fetchBodies: async (ids) => {
      const rows = await fetchRows<{
        id: string;
        result: string | null;
        result_structured: unknown;
      }>("rs_synthesis", "id,result,result_structured", ids);
      return new Map(
        rows.map((r) => [
          r.id,
          {
            id: r.id,
            text: textOf(r.result) || (r.result_structured ? jsonBlock(r.result_structured) : ""),
          } as ResourceBody,
        ]),
      );
    },
    render: (item, body) =>
      block(`Tag consolidation — ${item.label}`, [], body?.text ?? ""),
  },
  {
    key: "synthesis.topic",
    label: "Topic report",
    description: "The topic-wide synthesis — the pipeline's overall conclusions.",
    icon: ScrollText,
    group: "synthesis",
    granularity: "topic",
    heavy: false,
    shape: "prose",
    defaultVariable: "research_report",
    fetchBodies: async (ids) => {
      const rows = await fetchRows<{
        id: string;
        result: string | null;
        result_structured: unknown;
      }>("rs_synthesis", "id,result,result_structured", ids);
      return new Map(
        rows.map((r) => [
          r.id,
          {
            id: r.id,
            text: textOf(r.result) || (r.result_structured ? jsonBlock(r.result_structured) : ""),
          } as ResourceBody,
        ]),
      );
    },
    render: (_item, body) => body?.text ?? "",
  },
  {
    key: "document.report",
    label: "Assembled document",
    description:
      "The finished, structured document built from the topic report. The default input for publishing outputs.",
    icon: Layers,
    group: "synthesis",
    granularity: "topic",
    heavy: false,
    shape: "prose",
    defaultVariable: "research_report",
    fetchBodies: async (ids) => {
      const rows = await fetchRows<{
        id: string;
        content: string | null;
        title: string | null;
      }>("rs_document", "id,content,title", ids);
      return new Map(
        rows.map((r) => [
          r.id,
          {
            id: r.id,
            text: textOf(r.content),
            meta: { title: r.title ?? undefined },
          } as ResourceBody,
        ]),
      );
    },
    // Rendered bare: this IS the report, and the publishing agents were tuned
    // on its raw markdown. Wrapping it in a heading would change their input.
    render: (_item, body) => body?.text ?? "",
  },

  // ── Derived tables ────────────────────────────────────────────────────────
  {
    key: "source.authority",
    label: "Authority table",
    description:
      "Every ranked source with its AI trustworthiness score and tier, as one table. Cheap way to give an agent the whole quality picture.",
    icon: Gauge,
    group: "meta",
    granularity: "topic",
    heavy: false,
    shape: "structured",
    defaultVariable: "source_quality",
    derive: deriveAuthorityTable,
  },
  {
    key: "source.importance",
    label: "Importance table",
    description:
      "Every source by search-position salience across all keywords — breadth-aware, not just a single rank.",
    icon: Gauge,
    group: "meta",
    granularity: "topic",
    heavy: false,
    shape: "structured",
    defaultVariable: "source_quality",
    derive: deriveImportanceTable,
  },
  {
    key: "tag.map",
    label: "Tag map",
    description: "Each tag and the sources assigned to it — the human's own grouping of this research.",
    icon: Tags,
    group: "meta",
    granularity: "topic",
    heavy: false,
    shape: "structured",
    defaultVariable: "tag_map",
    derive: deriveTagMap,
  },

  // ── Media ─────────────────────────────────────────────────────────────────
  {
    key: "media.items",
    label: "Media inventory",
    description:
      "The curated Media library — the same items the Media page shows. Text only: the model reads URLs, alt text and captions, never the pixels.",
    icon: ImageIcon,
    group: "media",
    granularity: "asset",
    heavy: false,
    shape: "structured",
    defaultVariable: "media_inventory",
    // No body fetch: url, alt text and caption already ride on the manifest
    // item, so selecting media costs zero extra reads.
    render: (item, _body, ctx) => {
      const url = typeof item.flags.url === "string" ? item.flags.url : null;
      const dims =
        typeof item.flags.width === "number" && typeof item.flags.height === "number"
          ? `${item.flags.width}×${item.flags.height}`
          : null;
      return block(
        `${item.sublabel ?? "media"} — ${item.label}`,
        [
          ["URL", url],
          ["Dimensions", dims],
          ["From page", ctx.urlForSource(item.sourceId)],
        ],
        "",
      );
    },
  },
];

const BY_KEY = new Map<ResourceKey, ResourceKindDef>(
  CATALOG.map((d) => [d.key, d]),
);

export function kindDef(key: ResourceKey): ResourceKindDef | undefined {
  return BY_KEY.get(key);
}

/** Catalog order, grouped — the picker renders exactly this. */
export const GROUP_ORDER: ResourceGroup[] = [
  "brief",
  "synthesis",
  "pages",
  "search",
  "meta",
  "media",
];

export const GROUP_LABEL: Record<ResourceGroup, string> = {
  brief: "Framing",
  synthesis: "Syntheses & reports",
  pages: "Pages",
  search: "Search",
  meta: "Quality & structure",
  media: "Media",
};

/**
 * Derived kinds have no manifest rows, so their size is unknown until rendered
 * — and rendering them is cheap (they read only the manifest already in hand).
 * This computes their text ONCE and folds real char counts into the rollups, so
 * the picker shows a true size for every kind, derived or not.
 */
export function deriveAll(
  manifest: ResourceManifest,
  ctx: RenderContext,
): Map<ResourceKey, string> {
  const out = new Map<ResourceKey, string>();
  for (const def of CATALOG) {
    if (!def.derive) continue;
    const text = def.derive(manifest, ctx).trim();
    out.set(def.key, text);
    manifest.rollups.set(def.key, {
      kind: def.key,
      itemCount: text ? 1 : 0,
      chars: text.length,
    });
  }
  return out;
}

/** Estimated tokens for a kind's whole holding, using that kind's shape. */
export function kindTokens(
  manifest: ResourceManifest,
  key: ResourceKey,
): number {
  const def = BY_KEY.get(key);
  const rollup = manifest.rollups.get(key);
  if (!def || !rollup) return 0;
  return estimateTokens(rollup.chars, def.shape);
}

/** Estimated tokens for a single item, using its kind's shape. */
export function itemTokens(item: ResourceItem): number {
  const def = BY_KEY.get(item.kind);
  return estimateTokens(item.chars, def?.shape ?? "prose");
}

/** Build the render context from a manifest (URL lookup, keyword/tag names). */
export function renderContextFor(manifest: ResourceManifest): RenderContext {
  const urlBySource = new Map<string, string>();
  for (const item of itemsOf(manifest, "search.result")) {
    const url = item.flags.url;
    if (typeof url === "string" && item.sourceId) {
      urlBySource.set(item.sourceId, url);
    }
  }
  const keywordName = new Map(manifest.keywords.map((k) => [k.id, k.keyword]));
  const tagName = new Map(manifest.tags.map((t) => [t.id, t.name]));
  return {
    urlForSource: (id) => (id ? urlBySource.get(id) ?? null : null),
    keywordName: (id) => (id ? keywordName.get(id) ?? null : null),
    tagName: (id) => (id ? tagName.get(id) ?? null : null),
  };
}

/** Guard used by the resolver: a kind must be derived OR fetchable. */
export function isDerived(def: ResourceKindDef): boolean {
  return typeof def.derive === "function";
}
