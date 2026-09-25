/**
 * A faithful model of the two things Next's App Router does with history, for
 * tests that must tell a real query write from a stale one (lane URL-STATE).
 *
 * 1. The history PATCH (next/dist/client/components/app-router.js, 16.4):
 *    `pushState` / `replaceState` called with a state object carrying `__NA`
 *    (or `_N`) go straight through — Next assumes it wrote them itself. Any
 *    other state has Next's tree copied onto it and dispatches `restore(url)`,
 *    which is what moves `useSearchParams` / `usePathname`.
 * 2. The router's own URL — what `useSearchParams` / `usePathname` return. It
 *    changes on `restore` (and on popstate), never because `window.location`
 *    moved behind its back.
 *
 * `useRouter()` is a recorder: every call on it is a NAVIGATION (a `?_rsc=`
 * server round trip in the real app), and the tests count them.
 */
import { useSyncExternalStore } from "react";

type Listener = () => void;
const listeners = new Set<Listener>();
let routerHref = "/";
let uninstall: (() => void) | null = null;

export const navigations: string[] = [];

export const recordingRouter = {
  replace: (href: string) => void navigations.push(`replace ${href}`),
  push: (href: string) => void navigations.push(`push ${href}`),
  refresh: () => void navigations.push("refresh"),
  prefetch: () => undefined,
  back: () => undefined,
  forward: () => undefined,
};

function restore(url: string) {
  const next = new URL(url, window.location.href);
  routerHref = `${next.pathname}${next.search}${next.hash}`;
  listeners.forEach((l) => l());
}

/** Install the patch and put Next's own `__NA` entry on the current page. */
export function installNextHistoryModel(initialHref: string): void {
  uninstall?.();
  navigations.length = 0;
  const originalPush = window.history.pushState.bind(window.history);
  const originalReplace = window.history.replaceState.bind(window.history);
  // Next's own entry for the page the person landed on.
  originalReplace({ __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: ["tree"] }, "", initialHref);
  routerHref = initialHref;

  const copy = (data: unknown) => {
    const out = (data ?? {}) as Record<string, unknown>;
    const current = window.history.state as Record<string, unknown> | null;
    if (current?.__NA) out.__NA = current.__NA;
    if (current?.__PRIVATE_NEXTJS_INTERNALS_TREE) {
      out.__PRIVATE_NEXTJS_INTERNALS_TREE = current.__PRIVATE_NEXTJS_INTERNALS_TREE;
    }
    return out;
  };
  window.history.pushState = function pushState(data, unused, url) {
    const d = data as { __NA?: unknown; _N?: unknown } | null;
    if (d?.__NA || d?._N) return originalPush(data, unused, url);
    const withTree = copy(data);
    if (url) restore(String(url));
    return originalPush(withTree, unused, url);
  };
  window.history.replaceState = function replaceState(data, unused, url) {
    const d = data as { __NA?: unknown; _N?: unknown } | null;
    if (d?.__NA || d?._N) return originalReplace(data, unused, url);
    const withTree = copy(data);
    if (url) restore(String(url));
    return originalReplace(withTree, unused, url);
  };
  uninstall = () => {
    window.history.pushState = originalPush;
    window.history.replaceState = originalReplace;
    uninstall = null;
  };
}

export function uninstallNextHistoryModel(): void {
  uninstall?.();
}

/** What Next's `useSearchParams()` returns right now (outside React). */
export function routerSearch(): URLSearchParams {
  return new URLSearchParams(new URL(routerHref, "http://x").search);
}
export function routerPathname(): string {
  return new URL(routerHref, "http://x").pathname;
}

function subscribe(l: Listener) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** The `next/navigation` module as the model sees it — hand it to jest.mock. */
export const nextNavigationModel = {
  useRouter: () => recordingRouter,
  useSearchParams: () => {
    const href = useSyncExternalStore(subscribe, () => routerHref, () => routerHref);
    return new URLSearchParams(new URL(href, "http://x").search);
  },
  usePathname: () => {
    const href = useSyncExternalStore(subscribe, () => routerHref, () => routerHref);
    return new URL(href, "http://x").pathname;
  },
  useParams: () => ({}),
};
