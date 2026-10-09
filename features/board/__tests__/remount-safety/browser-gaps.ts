/**
 * What jsdom lacks and every tile body assumes a browser has: ResizeObserver,
 * IntersectionObserver, matchMedia, scrollIntoView. Inert stand-ins — they
 * report nothing, which a tile treats like a box that has not been measured.
 * `fetch` and `XMLHttpRequest` are the recording ones (fake-backend.ts).
 */

import { FakeXMLHttpRequest, createObjectURL, fakeFetch, revokeObjectURL } from "./fake-backend";

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
  // jsdom's XMLHttpRequest makes REAL requests; nothing in this suite may reach a server.
  g.XMLHttpRequest = FakeXMLHttpRequest;
  if (typeof window !== "undefined") (window as unknown as Record<string, unknown>).XMLHttpRequest = FakeXMLHttpRequest;
  // jsdom's Blob has no text()/arrayBuffer(); FileReader reads it the browser way.
  Blob.prototype.text ??= function text(this: Blob) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(this);
    });
  };
  Blob.prototype.arrayBuffer ??= function arrayBuffer(this: Blob) {
    return new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(this);
    });
  };
  URL.createObjectURL = createObjectURL;
  URL.revokeObjectURL = revokeObjectURL;
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
    // A selection's geometry (the selection toolbar measures it): an unmeasured box, as for the observers.
    const emptyRect = { x: 0, y: 0, width: 0, height: 0, top: 0, right: 0, bottom: 0, left: 0, toJSON: () => ({}) };
    Range.prototype.getBoundingClientRect ??= () => emptyRect as DOMRect;
    Range.prototype.getClientRects ??= () => [] as unknown as DOMRectList;
  }
}
