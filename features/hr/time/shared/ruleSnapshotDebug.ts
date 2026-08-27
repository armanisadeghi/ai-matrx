"use client";

/**
 * features/hr/time/shared/ruleSnapshotDebug.ts — a gated breadcrumb trail for the evidence drawer.
 *
 * 🚨 WHY THIS EXISTS. The rule-snapshot drawer opens on one machine and not on another, on the
 * identical build, with every DOM-level control passing: the trigger carries its aria-label,
 * `elementFromPoint` returns the button, it has an `onclick`, the viewport guard passes, and
 * persisted workspace state has been cleared. In the failing environment **no
 * `hr-time-rule-snapshot` window exists at all** — not minimized, not hidden, never created.
 *
 * Four hypotheses have now been proposed and three falsified. That is the point at which guessing
 * stops being engineering. This module instruments every stage between the click and the mounted
 * window so the next run reports **where the trail stops** instead of what somebody suspects.
 *
 * 🚨 IT IS OFF BY DEFAULT AND MUST STAY THAT WAY. Enable per session with either:
 *
 *     ?debug=rulesnapshot                 (URL, survives one navigation)
 *     localStorage.setItem('hr.debug.rulesnapshot', '1')   (sticky, survives reloads)
 *
 * Disabled, every call here is a single boolean check and no console output. A debug trail that
 * ships on by default is noise that trains people to ignore the console — which is how the class
 * this exists to diagnose stayed invisible for five rounds.
 */

/**
 * A random id minted when THIS MODULE INSTANCE is evaluated.
 *
 * 🚨 THE HIGHEST-VALUE SIGNAL IN THE TRAIL. `createContext` called twice produces two different
 * contexts. If code-splitting loads this module into two chunks, the door subscribes to context A
 * while the provider provides context B — `open()` then updates a provider that renders no window,
 * and the symptom is exactly the reported one: handler fires, no error, nothing is ever created.
 *
 * The door and the provider each log this id. **If the two ids differ, that is the bug**, and no
 * further hypothesis is needed.
 */
export const RULE_SNAPSHOT_MODULE_ID = Math.random().toString(36).slice(2, 10);

export type RuleSnapshotStage =
  | "door:click"
  | "door:context-resolved"
  | "provider:open-called"
  | "provider:render"
  | "provider:reveal-dispatched"
  | "window:body-mounted"
  | "window:registration-check";

let cachedEnabled: boolean | null = null;

/** Re-read on every call in dev so a flag set mid-session takes effect without a reload. */
export function ruleSnapshotDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  if (cachedEnabled !== null) return cachedEnabled;
  let enabled = false;
  try {
    enabled =
      new URLSearchParams(window.location.search).get("debug") === "rulesnapshot" ||
      window.localStorage.getItem("hr.debug.rulesnapshot") === "1";
  } catch {
    // A blocked localStorage must never break the surface it is only observing.
    enabled = false;
  }
  cachedEnabled = enabled;
  if (enabled) {
    // Printed once, so a reader knows the trail is live and what the ids mean.
    console.info(
      `%c[rule-snapshot] breadcrumb trail ON — module instance ${RULE_SNAPSHOT_MODULE_ID}. ` +
        `If the door and the provider report DIFFERENT module ids, this file is loaded twice and ` +
        `they are using different React contexts — that alone explains a window that is never created.`,
      "color:#b45309;font-weight:600",
    );
  }
  return enabled;
}

/** One breadcrumb. Ordered by the sequence a working open follows. */
export function ruleSnapshotTrail(
  stage: RuleSnapshotStage,
  detail: Record<string, unknown> = {},
): void {
  if (!ruleSnapshotDebugEnabled()) return;
  console.info(`[rule-snapshot] ${stage}`, {
    moduleId: RULE_SNAPSHOT_MODULE_ID,
    at: new Date().toISOString(),
    ...detail,
  });
}

/**
 * What the handler actually READ at click time — so a run can distinguish "the click never
 * happened" from "the click happened and the request it built was empty".
 */
export function describeSnapshotRequest(request: {
  title?: string;
  calc?: { ruleVersionIds?: string[]; rules?: unknown[]; calc?: Record<string, unknown> } | null;
  body?: unknown;
}): Record<string, unknown> {
  return {
    title: request.title ?? "(none)",
    hasCalcRef: request.calc != null,
    ruleVersionIdCount: request.calc?.ruleVersionIds?.length ?? 0,
    namedRuleCount: Array.isArray(request.calc?.rules) ? request.calc.rules.length : 0,
    calcInputKeys: request.calc?.calc ? Object.keys(request.calc.calc).length : 0,
    hasCustomBody: request.body != null,
  };
}
