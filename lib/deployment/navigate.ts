/**
 * lib/deployment/navigate.ts — the programmatic half of the link door.
 *
 * `router.push("/administration/…")` from a build that does not compile
 * `(admin)` fails exactly the way a `<Link>` prefetch does: an RSC `fetch()`
 * into a cross-origin redirect. Route a push through here and a path this build
 * cannot serve becomes a document navigation to the deployment that can.
 * See `lib/deployment/surfaces.ts` for the defect this closes.
 */

import { crossDeploymentHref } from "@/lib/deployment/surfaces";

/** Just enough of Next's router for this to be testable without one. */
export interface PushableRouter {
  push: (href: string, options?: NavigateOptions) => void;
  replace: (href: string, options?: NavigateOptions) => void;
}

/**
 * Next's router options. They are deliberately DROPPED when the destination is
 * another origin — `scroll` and friends describe a client-side transition, and
 * a document navigation has none to describe.
 */
export interface NavigateOptions {
  scroll?: boolean;
}

/**
 * How this module leaves the origin. Named rather than inlined because jsdom
 * makes `window.location` non-writable, so a guard cannot otherwise observe
 * that a foreign push became a DOCUMENT navigation instead of a router call —
 * and that is the whole assertion worth making here.
 */
export const documentNavigation = {
  assign: (url: string) => window.location.assign(url),
  replace: (url: string) => window.location.replace(url),
};

function leave(url: string, replace: boolean) {
  if (typeof window === "undefined") return;
  if (replace) documentNavigation.replace(url);
  else documentNavigation.assign(url);
}

/** `router.push`, but a foreign surface leaves the origin instead. */
export function pushAppHref(
  router: PushableRouter,
  href: string,
  options?: NavigateOptions,
): void {
  const external = crossDeploymentHref(href);
  if (external) leave(external, false);
  else router.push(href, options);
}

/** `router.replace`, with the same boundary rule. */
export function replaceAppHref(
  router: PushableRouter,
  href: string,
  options?: NavigateOptions,
): void {
  const external = crossDeploymentHref(href);
  if (external) leave(external, true);
  else router.replace(href, options);
}
