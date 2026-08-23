/**
 * schema_proposal kind → SchemaProposalBlock bridge.
 *
 * Successor to the legacy `{ name, schema, strict? }` root-key detection
 * (root key "name" + object "schema"). The kind's authored shape is the
 * same object plus the discriminator:
 *
 *   { __kind:"schema_proposal", name, schema: { ...JSON Schema... },
 *     strict? }
 *
 * THE ONE LAWFUL DROP ON THIS PATH — EXTERNAL EGRESS, not rendering.
 * SchemaProposalBlock casts the whole object into `OutputSchema` and "Apply to
 * an agent" writes it verbatim to `agx_agent.output_schema`. That destination
 * is a JSON Schema document, not a kind instance, so the proposal's OWN root
 * marker must not be written into it. It is dropped HERE, at the egress, on
 * the ROOT ONLY — everything nested is untouched, because a proposal's JSON
 * Schema may legitimately declare a `__kind` PROPERTY (render-block-aware
 * output schemas do exactly that — see `buildAgentSchemaWithRenderBlockSupport`).
 * Every other bridge passes the marker straight through
 * (KINDS_EVERYWHERE_PLAN §4.2).
 */

import { MARKER_KEY, makeCompleteEnvelopeBridge, isRecord } from "./legacy-bridge-utils";
import {
  additionalDetailsSection,
  collectExtras,
  joinBlocks,
} from "./kind-markdown-utils";
import { KIND_KEY } from "@ai-matrx/content-ir";

export const schemaProposalServerDataFromEnvelope = makeCompleteEnvelopeBridge(
  "schema_proposal",
  (value) => {
    if (typeof value.name !== "string" || !isRecord(value.schema)) {
      return undefined;
    }
    const { [MARKER_KEY]: _identity, ...proposal } = value;
    void _identity;
    return proposal;
  },
);

// ---------------------------------------------------------------------------
// toMarkdown facet — schema_proposal → name + fenced JSON Schema body.
//
// A JSON Schema IS code — the fenced json body under a "Schema" heading is
// the deliberate, honest rendering here (not a lazy fallback). The schema is
// emitted VERBATIM: a nested `__kind` property inside it is legitimate user
// data (render-block-aware output schemas declare the discriminator
// themselves), exactly like the bridge's root-only egress drop.
// ---------------------------------------------------------------------------

const MD_PROPOSAL_KNOWN_KEYS = ["name", "schema", "strict", KIND_KEY];

export function schemaProposalMarkdownFromValue(
  value: Record<string, unknown>,
): string {
  const name =
    typeof value.name === "string" && value.name !== ""
      ? value.name
      : "Schema proposal";

  let body: string;
  try {
    body = JSON.stringify(value.schema ?? {}, null, 2);
  } catch {
    body = String(value.schema);
  }

  return joinBlocks([
    `# ${name}`,
    typeof value.strict === "boolean"
      ? `**Strict:** ${value.strict ? "yes" : "no"}`
      : null,
    `## Schema\n\n\`\`\`json\n${body}\n\`\`\``,
    additionalDetailsSection(collectExtras(value, MD_PROPOSAL_KNOWN_KEYS)),
  ]);
}
