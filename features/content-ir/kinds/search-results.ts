/**
 * The search kind family — `web_search_results` + its item kinds + the
 * system-wide primitives it nests (Search Kinds Pilot, Stage B).
 *
 * PYTHON-OWNED: the registry rows are seeded from the pydantic models in
 * `aidream/aidream/services/search_kinds/models.py` (the source of truth,
 * approved by Arman 2026-08-20). The `KindSchema`s below are the FE parser's
 * mirrors of those models; the generated TS types live in
 * `kinds/generated/*.gen.ts` (`pnpm shape:types` — registry→TS codegen).
 * A model change re-seeds the registry (aidream
 * `scripts/seed_search_kind_family.py`) AND regenerates the types AND updates
 * these mirrors in the same change.
 *
 * THE MERGE + TRANSLATION LAW binds this family: provider-named kinds are
 * banned — `source` carries provenance ('brave' | 'google' | …); adding a
 * provider is an aidream adapter, never a new kind or component.
 *
 * NOTE (pre-cutover): the `web_search_results` COLLECTION row in the registry
 * still holds the old Brave-passthrough schema until aidream's
 * `seed_search_kind_family.py --cutover` runs (live nodes verify output_kind
 * against the registry schema every run, so the schema supersede must ride
 * the node repoint). The compiled schema below is the NEW shape — it is what
 * the demo endpoint emits today and what the registry row becomes at cutover.
 *
 * Bridges are STREAMING and uniform: serverData is `{ value, isComplete }` —
 * the envelope's live value object, verbatim. Components own all reading
 * defensively (a half-arrived item is a NORMAL state), and the same
 * components render nested instances handed to them directly by the
 * collection component (see
 * `components/mardown-display/blocks/search-kinds/`).
 */

import type { CanonicalBlockIR } from "@ai-matrx/content-ir";
import type { KindSchema } from "@ai-matrx/content-ir";
import type { KindDefinition } from "@ai-matrx/content-ir";

// ---------------------------------------------------------------------------
// Primitives (system-wide small kinds held by bigger kinds)
// ---------------------------------------------------------------------------

export const ratingKindSchema: KindSchema = {
  kind: "rating",
  fields: {
    value: {
      type: "number",
      required: true,
      description: "The rating value on the scale [0, best_possible].",
    },
    best_possible: { type: "number", description: "Top of the rating scale." },
    count: {
      type: "number",
      nullable: true,
      description: "Number of ratings/reviews behind the value.",
    },
  },
};

export const openingHoursKindSchema: KindSchema = {
  kind: "opening_hours",
  fields: {
    // DayHours is a plain sub-structure (no independent identity → no kind):
    // [{ day, opens, closes }] with 24h "HH:MM" times.
    days: { type: "json[]", description: "Full weekly schedule when known." },
    today: {
      type: "inline_object",
      nullable: true,
      fields: {
        day: { type: "string", required: true },
        opens: { type: "string", required: true },
        closes: { type: "string", required: true },
      },
    },
  },
};

export const postalAddressKindSchema: KindSchema = {
  kind: "postal_address",
  fields: {
    display: {
      type: "string",
      required: true,
      description: "The full display address string.",
    },
    street: { type: "string", nullable: true },
    city: { type: "string", nullable: true },
    region: { type: "string", nullable: true },
    postal_code: { type: "string", nullable: true },
    country: { type: "string", nullable: true },
  },
};

export const geoCoordinatesKindSchema: KindSchema = {
  kind: "geo_coordinates",
  fields: {
    latitude: { type: "number", required: true },
    longitude: { type: "number", required: true },
  },
};

// ---------------------------------------------------------------------------
// Item kinds — each individually portable and self-identifying
// ---------------------------------------------------------------------------

