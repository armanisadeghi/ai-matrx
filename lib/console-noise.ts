// lib/console-noise.ts
//
// Suppress known dev-only React warnings emitted by specific third-party
// libraries we vendor but can't fix at the source. Every entry here must:
//
//   1. Match a precise React format-string (not a broad keyword).
//   2. Confirm the call originates inside the offending package by stack
//      inspection — never blanket-filter a warning that could legitimately
//      fire from our own code.
//   3. Carry a TODO with the package + version + a one-liner of what's
//      actually wrong, so the day the upstream fix lands we can delete the
//      entry without spelunking.
//
// React strips these dev-time `console.error` warnings from production
// bundles, so anything filtered here is dev-only noise.
//
// Two consumers:
//   - `installThirdPartyNoiseFilter()` wraps the global `console.error` once
//     to drop matching calls before they reach the dev overlay / DevTools.
//   - `isKnownThirdPartyNoise(args)` is a pure predicate that the admin
//     debug collector calls before forwarding to Redux, so the AdminIndicator
//     panel stays clean regardless of which wrapper landed on top.

const FILEROBOT_STACK_MARKERS = [
  "react-filerobot-image-editor",
  // The Filerobot bundle re-exports under a few internal paths — match the
  // package directory rather than any single file.
];

/**
 * Pure predicate. Given the variadic args passed to `console.error`, return
 * true iff this is a known, documented third-party dev warning we want to
 * swallow. Safe to call from anywhere — does not touch the console itself.
 */
export function isKnownThirdPartyNoise(args: readonly unknown[]): boolean {
  const [format, , attrName] = args;
  if (typeof format !== "string") return false;

  // TODO[2026-Q3]: react-filerobot-image-editor@5.0.1 spreads
  // `active={boolean}` onto a DOM <button> inside TabsResponsive /
  // TabsNavbar / HistoryButtons. React (dev) fires one of these on every
  // re-render. Remove this branch once Filerobot ships a build that omits
  // the prop or coerces it.
  if (
    format.includes("Received `%s` for a non-boolean attribute `%s`") &&
    attrName === "active"
  ) {
    if (stackOriginatesIn(FILEROBOT_STACK_MARKERS)) return true;
  }

  return false;
}

function stackOriginatesIn(markers: readonly string[]): boolean {
  // `new Error().stack` is "rich enough" in every browser we ship to — it
  // contains the compiled module path including `node_modules/<pkg>/…`. In
  // production these warnings are dead code, so we don't have to worry about
  // minified stacks losing the marker.
  const stack = new Error().stack;
  if (!stack) return false;
  for (const marker of markers) {
    if (stack.includes(marker)) return true;
  }
  return false;
}

let installed = false;

/**
 * Wrap `console.error` so calls matching `isKnownThirdPartyNoise` are dropped
 * before they hit the dev overlay. Idempotent — calling more than once is a
 * no-op. Safe to call from a `dynamic()` loader, a module top level, or an
 * effect; SSR-safe (no-op on the server).
 */
export function installThirdPartyNoiseFilter(): void {
  if (installed) return;
  if (typeof window === "undefined") return;
  installed = true;

  const original = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    if (isKnownThirdPartyNoise(args)) return;
    original(...args);
  };
}
