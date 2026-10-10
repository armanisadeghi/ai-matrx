import { humanizeIdentifier } from "@ai-matrx/kit/text-case";
/**
 * Context reference cells — client-side parse/validate mirror of the DB path
 * (`context.parse_reference_fence` / `context.validate_reference_value`).
 *
 * A `value_type="reference"` context item's cell is ALWAYS a canonical
 * ```matrx kind:"reference" fence stored in `value_text` — never a bare uuid,
 * never the legacy `value_reference_id` / `value_reference_type` columns
 * (those stay read-only for the handful of pre-existing cells written before
 * this module existed; see `features/scopes/FEATURE.md`).
 *
 * This is UX-only: it lets `ContextValueInput` / `ReferenceValuePicker` reject
 * an invalid selection before round-tripping to the server. The RPC
 * (`context.write_context_value` → `validate_reference_value`) is the
 * authoritative check and re-validates everything here, plus the
 * `allowed_scope_type_ids` filter (which needs a DB lookup and is not
 * duplicated client-side).
 */

import {
  parseReferenceFence,
  buildReferenceFence,
} from "@ai-matrx/agents/envelope";
import type { ReferenceItem } from "@ai-matrx/agents/envelope";
import { listableTokens } from "@/features/scopes/registry/entityRegistry";
import {
  ENTITY_TYPE_METADATA,
  isEntityTypeToken,
} from "@ai-matrx/associations";
import { referenceFallbackLabel } from "@/features/matrx-envelope/referenceResolvers";
import {
  referenceFence,
  type ContextField,
  type ContextReference,
  type ContextValue,
  type ContextValueWrite,
} from "@ai-matrx/records/scopes";

/**
 * Human labels for reference types, shared by the item-settings type picker
 * (`ContextItemSettingsForm`) and the value picker's chips/tabs
 * (`ReferenceValuePicker`) — ONE label map, never a second copy.
 */
const REFERENCE_TYPE_LABELS: Record<string, string> = {
  file: "File",
  url: "Link",
  scope: "Scope",
  agent: "Agent",
  agent_app: "App",
  app: "App",
  task: "Task",
  note: "Note",
  project: "Project",
  organization: "Organization",
  // ONE name per type, never shared (G11A, 2026-10-07): `udt_document` (the
  // Univer editor at /documents) is "Document"; `content.document` keeps its
  // registry label, "Markdown document" — both once printed "Document".
  udt_document: "Document",
  transcript: "Transcript",
  workbook: "Workbook",
  skill: "Skill",
  workflow: "Workflow",
  conversation: "Conversation",
  folder: "Folder",
  dataset: "Table",
  data_store: "Data Store",
};

/**
 * Human label for a reference type: explicit override map first, then the
 * registry's DB label (`platform.entity_types.label`), then a humanized token.
 */
export function referenceTypeLabel(type: string): string {
  return (
    REFERENCE_TYPE_LABELS[type] ??
    (isEntityTypeToken(type) ? ENTITY_TYPE_METADATA[type].label : undefined) ??
    (humanizeIdentifier(type) || type)
  );
}

/**
 * The curated set of reference types a context item can actually be
 * configured to allow: `url` and `scope` (the two picker types with no
 * generic-entity-search backing) plus every registry-listable
 * `EntityTypeToken` (`file`, `note`, `task`, `project`, `agent`, …) —
 * i.e. every type `ReferenceValuePicker` has a working "Add" sub-picker for.
 * The full Matrx `REFERENCE_TYPES` taxonomy (features/matrx-envelope/envelope.ts)
 * is broader (picklist/table cell references etc.) but those are produced by
 * other surfaces, not authored here.
 */
export const CONTEXT_REFERENCE_TYPE_OPTIONS: string[] = [
  // Set-dedupe: `scope`/`url` are synthetic picker types here; if the registry
  // ever marks the same token reference_pickable, it must not appear twice.
  ...new Set(["url", "scope", ...listableTokens()]),
].sort((a, b) => referenceTypeLabel(a).localeCompare(referenceTypeLabel(b)));

/** The three item-definition columns that govern a `reference` cell. */
export interface ReferenceItemConfig {
  allowed_reference_types: string[] | null;
  max_items: number;
  allowed_scope_type_ids: string[] | null;
}

/**
 * Narrow ANY item/row shape carrying the three reference-config columns
 * (`ContextItemRow`, `ContextItem`, `ScopeContextRow`) down to `ReferenceItemConfig`.
 * `max_items` defaults to 1 (the DB column's own default) when the caller's
 * shape has it optional and it hasn't loaded yet.
 */
export function referenceConfigFromItem(item: {
  allowed_reference_types?: string[] | null;
  max_items?: number | null;
  allowed_scope_type_ids?: string[] | null;
}): ReferenceItemConfig {
  return {
    allowed_reference_types: item.allowed_reference_types ?? null,
    max_items: item.max_items ?? 1,
    allowed_scope_type_ids: item.allowed_scope_type_ids ?? null,
  };
}

export interface ParsedReferenceCell {
  type: string;
  items: ReferenceItem[];
}

/** Parse a cell's `value_text` into `{ type, items }`, or `null` if not a reference fence. */
export function parseReferenceCellValue(
  valueText: string | null | undefined,
): ParsedReferenceCell | null {
  if (!valueText) return null;
  const parsed = parseReferenceFence(valueText);
  if (!parsed) return null;
  return { type: parsed.directive.noun, items: parsed.items };
}

