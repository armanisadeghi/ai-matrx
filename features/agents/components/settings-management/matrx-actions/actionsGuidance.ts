/**
 * Matrx Actions guidance generator — turns an agent's available action types into
 * model-facing instructions describing the exact envelope + item shape to emit.
 *
 * Phase 1 (test): injected as plain text into the system prompt from the Matrx
 * Actions tab. Phase 2 (proper): the SAME generator becomes the resolver for a
 * structured `SystemInstruction` option (`matrx_ai/instructions/core.py` renders
 * it server-side, like `tools_list`/`content_blocks`). Built-in directives carry
 * a typed item schema (`DIRECTIVE_ITEM_SCHEMAS`); `verb:noun` catalog actions
 * describe a free-form item (fields are the agent's responsibility).
 */

import {
  DIRECTIVE_ITEM_SCHEMAS,
  type BuiltinDirective,
} from "../output-schema/applyDirectives";

const BUILTIN = new Set<string>(Object.keys(DIRECTIVE_ITEM_SCHEMAS));

type JsonSchema = Record<string, unknown>;

/** Render one item schema's fields as a readable bullet list. */
function describeItemFields(itemSchema: JsonSchema): string {
  const props = itemSchema.properties as
    | Record<string, JsonSchema>
    | undefined;
  if (!props || typeof props !== "object") {
    return "  - (a free-form object — the fields for this action's item)";
  }
  const required = new Set(
    Array.isArray(itemSchema.required)
      ? (itemSchema.required as unknown[]).filter(
          (k): k is string => typeof k === "string",
        )
      : [],
  );
  return Object.entries(props)
    .map(([key, def]) => {
      const rawType = def.type;
      const type = Array.isArray(rawType)
        ? rawType.filter((t) => t !== "null").join(" | ")
        : typeof rawType === "string"
          ? rawType
          : "any";
      const req = required.has(key) ? " (required)" : "";
      const desc =
        typeof def.description === "string" ? ` — ${def.description}` : "";
      return `  - \`${key}\`: ${type}${req}${desc}`;
    })
    .join("\n");
}

/** Guidance for a single action type. */
export function buildActionGuidance(type: string): string {
  const itemSchema = BUILTIN.has(type)
    ? DIRECTIVE_ITEM_SCHEMAS[type as BuiltinDirective]
    : undefined;
  const fields = itemSchema
    ? describeItemFields(itemSchema)
    : "  - (an object holding the fields for this action's item)";
  const example = JSON.stringify(
    {
      matrx_version: 1,
      kind: "output_directive",
      type,
      items: [{ "/* item */": "see fields below" }],
    },
    null,
    2,
  );
  return [
    `### \`${type}\``,
    ``,
    "```json",
    example,
    "```",
    ``,
    "Each entry in `items`:",
    fields,
  ].join("\n");
}

/** Full guidance block for the agent's available action types. Empty when none. */
export function buildActionsGuidance(types: string[]): string {
  const unique = Array.from(new Set(types.filter(Boolean)));
  if (unique.length === 0) return "";
  return [
    "## Available Matrx Actions",
    "",
    "You can perform the action(s) below by emitting the matching `output_directive` envelope as your final structured output. Emit an action only when the user's request calls for it.",
    "",
    ...unique.map(buildActionGuidance),
  ].join("\n\n");
}

/** Marker so an injected guidance block can be detected / replaced idempotently. */
export const ACTIONS_GUIDANCE_MARKER = "## Available Matrx Actions";
