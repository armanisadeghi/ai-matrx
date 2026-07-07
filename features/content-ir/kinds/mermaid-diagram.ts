/**
 * mermaid_diagram kind → MermaidBlock bridge.
 *
 * The simplest kind in the registry: the content IS a Mermaid DSL string,
 * not structured JSON. The canonical shape is FLAT:
 *
 *   { __kind: "mermaid_diagram", code: "<mermaid source>", title? }
 *
 * `code` is the raw, verbatim mermaid source (frontmatter included when the
 * author wrote one). MermaidBlock consumes `serverData` in the
 * `MermaidBlockData` shape (`source` + optional `title`) and derives
 * everything else itself — diagram type detection, frontmatter title
 * extraction, theme/look/layout resolution (user preferences → per-artifact
 * metadata → session tweaks). Render options are deliberately NOT part of
 * this kind: they are presentation preferences carried on the metadata
 * channel, never authored content.
 *
 * Authors who want a STRUCTURED node/edge diagram (positions, typed nodes,
 * pedigree fields) should use the `diagram_spec` kind instead — this kind is
 * strictly for raw Mermaid source.
 */

import type { MermaidBlockData } from "@/types/python-generated/stream-events";
import type { KindSchema } from "../core/kind-schema.types";
import type { KindDefinition } from "../registry/kind-registry.types";
import { makeCompleteEnvelopeBridge } from "./legacy-bridge-utils";
import {
  additionalDetailsSection,
  collectExtras,
  joinBlocks,
} from "./kind-markdown-utils";

/**
 * The authored field map — the single source the storage rows
 * (`kind_definition.data`) and the converter-emitted JSON Schemas
 * (`emitted_json_schema` / `emitted_block_schema`) are generated from.
 * See migrations/kind_mermaid_diagram_full.sql.
 */
export const MERMAID_DIAGRAM_KIND_SCHEMA: KindSchema = {
  kind: "mermaid_diagram",
  fields: {
    code: { type: "string", required: true },
    title: { type: "string" },
  },
};

/**
 * Complete-envelope bridge: kind value → the exact `serverData`
 * MermaidBlock already consumes (`source` = the DSL string; `title` only
 * when non-empty — the component falls back to frontmatter extraction and
 * the catalog label on its own). Mid-stream the fence renders through the
 * block's OWN progressive path (it owns all streaming phases internally),
 * so deriving serverData before COMPLETE would be pure waste.
 */
export const mermaidServerDataFromEnvelope = makeCompleteEnvelopeBridge(
  "mermaid_diagram",
  (value) => {
    if (typeof value.code !== "string" || value.code.trim() === "") {
      return undefined;
    }
    const serverData: MermaidBlockData & Record<string, unknown> = {
      source: value.code,
    };
    if (typeof value.title === "string" && value.title !== "") {
      serverData.title = value.title;
    }
    return serverData;
  },
);

// ---------------------------------------------------------------------------
// toMarkdown facet — mermaid_diagram → heading + ```mermaid fence.
//
// Mermaid source is an inherently-code payload (the sanctioned exception in
// the toMarkdown contract), so the body is a fenced ```mermaid block —
// which every markdown surface in the app renders as a live diagram anyway.
// Unknown extra keys land under "Additional details"; nothing vanishes.
// ---------------------------------------------------------------------------

const MD_KNOWN_KEYS = ["code", "title"];

export function mermaidMarkdownFromValue(
  value: Record<string, unknown>,
): string {
  const title =
    typeof value.title === "string" && value.title !== "" ? value.title : null;
  const code = typeof value.code === "string" ? value.code : "";

  return joinBlocks([
    title ? `# ${title}` : null,
    "```mermaid\n" + code + "\n```",
    additionalDetailsSection(collectExtras(value, MD_KNOWN_KEYS)),
  ]);
}

/**
 * Ready-to-splice registry entry for the central integration pass — this
 * module performs NO registration itself (system-kinds.ts is owned by the
 * integration pass; appending this constant there is the one-line wire-up).
 * `legacyBlockType: "mermaid"` is the exact BlockComponentRegistry /
 * splitter type string (` ```mermaid ` fences, alias ` ```mmd `); the canvas
 * facade matches MermaidBlock's own `open({ type: "mermaid" })`.
 */
export const MERMAID_DIAGRAM_KIND_DEFINITION: KindDefinition = {
  kind: "mermaid_diagram",
  schemaSource: "system",
  tier: "eager",
  legacyBlockType: "mermaid",
  toLegacyServerData: mermaidServerDataFromEnvelope,
  toMarkdown: mermaidMarkdownFromValue,
  artifact: { canvasType: "mermaid" },
  persistence: { persistStructured: true },
  schema: MERMAID_DIAGRAM_KIND_SCHEMA,
};
