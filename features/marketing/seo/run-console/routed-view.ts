/**
 * THE ROUTED RESULT VIEW, shared by every host that gives the run console's
 * four result screens real routes.
 *
 * A host page mounts the console at `<base>` (This run) or at
 * `<base>/{proposals,unplaced,history}`, and the mount knows only its own
 * pathname — so the base comes back by removing the view segment the route
 * put on. Kept here rather than duplicated in each mount: the site tier and
 * the organization tier answer the same question.
 */
export function runConsoleBasePath(
  pathname: string,
  view: string | undefined,
): string {
  if (!view || view === "run") return pathname;
  return pathname.endsWith(`/${view}`)
    ? pathname.slice(0, -(view.length + 1))
    : pathname;
}
