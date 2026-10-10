/**
 * The pure half of the scope value screens (rows are the holder's `ScopeFieldValue`): how a cell
 * reads as text, which fields can be set from text, how an agent names a field, and the one
 * `ContextValueWrite` a person's edit becomes. Shapes are `@ai-matrx/records/scopes`; no React,
 * no store — unit-tested in `__tests__/scope-detail-values.test.ts`.
 */

import {
  hasCell,
  referenceFence,
  type ContextField,
  type ContextFieldKind,
  type ContextValue,
  type ContextValueWrite,
  type ScopeFieldValue,
} from "@ai-matrx/records/scopes";
import { cellEditorValue } from "@/features/scopes/utils/referenceCell";
import { contextValueWrite } from "@ai-matrx/records/scopes";

/** Kinds whose cell is a list of things it points at. */
export function isReferenceKind(kind: ContextFieldKind): boolean {
  return kind === "reference" || kind === "document";
}

/** Kinds a person sets through a structured control, never from plain text. */
const STRUCTURED_KINDS = new Set<ContextFieldKind>(["reference", "document", "currency", "object", "array"]);

/** Whether the cell holds anything (the package's `hasCell`, null-safe and narrowing). */
export function hasCellValue(value: ContextValue | null | undefined): value is ContextValue {
  return !!value && hasCell(value);
}

/** The cell as text (a reference cell as its fence, JSON for a structured value), or null when empty. */
export function cellText(value: ContextValue | null | undefined, pretty = false): string | null {
  if (!value || !hasCellValue(value)) return null;
  if (isReferenceKind(value.kind)) return referenceFence(value.references);
  const v = value.value;
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return pretty ? JSON.stringify(v, null, 2) : JSON.stringify(v);
  } catch {
    return null;
  }
}

/**
 * The value an editor seeds from: a reference cell's fence (what the reference picker edits, via
 * `cellEditorValue`), a structured cell as itself for a smart input, else its text.
 */
export function cellDraft(value: ContextValue | null | undefined, structured: boolean): unknown {
  if (!hasCellValue(value)) return "";
  if (isReferenceKind(value.kind)) return cellEditorValue(value) ?? "";
  if (structured && value.value != null && typeof value.value === "object") return value.value;
  return cellText(value, true) ?? "";
}

/** A field an agent may set by text: no smart-input component, no structured kind. */
export function settableByText(field: Pick<ContextField, "custom_component" | "kind">): boolean {
  return !field.custom_component && !STRUCTURED_KINDS.has(field.kind);
}

/** The row an agent named by field id or key (id wins), or null. */
export function valueFor(rows: readonly ScopeFieldValue[], fieldId: unknown, key: unknown): ScopeFieldValue | null {
  if (typeof fieldId === "string" && fieldId) return rows.find((r) => r.field.id === fieldId) ?? null;
  if (typeof key === "string" && key) return rows.find((r) => r.field.key === key) ?? null;
  return null;
}

/**
 * The cell a person's draft becomes. A reference / document draft is its fence (or its things); a text draft for
 * a number, percent or boolean field is read as that kind; an empty draft clears the cell.
 */
export function cellWrite(
  scopeId: string,
  field: Pick<ContextField, "id" | "kind">,
  draft: unknown,
  changeSummary?: string,
): ContextValueWrite {
  // The package's one write; this file only reads a typed text draft as its kind first.
  const raw = isReferenceKind(field.kind) ? draft : draftAsCell(field.kind, draft);
  return contextValueWrite(field, scopeId, raw, changeSummary ? { change_summary: changeSummary } : {});
}

function draftAsCell(kind: ContextFieldKind, draft: unknown): unknown {
  if (draft == null) return null;
  if (typeof draft !== "string") return draft;
  const text = draft.trim();
  if (text === "") return null;
  switch (kind) {
    case "number":
    case "percent": {
      const n = Number(text);
      return Number.isFinite(n) ? n : text;
    }
    case "boolean":
      return text === "true";
    case "object":
    case "array":
    case "currency":
      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    default:
      return draft;
  }
}
