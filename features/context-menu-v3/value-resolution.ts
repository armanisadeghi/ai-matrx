// features/context-menu-v3/value-resolution.ts
//
// The single most important module in v3: it assembles the `ApplicationScope`
// the menu acts on, and it makes the two failure classes the user keeps hitting
// STRUCTURALLY VISIBLE:
//
//   1. "Fake menu" — a menu that opens but Copy does nothing and the selection
//      bar is empty, because the surface wired neither a selection nor content.
//      Fixed at the root: the DOM-subtree text fallback means read-only content
//      is copyable/actionable with zero surface wiring; `detectInertMenu` then
//      SCREAMS in dev if a menu still opens with nothing resolvable.
//
//   2. Broken value mapping — a surface declares a value its shortcuts/agents
//      depend on but forgets to emit it. `auditSurfaceScope` compares the
//      surface's declared `alwaysAvailable` values against what actually landed
//      in the scope and screams about any that are missing.
//
// The 5 generic baseline values (selection, text_before, text_after, content,
// context) are guaranteed present via the platform primitive `withBaselineScope`
// — we reuse it, never reimplement it.

import type { ApplicationScope } from "@/features/agents/types/scope.types";
import { withBaselineScope } from "@/features/surfaces/utils/baseline-scope";
import {
  BASELINE_VALUE_NAMES,
  type BaselineKey,
} from "@/features/surfaces/manifests/_baseline.manifest";
import { getManifest } from "@/features/surfaces/manifests/registry";
import type { SelectionRange } from "./utils/selection-tracking";

/** Keys the menu manages internally and must not leak into the scope as values. */
const SKIP_MERGE_KEYS = new Set(["contextFilter"]);

const isDev = process.env.NODE_ENV !== "production";

