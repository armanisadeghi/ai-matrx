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
  resolveContextRow,
  type ResolvedContextRow,
  type SavedContextRuleRows,
} from "@ai-matrx/agents/context";
import { humanizeIdentifier } from "@ai-matrx/kit/text-case";
import { getManifest } from "../../../../surfaces/runtime/registry";

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
    // A value the page publishes without declaring it still sits under the
    // page that produced it, with no page layer — exactly the row the
    // composer shows (`publishingPlace`) and the server files
    // (`context_surfaces`). Its rule is the page's merged row (`_default`
    // under the page), the same lookup the server runs.
    rows.push(
      resolveContextRow(
        {
          key,
          label: humanizeIdentifier(key),
          surfaceKey: surfaceName,
          origin: "page",
          value: scope[key],
          layers: { surface: { declared: false, auto_context: null, max_inline_chars: null } },
        },
        saved,
        cap,
        surfaceName,
      ),
    );
    status[key] = { supplied: suppliedOf(scope[key]), required: false, declared: false };
  }
  return { rows, status };
}

