"use client";

/**
 * The agent surface of ONE scope (`matrx-user/scope-detail`), registered by `ScopeDetailEditor`
 * for as long as the scope is on screen — on `/organizations/[orgId]/scopes/[typeId]/[scopeId]`
 * and in a Scope tile on a Board (the board keeps every tile but the live one dormant).
 *
 * Reads: the scope, its type and every context field with its cell (the same rows the page
 * renders). Writes go through the page's own doors: `updateScope` (name, description) and
 * `setScopeContextValue` (a cell — what `useScopeAutoSave` commits through), so an agent write
 * and a person's are the same operation. Renders nothing.
 */

import { useSurfaceRuntimeRegistration } from "@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext";
import type { SurfaceWriteHandlers } from "@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext";
import { useAppDispatch } from "@/lib/redux/hooks";
import { unwrapRecords } from "@/features/scopes/service/scopeDoors";
import { setScopeContextValue } from "@/features/scopes/redux/scopeContextView";
import { updateScope } from "@/features/scopes/redux/thunks/scopeTreeMutations";
import {
  SCOPE_DETAIL_SURFACE_NAME,
  SCOPE_DETAIL_WRITE_TARGETS,
  createScopeDetailScope,
} from "@/features/surfaces/manifests/scope-detail.manifest";
import {
  cellText,
  cellWrite,
  hasCellValue,
  settableByText,
  valueFor,
} from "./scope-detail-values";
import type { ScopeFieldValue } from "@ai-matrx/records/scopes";

export interface ScopeDetailSurfaceProps {
  scope: { id: string; name: string; description: string | null; organization_id?: string | null };
  scopeType: { id: string; label_singular: string; label_plural: string };
  orgId: string;
  rows: ScopeFieldValue[] | undefined;
  readError: string | null;
}


function plainString(target: string, value: unknown, allowEmpty: boolean): string {
  if (typeof value !== "string") {
    throw new Error(
      `${target} expects plain text, not JSON and not JSON-encoded text. Received ${Array.isArray(value) ? "an array" : typeof value}. Send the finished text itself as the value.`,
    );
  }
  if (!allowEmpty && !value.trim()) throw new Error(`${target} expects a non-empty string; it cannot be blank.`);
  return value;
}

export function ScopeDetailSurface({ scope, scopeType, orgId, rows, readError }: ScopeDetailSurfaceProps) {
  const dispatch = useAppDispatch();

  const getScope = () => {
    const filled = rows?.filter((r) => hasCellValue(r.value)).length;
    return createScopeDetailScope({
      scope_loaded: true,
      scope_id: scope.id,
      scope_name: scope.name,
      scope_description: scope.description ?? "",
      scope_type: { id: scopeType.id, label_singular: scopeType.label_singular, label_plural: scopeType.label_plural },
      scope_organization_id: orgId,
      ...(rows && !readError
        ? {
            context_items_filled: filled,
            context_items_total: rows.length,
            context_item_values: rows.map((r) => ({
              item_id: r.field.id,
              slug: r.field.key,
              name: r.field.label,
              kind: r.field.kind,
              has_value: hasCellValue(r.value),
              value: cellText(r.value),
            })),
          }
        : {}),
      ...(readError ? { values_error: readError } : {}),
    });
  };

  const getWriteHandlers = (): SurfaceWriteHandlers => ({
    [SCOPE_DETAIL_WRITE_TARGETS.scopeName]: async (value: unknown) => {
      const name = plainString(SCOPE_DETAIL_WRITE_TARGETS.scopeName, value, false).trim();
      await dispatch(updateScope({ scope_id: scope.id, name })).then(unwrapRecords);
    },
    [SCOPE_DETAIL_WRITE_TARGETS.scopeDescription]: async (value: unknown) => {
      const description = plainString(SCOPE_DETAIL_WRITE_TARGETS.scopeDescription, value, true).trim();
      await dispatch(updateScope({ scope_id: scope.id, description })).then(unwrapRecords);
    },
    [SCOPE_DETAIL_WRITE_TARGETS.contextItemValues]: async (value: unknown) => {
      const target = SCOPE_DETAIL_WRITE_TARGETS.contextItemValues;
      if (!Array.isArray(value) || value.length === 0 || value.length > 25) {
        throw new Error(
          `${target} expects a non-empty ARRAY of 1-25 { item_id | slug, value } objects. Send the array itself, not a JSON string of it.`,
        );
      }
      if (!rows) throw new Error("This scope's values have not loaded yet; try again once context_item_values is present.");
      // Validate EVERY entry before any write: a value that is partly wrong is refused whole.
      const plan = value.map((entry, index) => {
        if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
          throw new Error(`${target}[${index}] must be an object { item_id | slug, value }.`);
        }
        const raw = entry as Record<string, unknown>;
        if (typeof raw.value !== "string") {
          throw new Error(`${target}[${index}].value must be a plain string (empty clears the cell).`);
        }
        const row = valueFor(rows, raw.item_id, raw.slug);
        if (!row) {
          throw new Error(
            `${target}[${index}] names no context item of this scope (item_id ${String(raw.item_id ?? "-")}, slug ${String(raw.slug ?? "-")}). Use an item_id or slug from context_item_values.`,
          );
        }
        if (!settableByText(row.field)) {
          throw new Error(
            `${target}[${index}]: "${row.field.label}" is a structured item (${row.field.custom_component ? "a smart input" : row.field.kind}) that is set on the page by a person, not by text.`,
          );
        }
        return { row, text: raw.value };
      });
      for (const { row, text } of plan) {
        await dispatch(setScopeContextValue(cellWrite(scope.id, row.field, text))).unwrap();
      }
    },
  });

  useSurfaceRuntimeRegistration({
    surfaceName: SCOPE_DETAIL_SURFACE_NAME,
    getScope,
    getWriteHandlers,
    isEditable: true,
  });
  return null;
}
