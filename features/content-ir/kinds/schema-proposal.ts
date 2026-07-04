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
