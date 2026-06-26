/**
 * Action ↔ output_schema wiring for the Matrx Actions tab.
 *
 * "What action an agent performs" is the `output_directive` envelope it emits —
 * i.e. its `output_schema`. Picking an action in the tab generates that envelope
 * schema (so the model emits the directive); `matrx_actions` then governs the
 * apply policy. This mirrors the retired legacy `directive` raw-output path —
 * one named action, defined by the agent — but on the canonical envelope path.
 *
 * Built-in directives get their typed item schema (`DIRECTIVE_ITEM_SCHEMAS`);
 * `verb:noun` catalog actions get a permissive object item (fields are the
 * agent's job + backend per-item validation), since the FE catalog doesn't carry
 * field schemas.
 */

import { buildEnvelopeOutputSchema } from "@/features/matrx-envelope/envelope";
import {
  DIRECTIVE_ITEM_SCHEMAS,
  type BuiltinDirective,
} from "../output-schema/applyDirectives";
import type { OutputSchema } from "@/features/agents/types/json-schema";

type JsonSchema = Record<string, unknown>;

const BUILTIN_TYPES = new Set<string>(Object.keys(DIRECTIVE_ITEM_SCHEMAS));

/** The output_schema envelope that makes an agent EMIT the given action type. */
export function buildActionOutputSchema(type: string): OutputSchema {
  const itemSchema: JsonSchema = BUILTIN_TYPES.has(type)
    ? DIRECTIVE_ITEM_SCHEMAS[type as BuiltinDirective]
    : { type: "object", description: "The action's item fields." };
  const built = buildEnvelopeOutputSchema({
    name: `${type.replace(/:/g, "_")}_action`,
    kind: "output_directive",
    type,
    itemSchema,
  });
  // buildEnvelopeOutputSchema returns { name, strict, schema } — the OutputSchema
  // envelope shape ({ name, schema, strict? }); cast through unknown per the repo
  // convention for these structurally-identical JSON envelopes.
  return built as unknown as OutputSchema;
}

/** Read the `properties` map off an OutputSchema's JSON Schema, if present. */
function schemaProps(
  schema: OutputSchema | null | undefined,
): Record<string, unknown> | null {
  if (!schema || typeof schema !== "object") return null;
  const inner = (schema as { schema?: unknown }).schema;
  if (!inner || typeof inner !== "object") return null;
  const props = (inner as { properties?: unknown }).properties;
  if (!props || typeof props !== "object") return null;
  return props as Record<string, unknown>;
}

function constOf(
  props: Record<string, unknown> | null,
  key: string,
): string | null {
  const entry = props?.[key];
  if (!entry || typeof entry !== "object") return null;
  const c = (entry as { const?: unknown }).const;
  return typeof c === "string" ? c : null;
}

/**
 * True when an output_schema IS a Matrx Actions directive envelope — i.e. one
 * this tab generated. Only such schemas are safe to replace/clear from here; a
 * custom user schema is left untouched.
 */
export function isActionOutputSchema(
  schema: OutputSchema | null | undefined,
): boolean {
  return constOf(schemaProps(schema), "kind") === "output_directive";
}

/** The directive `type` an action output_schema emits, or null when not one. */
export function actionTypeOfSchema(
  schema: OutputSchema | null | undefined,
): string | null {
  const props = schemaProps(schema);
  if (constOf(props, "kind") !== "output_directive") return null;
  return constOf(props, "type");
}