export const webResultKindSchema: KindSchema = {
  kind: "web_result",
  fields: {
    source: {
      type: "string",
      required: true,
      description: "Provider that returned this result, e.g. 'brave' | 'google'.",
    },
    position: { type: "number", required: true, description: "1-based rank." },
    title: { type: "string", required: true },
    url: { type: "string", required: true },
    site_name: { type: "string", required: true },
    displayed_url: { type: "string", required: true },
    snippet: { type: "string", nullable: true },
    extra_snippets: { type: "string[]" },
    highlighted_terms: { type: "string[]" },
    favicon: { type: "string", nullable: true },
    thumbnail: { type: "string", nullable: true },
    published_at: { type: "string", nullable: true },
    age_text: { type: "string", nullable: true },
    author: { type: "string", nullable: true },
    publisher: { type: "string", nullable: true },
    // SiteLink is a plain sub-structure: [{ title, url }].
    sitelinks: { type: "json[]" },
    source_description: { type: "string", nullable: true },
    rating: { type: "object", kind: "rating", nullable: true },
    language: { type: "string", nullable: true },
    family_friendly: { type: "boolean", nullable: true },
    is_live: { type: "boolean", nullable: true },
  },
};

export const newsResultKindSchema: KindSchema = {
  kind: "news_result",
  fields: {
    source: { type: "string", required: true },
    position: { type: "number", required: true },
    title: { type: "string", required: true },
    url: { type: "string", required: true },
    site_name: { type: "string", required: true },
    source_logo: { type: "string", nullable: true },
    snippet: { type: "string", nullable: true },
    extra_snippets: { type: "string[]" },
    thumbnail: { type: "string", nullable: true },
    published_at: { type: "string", nullable: true },
    age_text: { type: "string", nullable: true },
    author: { type: "string", nullable: true },
    is_breaking: { type: "boolean", nullable: true },
    tags: { type: "string[]" },
  },
};

export const videoResultKindSchema: KindSchema = {
  kind: "video_result",
  fields: {
    source: { type: "string", required: true },
    position: { type: "number", required: true },
    title: { type: "string", required: true },
    url: { type: "string", required: true },
    thumbnail: { type: "string", nullable: true },
    duration_seconds: { type: "number", nullable: true },
    channel: { type: "string", nullable: true },
    platform: { type: "string", nullable: true },
    snippet: { type: "string", nullable: true },
    preview_clip_url: { type: "string", nullable: true },
    favicon: { type: "string", nullable: true },
    published_at: { type: "string", nullable: true },
    age_text: { type: "string", nullable: true },
    tags: { type: "string[]" },
  },
};

export const discussionResultKindSchema: KindSchema = {
  kind: "discussion_result",
  fields: {
    source: { type: "string", required: true },
    position: { type: "number", required: true },
    title: { type: "string", required: true },
    url: { type: "string", required: true },
    forum_name: { type: "string", nullable: true },
    snippet: { type: "string", nullable: true },
    question_text: { type: "string", nullable: true },
    top_answer: { type: "string", nullable: true },
    answer_count: { type: "number", nullable: true },
    score: { type: "string", nullable: true },
    favicon: { type: "string", nullable: true },
    published_at: { type: "string", nullable: true },
    age_text: { type: "string", nullable: true },
  },
};

export const localPlaceKindSchema: KindSchema = {
  kind: "local_place",
  fields: {
    source: { type: "string", required: true },
    position: { type: "number", required: true },
    name: { type: "string", required: true },
    address: { type: "object", kind: "postal_address", nullable: true },
    coordinates: { type: "object", kind: "geo_coordinates", nullable: true },
    phone: { type: "string", nullable: true },
    rating: { type: "object", kind: "rating", nullable: true },
    price_text: {
      type: "string",
      nullable: true,
      description: "Verbatim provider price convention ('$$', '$1-10').",
    },
    categories: { type: "string[]" },
    cuisine: { type: "string[]" },
    hours: { type: "object", kind: "opening_hours", nullable: true },
    hours_text: { type: "string", nullable: true },
    thumbnail: { type: "string", nullable: true },
    description: { type: "string", nullable: true },
    place_id: { type: "string", nullable: true },
    website_url: { type: "string", nullable: true },
    timezone: { type: "string", nullable: true },
  },
};

