/**
 * THE RUN'S DOOR — one address for "open this run", for every surface.
 *
 * ── THE DEFECT THIS CLOSES (Expert Book Challenge wall W36, 2026-09-12) ────
 * A finished run's answer had no home a reader could reach. The run permalink
 * `/workflows/runs/{runId}` has existed in THIS app all along and rebuilds a
 * completed run from the durable event log — the showcase, the deliverables,
 * the honest failure card, all of it. But every surface that listed runs for a
 * person sent them to `https://workflows.aimatrx.com/runs/{id}` instead: a
 * DIFFERENT host, in a new tab, built for the workflow author. A parent who
 * closed the tab, or Arman opening yesterday's run, could not read the answer
 * anywhere in the product they were standing in.
 *
 * So the address stops being retyped per surface. `runHref` is the in-app
 * permalink and `workflowRunsHref` is one workflow's own history; both are
 * same-origin, so they are `<Link>`s that navigate in place rather than
 * `target="_blank"` escapes into another app.
 *
 * The AUTHORING doors (the Studio's design surface) are a different product
 * and deliberately not in this file.
 */

/** The in-app permalink for one run — the page that renders what it produced. */
export function runHref(runId: string): string {
  return `/workflows/runs/${runId}`;
}

/** One workflow's own run history, in this app. */
export function workflowRunsHref(definitionId: string): string {
  return `/workflows/${definitionId}/runs`;
}
