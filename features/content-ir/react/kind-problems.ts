/**
 * The kind-problems reader — the ONE place the parser's recorded evidence of a
 * broken / degraded / unroutable kind instance is flattened for human display.
 *
 * WHY THIS EXISTS (Arman, 2026-08-29): the parser has always recorded exactly
 * what went wrong with a kind region — `residue.notices` carries `parse_error`,
 * `raw_fallback` (schema violations, duplicate keys, missing `__kind`),
 * `degrade_data_rescued`; `root.status`/`kindState` carry degradation; the
 * route marker carries why no component rendered — and NOTHING in the UI ever
 * read any of it. A shape that failed rendered as an anonymous key/value dump,
 * indistinguishable from data that was never a shape at all. That silence is
 * what made kind rendering feel random. This module turns that evidence into
 * `KindProblem[]`, consumed by the Errors tab in `StructuredValueTabs` — so a
 * broken kind is ACKNOWLEDGED as a kind, with its exact problems, everywhere
 * the fallback renders.
 *
 * Pure over envelope data (`CanonicalBlockIR` is plain JSON from
 * `@ai-matrx/content-ir`). Host diagnostics are host property (content-ir-twin
 * boundary) — this makes no routing decision and renders nothing.
 */

import type { CanonicalBlockIR, IrResidue } from "@ai-matrx/content-ir";
import type { IrRouteMarker } from "@/features/content-ir/react/kind-route";

export type KindProblemSeverity = "error" | "warning" | "info";

export interface KindProblem {
  /** Stable machine code (`parse_error`, `raw_fallback`, `component_inactive`, …). */
  code: string;
  /** Human sentence — shown verbatim in the Errors tab. */
  message: string;
  /** Region-relative path of the node the problem is about ("" = root). */
  path?: string;
  severity: KindProblemSeverity;
}

const ERROR_NOTICE_CODES = new Set(["parse_error", "raw_fallback"]);

function noticeSeverity(code: string): KindProblemSeverity {
  if (ERROR_NOTICE_CODES.has(code)) return "error";
  if (code === "partial_unvalidated") return "info";
  return "warning";
}

function residueProblems(
  residue: IrResidue | null | undefined,
  path: string,
): KindProblem[] {
  if (!residue) return [];
  const problems: KindProblem[] = [];
  for (const notice of residue.notices ?? []) {
    problems.push({
      code: notice.code,
      message: notice.message,
      ...(path ? { path } : {}),
      severity: noticeSeverity(notice.code),
    });
  }
  const extraKeys = residue.extra ? Object.keys(residue.extra) : [];
  if (extraKeys.length > 0) {
    problems.push({
      code: "unknown_keys",
      message: `Keys not in this shape's schema (kept, not lost): ${extraKeys.join(", ")}`,
      ...(path ? { path } : {}),
      severity: "warning",
    });
  }
  return problems;
}

/**
 * Flatten everything the envelope + route marker recorded about why this kind
 * instance is not rendering as its component. Empty array = a clean value that
 * simply has no component yet (the fix-it bar's territory, not an error).
 */
export function collectKindProblems(
  envelope: CanonicalBlockIR | null | undefined,
  marker?: IrRouteMarker | null,
): KindProblem[] {
  const problems: KindProblem[] = [];

  if (envelope) {
    const root = envelope.root;
    if (root.status === "error") {
      problems.push({
        code: "region_error",
        message:
          "This region hit a fatal parse error — the payload below is what arrived before it broke.",
        severity: "error",
      });
    }
    if (root.kindState === "raw" && root.kind) {
      problems.push({
        code: "degraded_raw",
        message: `This is a "${root.kind}" shape instance, but it could not be validated against the shape's schema, so it degraded to plain data.`,
        severity: "error",
      });
    }
    if (root.kindState === "pending_schema") {
      problems.push({
        code: "schema_unavailable",
        message: `The schema for "${root.kind}" had not loaded when this region finished.`,
        severity: "warning",
      });
    }
    problems.push(...residueProblems(root.residue, ""));
    if (envelope.nodeIndex) {
      for (const [pathKey, node] of Object.entries(envelope.nodeIndex)) {
        if (node.kindState === "raw" && node.kind) {
          problems.push({
            code: "nested_degraded_raw",
            message: `Nested "${node.kind}" at ${pathKey} failed validation and degraded to plain data.`,
            path: pathKey,
            severity: "error",
          });
        }
        problems.push(...residueProblems(node.residue, pathKey));
      }
    }
  }

  if (marker?.reason === "inactive") {
    problems.push({
      code: "component_inactive",
      message:
        "A component is registered for this shape but is held inactive — activate it to render this properly.",
      severity: "warning",
    });
  } else if (marker?.reason === "generic-row") {
    problems.push({
      code: "generic_component_row",
      message:
        "This shape's registered component IS the generic viewer — a real component still needs to be authored.",
      severity: "warning",
    });
  }

  return problems;
}

/** True when any collected problem is a real error (drives the tab's tint). */
export function hasKindErrors(problems: KindProblem[]): boolean {
  return problems.some((p) => p.severity === "error");
}

export interface FoundKindMarker {
  slug: string;
  /** Dotted path inside the scanned value ("" = the value itself). */
  path: string;
}

const KIND_KEY = "__kind";
const SCAN_NODE_CAP = 2000;
const SCAN_DEPTH_CAP = 8;

/**
 * Deep-scan a parsed JSON value for `__kind` markers — the tripwire for a kind
 * instance that escaped the promotion path and is being shown as anonymous
 * JSON. Bounded (node + depth caps) so a pathological payload cannot stall a
 * render; caps mean "found some", never an exhaustive census.
 */
export function findKindMarkers(
  value: unknown,
  limit = 5,
): FoundKindMarker[] {
  const found: FoundKindMarker[] = [];
  let visited = 0;

  const walk = (node: unknown, path: string, depth: number): void => {
    if (found.length >= limit) return;
    if (visited++ > SCAN_NODE_CAP || depth > SCAN_DEPTH_CAP) return;
    if (Array.isArray(node)) {
      node.forEach((item, i) =>
        walk(item, path ? `${path}.${i}` : String(i), depth + 1),
      );
      return;
    }
    if (typeof node !== "object" || node === null) return;
    const record = node as Record<string, unknown>;
    const slug = record[KIND_KEY];
    if (typeof slug === "string" && slug.trim()) {
      found.push({ slug: slug.trim(), path });
    }
    for (const [key, child] of Object.entries(record)) {
      if (key === KIND_KEY) continue;
      walk(child, path ? `${path}.${key}` : key, depth + 1);
    }
  };

  walk(value, "", 0);
  return found;
}