export const entityCardKindSchema: KindSchema = {
  kind: "entity_card",
  fields: {
    source: { type: "string", required: true },
    name: { type: "string", required: true },
    category: { type: "string", nullable: true },
    description: { type: "string", nullable: true },
    long_description: { type: "string", nullable: true },
    image: { type: "string", nullable: true },
    website_url: { type: "string", nullable: true },
    source_url: { type: "string", nullable: true },
    // Fact is a plain sub-structure: [{ label, text, links[] }].
    facts: { type: "json[]" },
    // ProfileLink is a plain sub-structure: [{ name, url, favicon }].
    profiles: { type: "json[]" },
    rating: { type: "object", kind: "rating", nullable: true },
    coordinates: { type: "object", kind: "geo_coordinates", nullable: true },
  },
};

export const aiAnswerKindSchema: KindSchema = {
  kind: "ai_answer",
  fields: {
    source: { type: "string", required: true },
    // AiAnswerBlock is a plain sub-structure:
    // [{ type: "paragraph"|"heading"|"list", text, items[] }].
    blocks: { type: "json[]", required: true },
    // AiAnswerReference: [{ url, source_name, index }].
    references: { type: "json[]" },
  },
};

// ---------------------------------------------------------------------------
// The collection kind
// ---------------------------------------------------------------------------

export const webSearchResultsKindSchema: KindSchema = {
  kind: "web_search_results",
  fields: {
    source: {
      type: "string",
      required: true,
      description: "Provider that served this response, e.g. 'brave' | 'google'.",
    },
    query: { type: "string", required: true },
    altered_query: {
      type: "string",
      nullable: true,
      description: "Set when the provider rewrote/spell-fixed the query.",
    },
    total_results: { type: "number", nullable: true },
    more_available: { type: "boolean" },
    is_navigational: { type: "boolean", nullable: true },
    is_news_breaking: { type: "boolean", nullable: true },
    inferred_location: { type: "object", kind: "postal_address", nullable: true },
    results: { type: "array", itemKinds: ["web_result"] },
    news: { type: "array", itemKinds: ["news_result"] },
    videos: { type: "array", itemKinds: ["video_result"] },
    faqs: { type: "array", itemKinds: ["faq_item"] },
    discussions: { type: "array", itemKinds: ["discussion_result"] },
    places: { type: "array", itemKinds: ["local_place"] },
    entity: { type: "object", kind: "entity_card", nullable: true },
    ai_answer: { type: "object", kind: "ai_answer", nullable: true },
    related_searches: { type: "string[]" },
  },
};

// ---------------------------------------------------------------------------
// serverData bridge — uniform STREAMING wrapper for the whole family.
// ---------------------------------------------------------------------------

export interface SearchKindServerData {
  /** The envelope's live value object, verbatim (partial mid-stream). */
  value: Record<string, unknown>;
  isComplete: boolean;
}

export function makeSearchKindBridge(kind: string) {
  return (
    envelope: CanonicalBlockIR,
  ): (SearchKindServerData & Record<string, unknown>) | undefined => {
    if (envelope.root.kind !== kind) return undefined;
    return {
      value: envelope.root.value,
      isComplete: envelope.root.status === "complete",
    };
  };
}

// ---------------------------------------------------------------------------
// toMarkdown facet — collection only (items read best in their section).
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function resultLine(item: Record<string, unknown>): string | null {
  const title = text(item.title) ?? text(item.name);
  const url = text(item.url) ?? text(item.website_url);
  if (!title) return null;
  const head = url ? `[${title}](${url})` : `**${title}**`;
  const snippet = text(item.snippet) ?? text(item.description);
  return snippet ? `- ${head} — ${snippet}` : `- ${head}`;
}

