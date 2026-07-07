/**
 * structured_info kind — the canonical Shape behind the ```structured_info
 * fence (legacy component: StructuredPlanBlock →
 * components/mardown-display/blocks/plan/StructuredPlanBlock.tsx, routed by
 * BlockRenderer case "structured_info").
 *
 * Field inventory (what the legacy renderable actually is): the fence body is
 * MARKDOWN with an implied grammar the component's stat parser counts —
 * StructuredPlanViewer.tsx derives sectionCount from `**bold**` runs,
 * bulletPoints from `^\s*\*` lines, and wordCount from everything; the body
 * renders through BasicMarkdownContent inside a collapsible "Structured
 * Information" card (AlignLeft icon) with a Copy All button. The canonical
 * kind names that implied structure explicitly:
 *
 *   structured_info          — title (the leading bold line) + optional
 *                              description (intro paragraph) + sections[]
 *   structured_info_section  — heading (a bold run) + optional body
 *                              paragraph + items[] (the bullets)
 *   structured_info_item     — text, with an optional label for the
 *                              key-value bullet convention ("Backend: Priya")
 *
 * Bridge: the legacy component consumes a raw markdown `content` string (NOT
 * a structured serverData object — BlockRenderer passes `block.content`), so
 * `toLegacyServerData` emits `{ content }` where `content` is the value
 * projected back into the component's NATIVE grammar (bold headings, `* `
 * bullets) — the same projection the `toMarkdown` facet uses, so the stat
 * bar counts the same sections/bullets a hand-authored fence would produce.
 *
 * NOT registered here — registration (system-kinds.ts / surface-registry)
 * lands in the central integration pass.
 */

import type { CanonicalBlockIR } from "../core/ir-types";
import type { KindSchema } from "../core/kind-schema.types";
import type { KindDefinition } from "../registry/kind-registry.types";
import { makeCompleteEnvelopeBridge } from "./legacy-bridge-utils";
import {
  collectExtras,
  extrasList,
  formatInlineValue,
  isRecordValue,
  joinBlocks,
} from "./kind-markdown-utils";

/** The BlockComponentRegistry type string the legacy renderer routes on. */
export const STRUCTURED_INFO_LEGACY_BLOCK_TYPE = "structured_info";

/** The component's fixed header label — the family default title. */
export const STRUCTURED_INFO_DEFAULT_TITLE = "Structured Information";

// ---------------------------------------------------------------------------
// Schemas (authored order is authoritative — the migration's data[] and
// emitted_json_schema are converter-emitted FROM these exact objects).
// ---------------------------------------------------------------------------

export const STRUCTURED_INFO_ITEM_SCHEMA: KindSchema = {
  kind: "structured_info_item",
  fields: {
    // The key half of a key-value bullet ("Backend: Priya" → label "Backend").
    label: { type: "string" },
    // The bullet text (or the value half when a label is present).
    text: { type: "string", required: true },
  },
};

export const STRUCTURED_INFO_SECTION_SCHEMA: KindSchema = {
  kind: "structured_info_section",
  fields: {
    // The bold section title the stat bar counts as one "section".
    heading: { type: "string", required: true },
    // Optional paragraph markdown under the heading, before the bullets.
    body: { type: "string" },
    items: { type: "array", itemKinds: ["structured_info_item"] },
  },
};

export const STRUCTURED_INFO_SCHEMA: KindSchema = {
  kind: "structured_info",
  fields: {
    // The document heading — the leading bold line of the legacy fence.
    title: { type: "string", required: true },
    // Optional intro paragraph between the title and the first section.
    description: { type: "string" },
    sections: {
      type: "array",
      itemKinds: ["structured_info_section"],
      required: true,
    },
  },
};

// ---------------------------------------------------------------------------
// Markdown projection — the ONE renderer for both facets.
//
// Emits the component's NATIVE grammar (mirrors the stat parser in
// StructuredPlanViewer.tsx): section headings as whole-line `**bold**` runs
// (its section counter) and items as `* ` bullets (its `^\s*\*` bullet
// counter). Unknown keys never silently vanish — root extras get their own
// bold "Additional details" section; section/item extras ride inline lists.
// ---------------------------------------------------------------------------

const ITEM_KNOWN_KEYS = ["label", "text"];
const SECTION_KNOWN_KEYS = ["heading", "body", "items"];
const ROOT_KNOWN_KEYS = ["title", "description", "sections"];

