"use client";

/**
 * One directive's (or Custom Action's) item shape — an example payload and its
 * JSON Schema — as a canvas tab (`directive-shape`), keyed by the verb and noun
 * (`create:task`) or the Custom Action's name. The schema travels in the tab's
 * data, so the tab comes back after a reload. Light: the body loads only when a
 * tab renders.
 */

import { Braces } from "lucide-react";
import type { CanvasJson, CanvasOpenInput } from "@ai-matrx/canvas";
import { defineCanvasKind, type AnyCanvasKind } from "@ai-matrx/canvas/react";
import type {
  CustomActionEntry,
  DirectiveVerb,
  NounDirectives,
} from "@/features/directive-catalog/types";

export const DIRECTIVE_SHAPE_KIND = "directive-shape";

export type DirectiveShapeSelection =
  | { kind: "directive"; noun: NounDirectives; verb: DirectiveVerb }
  | { kind: "custom_action"; customAction: CustomActionEntry };

export type DirectiveShapeData = {
  title: string;
  subtitle: string;
  schema: CanvasJson;
};

/** A schema read from the catalog, as plain JSON (anything else becomes null). */
function asJson(value: unknown): CanvasJson {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) return value.map(asJson);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, asJson(entry)]),
    );
  }
  return null;
}

/** `schema` is the noun's item schema for the verb, loaded by the caller from
 * `GET /directives/catalog/{noun}` (the summary carries none); a Custom Action
 * carries its own. */
export function directiveShapeOpenInput(
  selection: DirectiveShapeSelection,
  schema?: unknown,
): CanvasOpenInput {
  const data: DirectiveShapeData =
    selection.kind === "custom_action"
      ? {
          title: `Custom Action: ${selection.customAction.name}`,
          subtitle: selection.customAction.doc ?? "",
          schema: asJson(selection.customAction.item_schema),
        }
      : {
          title: `${selection.verb}:${selection.noun.noun}`,
          subtitle: `${selection.noun.label || selection.noun.noun} · ${selection.noun.table}`,
          schema: asJson(schema ?? null),
        };
  const key =
    selection.kind === "custom_action"
      ? `custom-action:${selection.customAction.name}`
      : `${selection.verb}:${selection.noun.noun}`;
  return { kind: DIRECTIVE_SHAPE_KIND, key, title: data.title, data };
}

export function readDirectiveShapeData(
  data: unknown,
): DirectiveShapeData | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const record = data as Record<string, unknown>;
  if (typeof record.title !== "string") return null;
  return {
    title: record.title,
    subtitle: typeof record.subtitle === "string" ? record.subtitle : "",
    schema: asJson(record.schema),
  };
}

export const DIRECTIVE_SHAPE_CANVAS_KIND: AnyCanvasKind =
  defineCanvasKind<DirectiveShapeData>({
    id: DIRECTIVE_SHAPE_KIND,
    surface: "dom",
    label: "Item shape",
    icon: Braces,
    load: () => import("./DirectiveShapeCanvasView"),
    title: (data) => data.title,
    restore: true,
  });
