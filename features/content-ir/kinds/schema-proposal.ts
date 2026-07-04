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
 * SchemaProposalBlock casts the whole parsed object into `OutputSchema` and
 * "Apply to an agent" writes it to `agx_agent.output_schema` — so the bridge
 * MUST hand over a clean object with the injected root `__kind` removed.
 * Strip is ROOT-ONLY: a proposal's JSON Schema may legitimately declare a
 * `__kind` property itself (render-block-aware output schemas do exactly
 * that — see `buildAgentSchemaWithRenderBlockSupport`), and a deep strip
 * would silently delete it.
 */

import { makeCompleteEnvelopeBridge, isRecord } from "./legacy-bridge-utils";
import {
  additionalDetailsSection,
  collectExtras,
  joinBlocks,
} from "./kind-markdown-utils";

export const schemaProposalServerDataFromEnvelope = makeCompleteEnvelopeBridge(
  "schema_proposal",
  (value) => {
    if (typeof value.name !== "string" || !isRecord(value.schema)) {
      return undefined;
    }
    return value;
  },
  { strip: "root" },
);

// ---------------------------------------------------------------------------
// toMarkdown facet — schema_proposal → name + fenced JSON Schema body.
//
// A JSON Schema IS code — the fenced json body under a "Schema" heading is
// the deliberate, honest rendering here (not a lazy fallback). The schema is
// emitted VERBATIM: a nested `__kind` property inside it is legitimate user
// data (render-block-aware output schemas declare the discriminator
// themselves), exactly like the bridge's root-only strip.
// ---------------------------------------------------------------------------

const MD_PROPOSAL_KNOWN_KEYS = ["name", "schema", "strict"];

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
