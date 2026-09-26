/**
 * jest.setup.ts — polyfills applied before every test in the jsdom env.
 *
 * Why structuredClone? Dexie (warm-cache persistence tier) uses
 * `structuredClone` to clone values before storing them in IndexedDB. Modern
 * Node (17+) has it as a global, and real browsers have it, but the jsdom
 * test environment scrubs it off the test-local `globalThis`. Polyfilling
 * back to the Node global here so the Dexie wrapper runs unmodified.
 */

// Dummy Supabase env vars so `utils/supabase/client.ts` doesn't throw when
// tests transitively import code that instantiates the browser client at
// module load (e.g. Tools-grid selectors pull in modelRegistrySlice).
// Tests never hit real Supabase — mocks or fake-indexeddb stand in.
//
// Only the new sb_publishable_* env var is seeded here. The legacy
// NEXT_PUBLIC_SUPABASE_ANON_KEY is DEPRECATED and BANNED in this repo —
// see https://supabase.com/docs/guides/getting-started/api-keys
if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
}
if (!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
}

if (
  typeof (globalThis as { structuredClone?: unknown }).structuredClone !==
  "function"
) {
  // Node ≥17 ships a global `structuredClone`, but jsdom strips it from the
  // test-local `globalThis`. `v8.deserialize(v8.serialize(v))` gives us the
  // same semantics (HTML-structured-clone algorithm) without depending on
  // whatever node version is running — and is what Node's own polyfill does.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const v8 = require("node:v8") as {
    deserialize: (buf: Buffer) => unknown;
    serialize: (v: unknown) => Buffer;
  };
  (globalThis as { structuredClone?: <T>(v: T) => T }).structuredClone = <T>(
    v: T,
  ): T => v8.deserialize(v8.serialize(v)) as T;
}

/**
 * ── Immer MapSet: every test store behaves like the real store ───────────────
 *
 * `lib/redux/store.ts` calls `enableMapSet()`, so production reducers may read
 * `Map`/`Set` state inside drafts (the notes slice's `_dirtyFields` does). A test
 * that builds its own store without it throws INSIDE the reducer, and a caller
 * that catches the error reports a plain failure — on 2026-09-15 the War Room
 * rename test returned `false` for a rename that works in the app. Enabling it
 * once here makes that divergence impossible; the per-file calls that predate
 * this line are harmless (the plugin is idempotent).
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
(require("immer") as { enableMapSet: () => void }).enableMapSet();

/**
 * ── TextEncoder / TextDecoder ────────────────────────────────────────────────
 *
 * Node has had both as globals since 11; jsdom's test-local `globalThis` does
 * not, exactly as with `structuredClone` above. Any module that reaches for one
 * at IMPORT time therefore dies before a single test runs — `@ai-matrx/meet`'s
 * published bundle does (its base64/crypto helpers), which took down the whole
 * suite that renders `<MeetHost>` over the real package. Node's own
 * implementations are the honest answer; nothing here is a stub.
 */
if (typeof (globalThis as { TextEncoder?: unknown }).TextEncoder === "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const util = require("node:util") as {
    TextEncoder: typeof globalThis.TextEncoder;
    TextDecoder: typeof globalThis.TextDecoder;
  };
  Object.assign(globalThis, {
    TextEncoder: util.TextEncoder,
    TextDecoder: util.TextDecoder,
  });
}

/**
 * ── The WHATWG streams ───────────────────────────────────────────────────────
 *
 * Same class as `TextEncoder` above, one layer out: Node has had
 * `ReadableStream` / `WritableStream` / `TransformStream` as globals since 18,
 * jsdom's test-local `globalThis` carries none of them, and a package that
 * reaches for one at IMPORT time dies before a single test is collected.
 * `@zip.js/zip.js` does exactly that (`new TransformStream()` while building
 * its codec at module scope), so importing anything that can read a zip — the
 * vault's CSV-archive import, and therefore `VaultWorkspace` — took a whole
 * suite down with `ReferenceError: TransformStream is not defined`.
 *
 * `node:stream/web` ships the real WHATWG implementations. Nothing here is a
 * stub: a test that pipes bytes through one gets the same semantics a browser
 * gives it.
 */
if (
  typeof (globalThis as { TransformStream?: unknown }).TransformStream ===
  "undefined"
) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const webStreams = require("node:stream/web") as {
    ReadableStream: typeof globalThis.ReadableStream;
    WritableStream: typeof globalThis.WritableStream;
    TransformStream: typeof globalThis.TransformStream;
  };
  for (const name of [
    "ReadableStream",
    "WritableStream",
    "TransformStream",
  ] as const) {
    if (typeof (globalThis as Record<string, unknown>)[name] === "undefined") {
      (globalThis as Record<string, unknown>)[name] = webStreams[name];
    }
  }
}

