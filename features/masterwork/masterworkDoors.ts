// features/masterwork/masterworkDoors.ts
//
// THE MASTERWORK'S DOORS — one address for "open this Masterwork" and one for
// "open this run of it", for every Masterwork surface in the product.
//
// ## The screen this closes (cold walk 16, blocking defect A — 2026-09-21)
//
// A first-time Expert built a Rulebook, built a Masterwork from it, ran it
// once, and pressed the Rulebook's own **View all**. On the page that button
// opens (`/masterwork/<rulebook>/masterworks`) there were exactly two things
// to click, and both left the product:
//
//   * the name of her own Masterwork was
//     `<a href="https://workflows.aimatrx.com/workflows/<id>" target="_blank">`
//     — a DIFFERENT product on a DIFFERENT host, built for a workflow author;
//   * her finished run was `<a href="/workflows/runs/<id>">`, which lands on
//     the workflow engine console: "DONE · $0.61 · 16 of 16 steps · 1:43",
//     THE PLAN, LIVE ACTIVITY timing steps in milliseconds, and the controls
//     **Pause · Resume · Stop · Cancel now**.
//
// And the in-app `?run=` address on that page rendered 881 characters — the
// page without the run — because that page never grew the render leg.
//
// The correct screen already existed three inches away. Walk 13's N10 and walk
// 14's defect A had built it: `/masterwork/encore/<id>` renders the deliverable
// on a COLD load of `?run=<runId>`, through `OpenRunPanel` and the registered
// `masterwork_result` kind (commit 4d2a837bbd). ONE page got that fix; its
// sibling — the one the Rulebook's own button points at — did not.
//
// ## Why the addresses live here
//
// The instance was two hrefs typed on one page. The CLASS is that "where does
// a Masterwork open" was a string every surface spelled for itself, so a fix
// applied to one surface could not reach the others. There is now one spelling,
// and `features/masterwork/__tests__/masterwork-surfaces-open-in-the-product.test.tsx`
// fails if any Masterwork surface links to the engine console or to the
// workflow authoring host.
//
// `features/workflow-runtime/run-doors.ts` still owns the ENGINE's own doors,
// and they are right for the engine's own surfaces: an operator looking at a
// workflow run wants THE PLAN and Pause/Resume. They are the wrong doors for
// somebody looking at their own finished expert work, which is what these are.

/** The Masterwork, where the person who owns it reads and runs it. */
export function masterworkHref(masterworkId: string): string {
  return `/masterwork/encore/${masterworkId}`;
}

/**
 * ONE run of a Masterwork, open on the Masterwork's own page.
 *
 * `?run=` is a real address — linkable, bookmarkable, and rendered on a COLD
 * load, never only after a click (walk 14, defect A). It is the reason this
 * is a query parameter on the Masterwork rather than a page of its own.
 */
export function masterworkRunHref(
  masterworkId: string,
  runId: string,
): string {
  return `${masterworkHref(masterworkId)}?run=${runId}`;
}
