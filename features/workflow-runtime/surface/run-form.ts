/**
 * The generated run-start form (Phase 4) — PURE derivation.
 *
 * A workflow declares what a person must provide via `io.user_input` nodes
 * ("Collect Inputs"): each carries `data.config.fields` authored in the
 * studio (key/type/label/required/options/help/placeholder/default). The run
 * form is one section per user-input node; submission becomes the start
 * request's `node_inputs[nodeId] = { key: value }` — the exact contract
 * RunWorkflowRequest documents for the generated form.
 *
 * Tolerant by contract: malformed fields are dropped (a start dialog must
 * render), and a definition with no user-input nodes yields [] — callers
 * start the run with no form.
 */

import type { WorkflowDefinitionLike } from "../trigger-points";

export type RunFormFieldType =
  | "text"
  | "long_text"
  | "number"
  | "yes_no"
  | "choice"
  | "file";

export interface RunFormField {
  key: string;
  label: string;
  type: RunFormFieldType;
  required: boolean;
  options: string[];
  help: string;
  placeholder: string;
  defaultValue: unknown;
}

export interface RunFormSection {
  nodeId: string;
  title: string;
  fields: RunFormField[];
}

const FIELD_TYPES: ReadonlySet<string> = new Set([
  "text",
  "long_text",
  "number",
  "yes_no",
  "choice",
  "file",
]);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function parseField(raw: unknown): RunFormField | null {
  if (!isRecord(raw)) return null;
  const key = raw.key;
  if (typeof key !== "string" || key.length === 0) return null;
  const type =
    typeof raw.type === "string" && FIELD_TYPES.has(raw.type)
      ? (raw.type as RunFormFieldType)
      : "text";
  return {
    key,
    label: typeof raw.label === "string" && raw.label ? raw.label : key,
    type,
    required: raw.required === true,
    options: Array.isArray(raw.options)
      ? raw.options.filter((o): o is string => typeof o === "string")
      : [],
    help: typeof raw.help === "string" ? raw.help : "",
    placeholder: typeof raw.placeholder === "string" ? raw.placeholder : "",
    defaultValue: raw.default ?? null,
  };
}

/** One form section per io.user_input node, in definition order. */
export function deriveRunForm(
  definition: WorkflowDefinitionLike,
): RunFormSection[] {
  const sections: RunFormSection[] = [];
  for (const node of definition.nodes) {
    if (node.data?.spec_type !== "io.user_input") continue;
    const config = isRecord(node.data.config) ? node.data.config : {};
    const rawFields = Array.isArray(config.fields) ? config.fields : [];
    const fields = rawFields
      .map(parseField)
      .filter((f): f is RunFormField => f !== null);
    if (fields.length === 0) continue;
    const label = node.data.label;
    sections.push({
      nodeId: node.id,
      title:
        typeof config.title === "string" && config.title
          ? config.title
          : typeof label === "string" && label
            ? label
            : "Inputs",
      fields,
    });
  }
  return sections;
}

/** Seed initial values from authored defaults (yes_no seeds false). */
export function seedRunFormValues(
  sections: RunFormSection[],
): Record<string, Record<string, unknown>> {
  const values: Record<string, Record<string, unknown>> = {};
  for (const section of sections) {
    const sectionValues: Record<string, unknown> = {};
    for (const field of section.fields) {
      if (field.defaultValue !== null && field.defaultValue !== undefined) {
        sectionValues[field.key] = field.defaultValue;
      } else if (field.type === "yes_no") {
        sectionValues[field.key] = false;
      }
    }
    values[section.nodeId] = sectionValues;
  }
  return values;
}

/** Human labels of required fields still missing a value, per section. */
export function missingRequiredFields(
  sections: RunFormSection[],
  values: Record<string, Record<string, unknown>>,
): string[] {
  const missing: string[] = [];
  for (const section of sections) {
    for (const field of section.fields) {
      if (!field.required) continue;
      const value = values[section.nodeId]?.[field.key];
      if (value === undefined || value === null || value === "") {
        missing.push(field.label);
      }
    }
  }
  return missing;
}
