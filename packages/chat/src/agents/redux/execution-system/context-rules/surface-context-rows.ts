/**
 * A PAGE'S OWN VALUES AS CONTEXT ROWS — what the Surface Context window
 * renders, through the SAME table and hierarchy as the composer's chip and
 * full view (one renderer, one data source: the resolved manifest + the live
 * scope + the person's saved rules).
 *
 * Every declared value is a row (supplied or not), plus every key the page's
 * runtime emits that its manifest never declared. Each row's Include and
 * Inline max are the person's real rules for this page — the same rows the
 * server reads — so the inspector is also a control, never a second list.
 */

import {
  DEFAULT_INLINE_CAP,
  DEFAULT_SURFACE_KEY,
  resolveContextRow,
  type ResolvedContextRow,
  type SavedContextRuleRows,
} from "@ai-matrx/agents/context";
import { humanizeIdentifier } from "@ai-matrx/kit/text-case";
import { getManifest } from "../../../../surfaces/runtime/registry";
import { placeContextRow, type ContextRowPlacement } from "./context-hierarchy";

/** What the inspector marks beside a row. */
export interface SurfaceValueStatus {
  /** `absent` = the key is not in the live scope; `empty` = present and empty. */
  supplied: "present" | "empty" | "absent";
  /** The manifest says the page always supplies it. */
  required: boolean;
  /** The manifest declares it (false: the runtime emitted an undeclared key). */
  declared: boolean;
}

export interface SurfaceContextRows {
  rows: ResolvedContextRow[];
  status: Record<string, SurfaceValueStatus>;
}

function hasValue(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "string") return value.length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

function suppliedOf(value: unknown): SurfaceValueStatus["supplied"] {
  if (value === undefined) return "absent";
  return hasValue(value) ? "present" : "empty";
}

const validLimit = (v: unknown): number | null =>
  typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null;

export function surfaceContextRows(
  surfaceName: string,
  scope: Record<string, unknown>,
  saved: SavedContextRuleRows | null | undefined,
  cap: number = DEFAULT_INLINE_CAP,
): SurfaceContextRows {
  const declared = getManifest(surfaceName)?.values ?? [];
  const names = new Set(declared.map((v) => v.name));
  const rows: ResolvedContextRow[] = [];
  const status: Record<string, SurfaceValueStatus> = {};
  for (const v of declared) {
    const value = scope[v.name];
    rows.push(
      resolveContextRow(
        {
          key: v.name,
          label: v.label,
          surfaceKey: surfaceName,
          origin: "page",
          value,
          ...(value === undefined ? { chars: null } : {}),
          layers: {
            surface: {
              declared: true,
              auto_context: v.autoContext ?? true,
              max_inline_chars: validLimit(v.inlineUpTo),
            },
          },
        },
        saved,
        cap,
        surfaceName,
      ),
    );
    status[v.name] = { supplied: suppliedOf(value), required: v.alwaysAvailable === true, declared: true };
  }
  for (const key of Object.keys(scope)) {
    if (names.has(key)) continue;
    // The server files an undeclared value under the person's "_default" row.
    rows.push(
      resolveContextRow(
        { key, label: humanizeIdentifier(key), surfaceKey: DEFAULT_SURFACE_KEY, origin: "attached", value: scope[key] },
        saved,
        cap,
        surfaceName,
      ),
    );
    status[key] = { supplied: suppliedOf(scope[key]), required: false, declared: false };
  }
  return { rows, status };
}

/** Every row of one page's inspector sits under that page, in its declared group. */
export function surfaceInspectorPlacer(
  surfaceName: string,
): (row: Pick<ResolvedContextRow, "key" | "surfaceKey" | "origin">) => ContextRowPlacement {
  return (row) => placeContextRow({ key: row.key, surfaceKey: surfaceName, origin: "page" }, surfaceName);
}