function itemLine(item: Record<string, unknown>): string {
  const label = typeof item.label === "string" ? item.label.trim() : "";
  const text = typeof item.text === "string" ? item.text.trim() : "";
  let line = label !== "" ? `* **${label}:** ${text}` : `* ${text}`;

  const extras = Object.entries(collectExtras(item, ITEM_KNOWN_KEYS));
  if (extras.length > 0) {
    const inline = extras
      .map(([key, value]) => `${key}: ${formatInlineValue(value)}`)
      .join("; ");
    line += ` (${inline})`;
  }
  return line;
}

function sectionMarkdown(section: Record<string, unknown>): string {
  const heading =
    typeof section.heading === "string" && section.heading.trim() !== ""
      ? section.heading.trim()
      : "Section";
  const blocks: Array<string | null> = [`**${heading}**`];

  if (typeof section.body === "string" && section.body.trim() !== "") {
    blocks.push(section.body.trim());
  }

  const lines: string[] = [];
  if (Array.isArray(section.items)) {
    for (const item of section.items) {
      if (isRecordValue(item)) lines.push(itemLine(item));
    }
  }
  // Section-level unknown keys ride the same bullet list — nothing vanishes.
  const sectionExtras = extrasList(collectExtras(section, SECTION_KNOWN_KEYS));
  if (sectionExtras) lines.push(sectionExtras);
  if (lines.length > 0) blocks.push(lines.join("\n"));

  return joinBlocks(blocks);
}

export function structuredInfoMarkdownFromValue(
  value: Record<string, unknown>,
): string {
  const title =
    typeof value.title === "string" && value.title.trim() !== ""
      ? value.title.trim()
      : STRUCTURED_INFO_DEFAULT_TITLE;

  const sections = Array.isArray(value.sections)
    ? value.sections.filter(isRecordValue)
    : [];

  const rootExtras = extrasList(collectExtras(value, ROOT_KNOWN_KEYS));

  return joinBlocks([
    `**${title}**`,
    typeof value.description === "string" && value.description.trim() !== ""
      ? value.description.trim()
      : null,
    ...sections.map(sectionMarkdown),
    rootExtras ? `**Additional details**\n\n${rootExtras}` : null,
  ]);
}

// ---------------------------------------------------------------------------
// Legacy bridge — envelope → { content } for StructuredPlanBlock.
//
// The component renders a raw markdown string; there is no structured
// serverData contract to fill. `{ content }` is the handoff the integration
// pass feeds it (either as the routed block's content or via serverData) —
// and the dual gate's render leg verifies the projection is real and
// non-empty. Complete-only (family precedent: the card is a "renders when
// complete" summary; the fence path streams text natively without a bridge).
// ---------------------------------------------------------------------------

export const structuredInfoServerDataFromEnvelope: (
  envelope: CanonicalBlockIR,
) => Record<string, unknown> | undefined = makeCompleteEnvelopeBridge(
  "structured_info",
  (value) => {
    const content = structuredInfoMarkdownFromValue(value);
    if (content === "") return undefined; // empty projection — decline loudly
    return { content };
  },
);

// ---------------------------------------------------------------------------
// KindDefinitions — consumed by the central integration pass (this file adds
// NO registrations itself). Shapes mirror the content_ir.kind_definition rows
// seeded by migrations/kind_structured_info_full.sql.
// ---------------------------------------------------------------------------

export const STRUCTURED_INFO_KIND_DEFINITIONS: KindDefinition[] = [
  {
    kind: "structured_info",
    schemaSource: "system",
    tier: "eager",
    legacyBlockType: STRUCTURED_INFO_LEGACY_BLOCK_TYPE,
    toLegacyServerData: structuredInfoServerDataFromEnvelope,
    toMarkdown: structuredInfoMarkdownFromValue,
    artifact: { canvasType: "structured_info" },
    persistence: { persistStructured: true },
    schema: STRUCTURED_INFO_SCHEMA,
  },
  {
    kind: "structured_info_section",
    schemaSource: "system",
    tier: "eager",
    schema: STRUCTURED_INFO_SECTION_SCHEMA,
  },
  {
    kind: "structured_info_item",
    schemaSource: "system",
    tier: "eager",
    schema: STRUCTURED_INFO_ITEM_SCHEMA,
  },
];