/** Serialize `{ type, items }` back into the canonical fence string. */
export function buildReferenceCellValue(
  type: string,
  items: ReferenceItem[],
): string {
  return buildReferenceFence({ type, items });
}

/**
 * Plain-text summary of a reference cell for dense contexts that can't render
 * JSX chips (grid/table cells, tooltips, CSV-style exports) — e.g. "QME
 * Report.pdf" for one item, "3 Files" for several. Always prefer
 * `ContextValueDisplay` (live chips) when the surface can render a component;
 * reach for this only when it genuinely can't.
 */
export function referenceCellSummary(parsed: ParsedReferenceCell): string {
  if (parsed.items.length === 0) return "";
  if (parsed.items.length === 1) {
    return referenceFallbackLabel(parsed.items[0]!, parsed.type);
  }
  return `${parsed.items.length} ${referenceTypeLabel(parsed.type)}${parsed.items.length === 1 ? "" : "s"}`;
}

/** The cell a summary or display reads: a value's kind, its cell, and its decoded references. */
export type ContextCellLike = Pick<ContextValue, "kind" | "value" | "references">;

const isReferenceKind = (kind: string | null | undefined) => kind === "reference" || kind === "document";

/**
 * The text an editor works on for a cell: a reference/document cell is its canonical fence
 * (`referenceFence(references)` — what `ReferenceValuePicker` edits), anything else its value.
 */
export function cellEditorValue(cell: ContextCellLike | null | undefined): unknown {
  if (!cell) return null;
  if (isReferenceKind(cell.kind)) return cell.references.length > 0 ? referenceFence(cell.references) : null;
  return cell.value ?? null;
}

/** The things a reference fence points at, as `ContextReference`s (the inverse of `referenceFence`). */
export function referencesFromFence(text: string | null | undefined): ContextReference[] {
  const parsed = parseReferenceCellValue(text ?? null);
  if (!parsed) return [];
  return parsed.items.flatMap((raw): ContextReference[] => {
    const item = raw as { id?: string; file_id?: string; label?: string; type?: string };
    if (item.file_id) return [{ id: item.id ?? item.file_id, type: "file", file_id: item.file_id, ...(item.label ? { label: item.label } : {}) }];
    if (!item.id) return [];
    return [{ id: item.id, type: item.type ?? parsed.type, ...(item.label ? { label: item.label } : {}) }];
  });
}

/**
 * THE one write a person's edit becomes: the editor's value for this field as a `ContextValueWrite`
 * (a reference/document field's fence becomes `references`; `null`/"" clears).
 */
export function contextValueWrite(
  field: Pick<ContextField, "id" | "kind">,
  scopeId: string,
  edited: unknown,
): ContextValueWrite {
  const base = { scope_id: scopeId, field_id: field.id, kind: field.kind, source_type: "manual" } as const;
  if (isReferenceKind(field.kind)) {
    return { ...base, references: typeof edited === "string" ? referencesFromFence(edited) : [] };
  }
  return { ...base, value: edited === "" ? null : (edited ?? null) };
}

/**
 * THE ONE plain-text summary of a context cell for dense contexts that can't render JSX
 * (grid/table cells, tooltips, exports). `null` means genuinely unset. Prefer `ContextValueDisplay`
 * when the surface can render a component.
 */
export function summarizeContextCell(cell: ContextCellLike | null | undefined): string | null {
  if (!cell) return null;
  if (isReferenceKind(cell.kind)) {
    const parsed = cell.references.length > 0 ? parseReferenceCellValue(referenceFence(cell.references)) : null;
    return parsed ? referenceCellSummary(parsed) || null : null;
  }
  const v = cell.value;
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "string") {
    const fenced = parseReferenceCellValue(v);
    return fenced ? referenceCellSummary(fenced) : v;
  }
  if (typeof v === "number") return cell.kind === "percent" ? `${v}%` : String(v);
  if (typeof v === "boolean") return v ? "Yes" : "No";
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

export type ReferenceCellValidation =
  { valid: true } | { valid: false; error: string };

/**
 * Mirrors `context.validate_reference_value` for instant client-side feedback.
 * Does NOT check `allowed_scope_type_ids` (requires a DB lookup per scope
 * item — the write RPC is authoritative for that constraint).
 */
export function validateReferenceCellValue(
  config: ReferenceItemConfig,
  valueText: string | null | undefined,
): ReferenceCellValidation {
  if (!valueText) return { valid: true }; // clearing a cell is always allowed

  const parsed = parseReferenceCellValue(valueText);
  if (!parsed) {
    return { valid: false, error: "Value is not a valid reference." };
  }

  const allowed = config.allowed_reference_types ?? [];
  if (!allowed.includes(parsed.type)) {
    return {
      valid: false,
      error: `Reference type "${parsed.type}" is not allowed here (allowed: ${allowed.join(", ") || "none configured"}).`,
    };
  }

  if (parsed.items.length === 0) {
    return { valid: false, error: "Select at least one item." };
  }
  if (parsed.items.length > config.max_items) {
    return {
      valid: false,
      error: `This field allows up to ${config.max_items} item${config.max_items === 1 ? "" : "s"}, got ${parsed.items.length}.`,
    };
  }

  return { valid: true };
}
