/**
 * What jsdom lacks and every tile body assumes a browser has: ResizeObserver,
 * IntersectionObserver, matchMedia, scrollIntoView. Inert stand-ins — they
 * report nothing, which a tile treats like a box that has not been measured.
 * `fetch` is the recording one (fake-backend.ts).
 */

import { fakeFetch } from "./fake-backend";

class InertObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

export function installBrowserGaps(): void {
  const g = globalThis as Record<string, unknown>;
  g.ResizeObserver ??= InertObserver;
  g.IntersectionObserver ??= InertObserver;
  g.fetch = fakeFetch;
  if (typeof window !== "undefined") {
    window.matchMedia ??= ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
    Element.prototype.scrollIntoView ??= function scrollIntoView() {};
    Element.prototype.scrollTo ??= function scrollTo() {};
  }
}
