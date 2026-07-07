/**
 * resource_collection kind → ResourceCollectionBlock bridge.
 *
 * The successor to the `<resources>` XML markdown grammar
 * (components/mardown-display/blocks/resources/parseResourcesMarkdown.ts).
 * The kind's authored shape is:
 *
 *   { __kind:"resource_collection", title, description?, categories: [
 *       { __kind:"resource_category", id?, name, description?, resources: [
 *           { __kind:"resource_item", id?, title, url, description?, type?,
 *             duration?, difficulty?, rating?, tags?, isFavorite?,
 *             isCompleted? } ] } ] }
 *
 * The bridge derives the exact `ResourceCollectionData` object
 * ResourceCollectionBlock already consumes ({ title, description?,
 * categories: [{ id, name, description?, resources: [...] }] }) — the
 * unified renderer (features/canvas/artifact-types/renderers/
 * ResourcesArtifact.tsx) prefers `serverData` over the raw-markdown parse,
 * so the component needs zero changes.
 *
 * Mapping notes (mirrors the component's own tolerances):
 * - `id` is presentation identity (React keys + favorite/completed toggles).
 *   The legacy parser synthesizes `category-N` / `resource-N`; the bridge
 *   does the same when an id is absent, so agents never have to emit ids.
 * - `description` on an item falls back to its title — the exact fallback
 *   parseResourcesMarkdown applies (the component renders it unconditionally).
 * - `type` passes through as-is when it is a non-empty string (the component
 *   maps unknown types to the generic Globe icon itself); absent/non-string
 *   becomes "other". The schema's enum teaches the recognized vocabulary;
 *   the bridge never drops data over it.
 * - Items without a `title` or `url` cannot render a card and are skipped;
 *   categories left with no items are dropped (parseResourcesMarkdown never
 *   emits either).
 * - Zero data loss: unmapped keys on the set / category / item ride along
 *   untouched.
 */

import type { KindSchema } from "../core/kind-schema.types";
import type { KindDefinition } from "../registry/kind-registry.types";
import { makeCompleteEnvelopeBridge, isRecord } from "./legacy-bridge-utils";
import {
  additionalDetailsSection,
  collectExtras,
  extrasList,
  isRecordValue,
  joinBlocks,
} from "./kind-markdown-utils";

export const RESOURCE_TYPE_VALUES = [
  "documentation",
  "tool",
  "video",
  "article",
  "course",
  "book",
  "tutorial",
  "other",
] as const;

export const RESOURCE_DIFFICULTY_VALUES = [
  "beginner",
  "intermediate",
  "advanced",
] as const;

// ---------------------------------------------------------------------------
// Schemas — the single source both the compiled definitions below and the
// migration emit script consume (data[]/edges/emitted schemas all derive from
// these via the REAL converters: kindSchemaToStorage + kindSchemaToJsonSchema).
// Field inventory enumerated from ResourceCollectionBlock.tsx +
// parseResourcesMarkdown.ts — every field the component renders or reads.
// ---------------------------------------------------------------------------

export const RESOURCE_ITEM_SCHEMA: KindSchema = {
  kind: "resource_item",
  fields: {
    id: { type: "string" },
    title: { type: "string", required: true },
    url: { type: "string", required: true },
    description: { type: "string" },
    type: { type: "enum", values: [...RESOURCE_TYPE_VALUES] },
    duration: { type: "string" },
    difficulty: { type: "enum", values: [...RESOURCE_DIFFICULTY_VALUES] },
    rating: { type: "number" },
    tags: { type: "string[]" },
    isFavorite: { type: "boolean" },
    isCompleted: { type: "boolean" },
  },
};

export const RESOURCE_CATEGORY_SCHEMA: KindSchema = {
  kind: "resource_category",
  fields: {
    id: { type: "string" },
    name: { type: "string", required: true },
    description: { type: "string" },
    resources: { type: "array", itemKinds: ["resource_item"], required: true },
  },
};

export const RESOURCE_COLLECTION_SCHEMA: KindSchema = {
  kind: "resource_collection",
  fields: {
    title: { type: "string", required: true },
    description: { type: "string" },
    categories: {
      type: "array",
      itemKinds: ["resource_category"],
      required: true,
    },
  },
};

