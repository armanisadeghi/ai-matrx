const ADMIN_ORIGIN = "https://manage.aimatrx.com";

export interface ReviewTargetPageDisplay {
  href: string;
  label: string;
}

/**
 * Presents admin-app destinations as routes and external destinations as
 * host + route, while preserving a fully qualified href for navigation and
 * hover disclosure.
 */
export function reviewTargetPageDisplay(
  target: string,
): ReviewTargetPageDisplay {
  try {
    const url = new URL(target, ADMIN_ORIGIN);
    const route = `${url.pathname}${url.search}${url.hash}`;
    return {
      href: url.href,
      label:
        url.origin === ADMIN_ORIGIN
          ? route
          : `${url.hostname}${url.port ? `:${url.port}` : ""}${route}`,
    };
  } catch {
    return { href: target, label: target };
  }
}