/**
 * ── THE TOP-LAYER PSEUDO-CLASSES ARE ANSWERED HERE, NOT BY nwsapi ────────────
 *
 * MEASURED, not guessed: opening ONE Radix popover (`ColumnHeaderCell`'s
 * sort/filter menu) took 12–17 SECONDS in this environment and blew every
 * 5s test timeout. A CPU profile put ~90% of the time inside nwsapi's
 * selector engine, and counting `Element.matches` calls showed the shape of
 * it: 32k calls for `:modal` produced **37 MILLION** calls for `:fullscreen`.
 *
 * The cause is a recursion, in nwsapi 2.2.27 (jsdom 30's engine). jsdom has
 * no native selector engine, so `Element.matches` IS nwsapi — and nwsapi's
 * `isModal()`/`isFullscreen()` ask for the "native" state by calling
 * `node.matches(':modal')` / `node.matches(':fullscreen')`, which re-enters
 * nwsapi and asks again, exponentially. @floating-ui's `isTopLayer()` calls
 * `matches(':modal')` and `matches(':popover-open')` on every element it
 * positions, so every popper, dropdown, select, tooltip and context menu in
 * the repo pays that cost.
 *
 * Answering the three top-layer pseudo-classes directly is not a stub of
 * anything the DOM would otherwise tell us: jsdom implements NO top layer —
 * no fullscreen element, no `showModal()` top-layer state, no popover
 * showing state — so `false` is the honest answer for all three, and it is
 * the same answer nwsapi is trying (and failing) to compute. Every other
 * selector still goes to the real engine.
 *
 * Effect on the measured case: 12,107ms → 61ms.
 *
 * Guarded on `Element` existing: this setup file also runs for every
 * `@jest-environment node` suite, where there is no DOM at all and touching
 * `Element.prototype` throws before a single test can be collected.
 */
if (typeof Element !== "undefined") {
  const TOP_LAYER_PSEUDO = /^\s*:(modal|fullscreen|popover-open)\s*$/;
  const nativeMatches = Element.prototype.matches;
  // `defineProperty` rather than assignment: `Element.prototype.matches` is
  // declared as overloaded TYPE PREDICATES (`selectors: K` narrows `this`), and
  // a plain `(selectors: string) => boolean` cannot be assigned to it without a
  // cast. The descriptor keeps the runtime shape identical and the types honest.
  Object.defineProperty(Element.prototype, "matches", {
    configurable: true,
    writable: true,
    value: function (this: Element, selectors: string): boolean {
      if (typeof selectors === "string" && TOP_LAYER_PSEUDO.test(selectors)) {
        return false;
      }
      return nativeMatches.call(this, selectors);
    },
  });
}

/**
 * ── window.matchMedia: jsdom has none; every browser does ────────────────────
 *
 * jsdom implements no `matchMedia`, so any component that reads a media query
 * (`useIsMobile` → `ContextMenuV3`, the panels, the tables) died with
 * "window.matchMedia is not a function" — 2026-09-26 the model context panel's
 * organization suite, the day ContextMenuV3 adopted `useIsMobile`. 73 suites had
 * each hand-stubbed it; the next component to read a query broke the rest.
 *
 * The answer is the one a browser at jsdom's viewport gives: width queries
 * (`min-width` / `max-width`, px, joined by `and`) are evaluated against
 * `window.innerWidth` (1024 in jsdom — a desktop), everything else
 * (`prefers-color-scheme: dark`, `prefers-reduced-motion`, `hover`) does not
 * match. Defined configurable + writable and only when absent, so a suite that
 * sets its own (a phone, a dark scheme) still wins and restores cleanly.
 */
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  const widthQueryMatches = (query: string): boolean => {
    const parts = query.toLowerCase().split(/\s+and\s+/);
    let sawWidth = false;
    for (const part of parts) {
      const m = /\(\s*(min|max)-width\s*:\s*([\d.]+)px\s*\)/.exec(part);
      if (!m) return false;
      sawWidth = true;
      const px = Number(m[2]);
      if (m[1] === "min" ? window.innerWidth < px : window.innerWidth > px) return false;
    }
    return sawWidth;
  };
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string): MediaQueryList =>
      ({
        matches: widthQueryMatches(query),
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList,
  });
}