function strOf(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export interface ResolveScopeArgs {
  /** Live scope builder from the surface — wins when present. */
  getApplicationScope?: () => ApplicationScope;
  /** Static + per-target-merged value payload from the surface. */
  contextData: Record<string, unknown>;
  /** The text the user has selected (captured by the shell at open). */
  selectedText: string;
  /** The captured selection range (drives text_before / text_after / content). */
  selectionRange: SelectionRange | null;
  /**
   * Plain text of the right-clicked DOM subtree, captured by the shell. Used as
   * `content` ONLY when nothing else resolved it — the net that stops a
   * read-only surface from presenting a dead Copy.
   */
  fallbackContent?: string;
}

/**
 * Build the complete `ApplicationScope` for this menu invocation.
 *
 * Order of precedence for `content`:
 *   1. surface `getApplicationScope().content` / `contextData.content`
 *   2. the full value of an editable field (from the selection range)
 *   3. the DOM-subtree text fallback (`fallbackContent`)
 *
 * The result always carries the 5 baseline keys (empty-floored).
 */
export function resolveApplicationScope(
  args: ResolveScopeArgs,
): ApplicationScope {
  const base: ApplicationScope = args.getApplicationScope
    ? { ...args.getApplicationScope() }
    : buildFromMenuContext(args);

  // No-fake-menu net: if no usable content resolved but the DOM gave us text,
  // adopt it so Copy / AI actions always have something to act on.
  const hasContent = strOf(base.content).trim().length > 0;
  if (!hasContent && args.fallbackContent && args.fallbackContent.trim()) {
    base.content = args.fallbackContent;
  }

  return withBaselineScope(base);
}

/** Assemble scope from static contextData + the captured selection. */
function buildFromMenuContext(args: ResolveScopeArgs): ApplicationScope {
  const { selectedText, selectionRange, contextData: cd } = args;

  let textBefore = "";
  let textAfter = "";
  let fullContent = "";
  if (
    selectionRange &&
    selectionRange.type === "editable" &&
    selectionRange.element
  ) {
    const value = selectionRange.element.value ?? "";
    fullContent = value;
    textBefore = value.substring(0, selectionRange.start ?? 0);
    textAfter = value.substring(selectionRange.end ?? 0);
  }

  const scope: ApplicationScope = {};

  // Surface payload first — skip undefined so live capture is not clobbered.
  for (const [k, v] of Object.entries(cd)) {
    if (SKIP_MERGE_KEYS.has(k) || v === undefined) continue;
    scope[k] = v;
  }

  // Normalize `context` into an object (the resolver flattens it into entries).
  if (typeof cd.context === "string") {
    scope.context = { raw: cd.context };
  } else if (cd.context !== undefined && typeof cd.context !== "string") {
    scope.context = cd.context as Record<string, unknown>;
  } else if (scope.context === undefined) {
    scope.context = {};
  }

  // Live DOM capture wins for the baseline text-editor triad.
  scope.selection = selectedText;
  scope.text_before = textBefore;
  scope.text_after = textAfter;

  if (typeof cd.content === "string") {
    scope.content = cd.content;
  } else if (fullContent) {
    scope.content = fullContent;
  } else if (scope.content === undefined) {
    scope.content = "";
  }

  // Convention: `active_text` is selection when highlighted, else the full body.
  // Bindings mapping agent `content` ← surface `selection` keep working when the
  // user didn't highlight but the surface knows the acting text.
  const activeText = scope.active_text;
  if (
    scope.selection === "" &&
    typeof activeText === "string" &&
    activeText.length > 0
  ) {
    scope.selection = activeText;
  }

  return scope;
}

// ---------------------------------------------------------------------------
// Source gating — "never show an action that can't work".
// ---------------------------------------------------------------------------

/**
 * The text Copy / AI actions should operate on: the selection if there is one,
 * otherwise the resolved primary content. This is what makes Copy work on a
 * read-only surface where the user merely right-clicked.
 */
export function resolveActionText(scope: ApplicationScope): {
  text: string;
  source: "selection" | "content" | "none";
} {
  const selection = strOf(scope.selection).trim();
  if (selection) return { text: strOf(scope.selection), source: "selection" };
  const content = strOf(scope.content).trim();
  if (content) return { text: strOf(scope.content), source: "content" };
  return { text: "", source: "none" };
}

/** True when there is anything for the content-acting half of the menu to do. */
export function hasActionableContent(scope: ApplicationScope): boolean {
  return resolveActionText(scope).source !== "none";
}

// ---------------------------------------------------------------------------
// Loud guards (dev only) — the second layer that makes the failure visible.
// ---------------------------------------------------------------------------

export interface InertMenuDiagnostic {
  /** True when the menu opened with nothing meaningful to do. */
  inert: boolean;
  reasons: string[];
}

/**
 * A menu is INERT when, on a read-only surface, there is no selection, no
 * resolvable content, and the surface injected no items of its own — i.e. the
 * user sees Copy/AI rows that do nothing. (Editable surfaces are never inert:
 * Paste is always meaningful.)
 */
export function detectInertMenu(args: {
  scope: ApplicationScope;
  isEditable: boolean;
  hasExtraSections: boolean;
}): InertMenuDiagnostic {
  const reasons: string[] = [];
  const selection = strOf(args.scope.selection).trim();
  const content = strOf(args.scope.content).trim();
  if (!selection) reasons.push("no selection");
  if (!content) reasons.push("no resolvable content (and no DOM-text fallback)");
  const inert =
    !args.isEditable && !selection && !content && !args.hasExtraSections;
  return { inert, reasons };
}

/**
 * Compare a surface's DECLARED `alwaysAvailable` values against what actually
 * landed in the resolved scope. A declared-but-missing value silently breaks
 * the shortcuts/agents that depend on it — the exact "values not passed"
 * failure. Baseline values are skipped (they are empty-floored by design, so a
 * missing one is not an error). Returns human-readable warnings.
 */
export function auditSurfaceScope(
  surfaceName: string | undefined,
  scope: ApplicationScope,
): string[] {
  if (!surfaceName) return [];
  const manifest = getManifest(surfaceName);
  if (!manifest) {
    return [
      `surface "${surfaceName}" has no registered manifest — its declared values cannot be verified`,
    ];
  }
  const baseline = new Set<string>(BASELINE_VALUE_NAMES as readonly BaselineKey[]);
  const warnings: string[] = [];
  for (const value of manifest.values) {
    if (baseline.has(value.name)) continue; // floored — never an error
    if (!value.alwaysAvailable) continue; // optional by declaration
    const present = scope[value.name];
    if (present === undefined || present === null || present === "") {
      warnings.push(
        `declared value "${value.name}" is alwaysAvailable but was not emitted into the scope`,
      );
    }
  }
  return warnings;
}

/**
 * Run both loud guards and SCREAM in dev. A recovery/diagnostic layer that fires
 * means a real defect got past the surface wiring — per doctrine it must be
 * impossible to miss, not a silent default. No-op in production.
 */
export function reportMenuDiagnostics(args: {
  surfaceName: string | undefined;
  scope: ApplicationScope;
  isEditable: boolean;
  hasExtraSections: boolean;
}): InertMenuDiagnostic {
  const diag = detectInertMenu(args);
  if (!isDev) return diag;

  const label = args.surfaceName ?? "(no surfaceName)";
  if (diag.inert) {
    console.error(
      `%c[ContextMenuV3] INERT MENU on "${label}"%c — opened with nothing to act on (${diag.reasons.join(
        ", ",
      )}). This is the "fake menu" defect: the surface must provide a selection, contextData.content, getApplicationScope(), or render selectable content the DOM fallback can read.`,
      "color:#ef4444;font-weight:bold",
      "color:inherit",
      { scopeKeys: Object.keys(args.scope) },
    );
  }
  const valueWarnings = auditSurfaceScope(args.surfaceName, args.scope);
  if (valueWarnings.length > 0) {
    console.error(
      `%c[ContextMenuV3] VALUE MAPPING GAP on "${label}"%c — ${valueWarnings.join(
        "; ",
      )}. Shortcuts/agents bound to these values will receive nothing.`,
      "color:#f59e0b;font-weight:bold",
      "color:inherit",
    );
  }
  return diag;
}
