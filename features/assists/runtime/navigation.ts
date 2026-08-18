/**
 * Resolve an assist's route against the deployment profile that owns it.
 *
 * The production app is split across main, admin, and demos origins. Sending a
 * route that the current build does not contain through Next's client router
 * makes it fetch an RSC payload from the wrong host, follow a cross-origin
 * redirect, and log a recoverable fetch error before falling back to a document
 * navigation. Resolve that host boundary before Next sees the route.
 */

export type AssistNavigationTarget =
  { kind: "router"; href: string } | { kind: "document"; href: string };

interface AssistNavigationConfig {
  profile: string;
  currentOrigin: string;
  mainOrigin: string;
  adminOrigin: string;
  demosOrigin: string;
}

const ADMIN_PROFILES = new Set(["full", "core", "admin"]);
const DEMOS_PROFILES = new Set(["full", "user", "demos"]);

function isSurfacePath(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function resolveAssistNavigation(
  href: string,
  config: AssistNavigationConfig,
): AssistNavigationTarget {
  const requested = new URL(href, config.currentOrigin);

  // An explicit external URL keeps its declared destination. It still needs a
  // document navigation; Next's router is only for the current application.
  if (/^https?:\/\//i.test(href) && requested.origin !== config.currentOrigin) {
    return { kind: "document", href: requested.toString() };
  }

  let target = requested;
  if (
    isSurfacePath(requested.pathname, "/administration") &&
    !ADMIN_PROFILES.has(config.profile)
  ) {
    target = new URL(
      `${requested.pathname}${requested.search}${requested.hash}`,
      config.adminOrigin,
    );
  } else if (
    isSurfacePath(requested.pathname, "/demos") &&
    !DEMOS_PROFILES.has(config.profile)
  ) {
    target = new URL(
      `${requested.pathname}${requested.search}${requested.hash}`,
      config.demosOrigin,
    );
  } else if (
    config.profile === "admin" &&
    !isSurfacePath(requested.pathname, "/administration")
  ) {
    target = new URL(
      `${requested.pathname}${requested.search}${requested.hash}`,
      config.mainOrigin,
    );
  } else if (
    config.profile === "demos" &&
    !isSurfacePath(requested.pathname, "/demos")
  ) {
    target = new URL(
      `${requested.pathname}${requested.search}${requested.hash}`,
      config.mainOrigin,
    );
  }

  if (target.origin !== config.currentOrigin) {
    return { kind: "document", href: target.toString() };
  }
  return { kind: "router", href };
}