export const RESOURCE_COLLECTION_KIND_SCHEMAS: Record<string, KindSchema> = {
  resource_collection: RESOURCE_COLLECTION_SCHEMA,
  resource_category: RESOURCE_CATEGORY_SCHEMA,
  resource_item: RESOURCE_ITEM_SCHEMA,
};

// ---------------------------------------------------------------------------
// Legacy bridge — kind envelope → ResourceCollectionBlock serverData.
// ---------------------------------------------------------------------------

/** Keys mapped (possibly reshaped) explicitly — everything else rides along. */
const MAPPED_ITEM_KEYS = new Set(["id", "title", "url", "description", "type"]);
const MAPPED_CATEGORY_KEYS = new Set(["id", "name", "resources"]);
const MAPPED_SET_KEYS = new Set(["title", "categories"]);

function mapItem(
  item: Record<string, unknown>,
  fallbackId: string,
): Record<string, unknown> | null {
  const title = typeof item.title === "string" ? item.title : "";
  const url = typeof item.url === "string" ? item.url : "";
  if (!title || !url) return null;

  const mapped: Record<string, unknown> = {
    id:
      typeof item.id === "string" && item.id !== ""
        ? item.id
        : fallbackId,
    title,
    url,
    description:
      typeof item.description === "string" && item.description !== ""
        ? item.description
        : title,
    type:
      typeof item.type === "string" && item.type !== "" ? item.type : "other",
  };

  // Zero data loss: duration / difficulty / rating / tags /
  // isFavorite / isCompleted and any schema-unknown extras pass through
  // untouched (the component tolerates arbitrary strings natively).
  for (const [key, value] of Object.entries(item)) {
    if (MAPPED_ITEM_KEYS.has(key) || key in mapped) continue;
    mapped[key] = value;
  }

  return mapped;
}

function mapCategory(
  category: Record<string, unknown>,
  index: number,
  itemCounter: { count: number },
): Record<string, unknown> | null {
  const name = typeof category.name === "string" ? category.name : "";
  if (!name || !Array.isArray(category.resources)) return null;

  const resources: Record<string, unknown>[] = [];
  for (const item of category.resources) {
    if (!isRecord(item)) continue;
    const mapped = mapItem(item, `resource-${itemCounter.count + 1}`);
    if (mapped) {
      resources.push(mapped);
      itemCounter.count += 1;
    }
  }
  if (resources.length === 0) return null;

  const mapped: Record<string, unknown> = {
    id:
      typeof category.id === "string" && category.id !== ""
        ? category.id
        : `category-${index + 1}`,
    name,
    resources,
  };

  for (const [key, value] of Object.entries(category)) {
    if (MAPPED_CATEGORY_KEYS.has(key) || key in mapped) continue;
    mapped[key] = value;
  }

  return mapped;
}

export const resourcesServerDataFromEnvelope = makeCompleteEnvelopeBridge(
  "resource_collection",
  (value) => {
    const title = typeof value.title === "string" ? value.title : "";
    if (!title || !Array.isArray(value.categories)) return undefined;

    const itemCounter = { count: 0 };
    const categories: Record<string, unknown>[] = [];
    for (const category of value.categories) {
      if (!isRecord(category)) continue;
      const mapped = mapCategory(category, categories.length, itemCounter);
      if (mapped) categories.push(mapped);
    }
    if (categories.length === 0) return undefined;

    const serverData: Record<string, unknown> = { title, categories };
    for (const [key, extra] of Object.entries(value)) {
      if (MAPPED_SET_KEYS.has(key) || key in serverData) continue;
      serverData[key] = extra;
    }

    return serverData;
  },
);

// ---------------------------------------------------------------------------
// toMarkdown facet — resource_collection → human-readable markdown.
//
// Deliberately mirrors the legacy `<resources>` inner grammar (### title,
// plain description line, **Category** headers, `- [Title](url) - description
// (duration) [type] {difficulty} *rating* #tags` bullets) — the one markdown
// shape parseResourcesMarkdown already reads, so the export is both
// human-readable AND round-trips through the existing parser. Display-only
// additions the grammar doesn't carry (category descriptions, saved/completed
// flags, unknown keys) render as nested bullets / an "Additional details"
// section so nothing silently vanishes. Synthetic `id`s are presentation
// identity, regenerated on every parse — intentionally not rendered.
// ---------------------------------------------------------------------------