function sectionList(heading: string, items: unknown): string | null {
  if (!Array.isArray(items)) return null;
  const lines = items.filter(isRecord).map(resultLine).filter(Boolean);
  if (lines.length === 0) return null;
  return `## ${heading}\n\n${lines.join("\n")}`;
}

export function webSearchResultsMarkdownFromValue(
  value: Record<string, unknown>,
): string {
  const parts: Array<string | null> = [
    `# Search: ${text(value.query) ?? ""}`.trim(),
  ];
  const source = text(value.source);
  if (source) parts.push(`*Provider: ${source}*`);

  const answer = value.ai_answer;
  if (isRecord(answer) && Array.isArray(answer.blocks)) {
    const blocks = answer.blocks
      .filter(isRecord)
      .map((b) => {
        if (b.type === "heading") return text(b.text) ? `### ${b.text}` : null;
        if (b.type === "list" && Array.isArray(b.items)) {
          return b.items.map((i) => `- ${String(i)}`).join("\n");
        }
        return text(b.text);
      })
      .filter(Boolean);
    if (blocks.length > 0) parts.push(`## AI answer\n\n${blocks.join("\n\n")}`);
  }

  parts.push(sectionList("Results", value.results));
  parts.push(sectionList("News", value.news));
  parts.push(sectionList("Videos", value.videos));
  parts.push(sectionList("Discussions", value.discussions));
  parts.push(sectionList("Places", value.places));

  const faqs = Array.isArray(value.faqs) ? value.faqs.filter(isRecord) : [];
  if (faqs.length > 0) {
    parts.push(
      `## People also ask\n\n${faqs
        .map((f) => {
          const q = text(f.question);
          if (!q) return null;
          const a = text(f.answer);
          return a ? `**${q}**\n\n${a}` : `**${q}**`;
        })
        .filter(Boolean)
        .join("\n\n")}`,
    );
  }

  const related = Array.isArray(value.related_searches)
    ? value.related_searches.filter((r): r is string => typeof r === "string")
    : [];
  if (related.length > 0) {
    parts.push(`## Related searches\n\n${related.map((r) => `- ${r}`).join("\n")}`);
  }

  return parts.filter(Boolean).join("\n\n");
}

// ---------------------------------------------------------------------------
// Compiled definitions — registered centrally in system-kinds.ts.
// `faq_item` is NOT here: its compiled definition lives in seo-package.ts
// (the pre-existing owner this family merged with), extended with the
// merged-optional search fields.
// ---------------------------------------------------------------------------

const ITEM_SCHEMAS: KindSchema[] = [
  webResultKindSchema,
  newsResultKindSchema,
  videoResultKindSchema,
  discussionResultKindSchema,
  localPlaceKindSchema,
  entityCardKindSchema,
  aiAnswerKindSchema,
  ratingKindSchema,
  openingHoursKindSchema,
  postalAddressKindSchema,
  geoCoordinatesKindSchema,
];

export const SEARCH_RESULTS_KIND_DEFINITIONS: KindDefinition[] = [
  {
    kind: "web_search_results",
    schemaSource: "system",
    tier: "eager",
    legacyBlockType: "web_search_results",
    toLegacyServerData: makeSearchKindBridge("web_search_results"),
    toMarkdown: webSearchResultsMarkdownFromValue,
    persistence: { persistStructured: true },
    loadingComponent: "list",
    schema: webSearchResultsKindSchema,
  },
  ...ITEM_SCHEMAS.map(
    (schema): KindDefinition => ({
      kind: schema.kind,
      schemaSource: "system",
      tier: "eager",
      legacyBlockType: schema.kind,
      toLegacyServerData: makeSearchKindBridge(schema.kind),
      persistence: { persistStructured: true },
      schema,
    }),
  ),
];
