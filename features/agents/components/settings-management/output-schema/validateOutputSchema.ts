/**
 * Advisory validator for an agent's `outputSchema` (the structured-output JSON
 * schema saved to `agx_agent.output_schema`).
 *
 * This is a TOOL, not an enforcer: it never mutates the schema and is never
 * applied automatically. The UI runs it on demand and shows the report; the
 * user decides what (if anything) to change.
 *
 * It checks the practical structured-output rules + the common provider gotchas
 * (OpenAI strict mode), not full JSON-Schema conformance.
 */

export interface OutputSchemaValidation {
  /** True when there are no hard errors (the schema is shaped well enough to use). */
  ok: boolean;
  /** Must-fix problems — the schema won't work as structured output. */
  errors: string[];
  /** Likely problems worth a look. */
  warnings: string[];
  /** Optional improvements (e.g. strict-mode requirements). */
  suggestions: string[];
}

/** name: alphanumeric, underscore, dash; 1–64 chars (matches OutputSchema doc). */
const NAME_RE = /^[a-zA-Z0-9_-]{1,64}$/;

const TOP_LEVEL_KEYS = new Set(["name", "description", "schema", "strict"]);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function validateOutputSchema(value: unknown): OutputSchemaValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const suggestions: string[] = [];

  // No schema set is a valid state — the agent just returns unstructured text.
  if (value === null || value === undefined) {
    return {
      ok: true,
      errors,
      warnings: [
        "No output schema set — the agent returns unstructured text. Add one and pair it with a json_schema response format to get structured output.",
      ],
      suggestions,
    };
  }

  if (!isPlainObject(value)) {
    errors.push(
      "Output schema must be a JSON object shaped like { name, schema, strict? }.",
    );
    return { ok: false, errors, warnings, suggestions };
  }

  // ── name ──
  if (value.name === undefined) {
    errors.push(
      'Missing "name". Add a schema name (letters, numbers, _ or -, max 64).',
    );
  } else if (typeof value.name !== "string" || !NAME_RE.test(value.name)) {
    errors.push(
      '"name" must be a string of letters, numbers, _ or - (max 64 chars).',
    );
  }

  // ── description / strict ──
  if (value.description !== undefined && typeof value.description !== "string") {
    warnings.push('"description" should be a string.');
  }
  if (value.strict !== undefined && typeof value.strict !== "boolean") {
    warnings.push('"strict" should be a boolean (true / false).');
  }
  if (value.strict !== true) {
    suggestions.push(
      'Set "strict": true so the provider enforces the schema exactly.',
    );
  }

  // ── schema ──
  if (value.schema === undefined) {
    errors.push('Missing "schema" — the JSON Schema describing the output.');
  } else if (!isPlainObject(value.schema)) {
    errors.push('"schema" must be a JSON Schema object.');
  } else {
    const schema = value.schema;
    if (schema.type !== "object") {
      errors.push(
        'Root "schema.type" must be "object" for structured output.',
      );
    }
    if (
      !isPlainObject(schema.properties) ||
      Object.keys(schema.properties).length === 0
    ) {
      warnings.push(
        '"schema.properties" is empty — define at least one property.',
      );
    }
    checkObjectNode(schema, "schema", warnings, suggestions);
  }

  // ── unexpected top-level keys ──
  for (const key of Object.keys(value)) {
    if (!TOP_LEVEL_KEYS.has(key)) {
      warnings.push(
        `Unexpected top-level key "${key}" — expected name, description, schema, strict.`,
      );
    }
  }

  return { ok: errors.length === 0, errors, warnings, suggestions };
}

/**
 * Recursively flags the strict-structured-output gotchas on object/array nodes:
 *  - every object should set additionalProperties:false
 *  - strict mode requires every property to be listed in `required`
 *  - `required` entries must exist in `properties`
 */
function checkObjectNode(
  node: Record<string, unknown>,
  path: string,
  warnings: string[],
  suggestions: string[],
): void {
  if (node.type === "object") {
    if (node.additionalProperties !== false) {
      suggestions.push(
        `${path}: set "additionalProperties": false (required by strict structured output).`,
      );
    }
    const props = isPlainObject(node.properties)
      ? Object.keys(node.properties)
      : [];
    const required = Array.isArray(node.required)
      ? node.required.map(String)
      : [];

    const missingFromRequired = props.filter((p) => !required.includes(p));
    if (props.length > 0 && missingFromRequired.length > 0) {
      suggestions.push(
        `${path}: strict mode requires every property in "required" — missing: ${missingFromRequired.join(", ")}.`,
      );
    }
    for (const r of required) {
      if (!props.includes(r)) {
        warnings.push(
          `${path}: "required" lists "${r}", which is not in "properties".`,
        );
      }
    }
    if (isPlainObject(node.properties)) {
      for (const [key, child] of Object.entries(node.properties)) {
        if (isPlainObject(child)) {
          checkObjectNode(child, `${path}.${key}`, warnings, suggestions);
        }
      }
    }
  }

  if (node.type === "array" && isPlainObject(node.items)) {
    checkObjectNode(node.items, `${path}.items`, warnings, suggestions);
  }
}