const MD_ITEM_KNOWN_KEYS = [
  "id",
  "title",
  "url",
  "description",
  "type",
  "duration",
  "difficulty",
  "rating",
  "tags",
  "isFavorite",
  "isCompleted",
];

const MD_CATEGORY_KNOWN_KEYS = ["id", "name", "description", "resources"];

const MD_SET_KNOWN_KEYS = ["title", "description", "categories"];

function itemLine(item: Record<string, unknown>): string {
  const title = typeof item.title === "string" ? item.title : "";
  const url = typeof item.url === "string" ? item.url : "";
  const parts: string[] = [`- [${title}](${url})`];

  if (
    typeof item.description === "string" &&
    item.description !== "" &&
    item.description !== title
  ) {
    parts.push(`- ${item.description}`);
  }
  if (typeof item.duration === "string" && item.duration !== "") {
    parts.push(`(${item.duration})`);
  }
  if (typeof item.type === "string" && item.type !== "") {
    parts.push(`[${item.type}]`);
  }
  if (typeof item.difficulty === "string" && item.difficulty !== "") {
    parts.push(`{${item.difficulty}}`);
  }
  if (typeof item.rating === "number" && Number.isFinite(item.rating)) {
    parts.push(`*${item.rating}*`);
  }
  if (Array.isArray(item.tags)) {
    for (const tag of item.tags) {
      if (typeof tag === "string" && tag !== "") parts.push(`#${tag}`);
    }
  }

  const line = parts.join(" ");

  const flags: Record<string, unknown> = {};
  if (item.isFavorite === true) flags.saved = true;
  if (item.isCompleted === true) flags.completed = true;
  const meta = extrasList({
    ...flags,
    ...collectExtras(item, MD_ITEM_KNOWN_KEYS),
  });
  // Nested bullets stay inside the parent list item (no blank lines).
  if (meta) return `${line}\n${meta.replace(/^- /gm, "  - ")}`;
  return line;
}

function categoryMarkdown(category: Record<string, unknown>): string {
  const name = typeof category.name === "string" ? category.name : "";
  const blocks: Array<string | null> = [`**${name}**`];

  if (
    typeof category.description === "string" &&
    category.description !== ""
  ) {
    blocks.push(`*${category.description}*`);
  }

  const extras = extrasList(collectExtras(category, MD_CATEGORY_KNOWN_KEYS));
  if (extras) blocks.push(extras);

  const items = Array.isArray(category.resources)
    ? category.resources.filter(isRecordValue).map(itemLine)
    : [];
  if (items.length > 0) blocks.push(items.join("\n"));

  return joinBlocks(blocks);
}

export function resourcesMarkdownFromValue(
  value: Record<string, unknown>,
): string {
  const title =
    typeof value.title === "string" && value.title !== ""
      ? value.title
      : "Resource Collection";

  const categories = Array.isArray(value.categories)
    ? value.categories.filter(isRecordValue)
    : [];

  return joinBlocks([
    `### ${title}`,
    typeof value.description === "string" && value.description !== ""
      ? value.description
      : null,
    ...categories.map(categoryMarkdown),
    additionalDetailsSection(collectExtras(value, MD_SET_KNOWN_KEYS)),
  ]);
}

// ---------------------------------------------------------------------------
// Compiled definitions — the registration payload for system-kinds.ts.
// NOT registered here (integration wires these in); exported so the
// registration edit is a two-line import + spread when the kind activates.
// ---------------------------------------------------------------------------

export const RESOURCE_COLLECTION_KIND_DEFINITIONS: KindDefinition[] = [
  {
    kind: "resource_collection",
    schemaSource: "system",
    tier: "eager",
    legacyBlockType: "resources",
    toLegacyServerData: resourcesServerDataFromEnvelope,
    toMarkdown: resourcesMarkdownFromValue,
    artifact: { canvasType: "resources" },
    persistence: { persistStructured: true },
    schema: RESOURCE_COLLECTION_SCHEMA,
  },
  {
    kind: "resource_category",
    schemaSource: "system",
    tier: "eager",
    schema: RESOURCE_CATEGORY_SCHEMA,
  },
  {
    kind: "resource_item",
    schemaSource: "system",
    tier: "eager",
    schema: RESOURCE_ITEM_SCHEMA,
  },
];
