// lib/console-noise.ts
//
// Suppress known dev-only React warnings emitted by specific third-party
// libraries we vendor but can't fix at the source. Every entry here must:
//
//   1. Match a precise format-string (not a broad keyword).
//   2. Constrain by something that proves third-party origin — a signature no
//      first-party code produces (e.g. a styled-components-only phrase, given
//      we never import styled-components) or an allowlist of the exact
//      prop/attribute names the vendored package leaks — so a warning that
//      could legitimately fire from our own code is never blanket-filtered.
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

// TODO[2026-Q3]: react-filerobot-image-editor@5.0.1 is built on
// styled-components v6 and spreads a fixed set of its own component props
// (sideBarType, showTabsDrawer, isPhoneScreen, …) straight onto DOM nodes.
// styled-components fires "unknown prop … sent through to the DOM" and React
// follows up with "does not recognize the `%s` prop" / "Received `%s` for a
// non-boolean attribute". This is the complete prop allowlist observed from
// the Filerobot bundle. We match against the allowlist (not a blanket filter)
// so an accidental unknown prop from OUR code still surfaces. Delete this set
// once Filerobot ships a build that stops leaking these props.
const FILEROBOT_LEAKED_DOM_PROPS = new Set([
  "active",
  "anchorOrigin",
  "autoHideDuration",
  "buttonType",
  "error",
  "hasChildren",
  "isPhoneScreen",
  "message",
  "noMargin",
  "showBackButton",
  "showTabsDrawer",
  "sideBarType",
  "status",
]);

/**
 * Pure predicate. Given the variadic args passed to `console.error`, return
 * true iff this is a known, documented third-party dev warning we want to
 * swallow. Safe to call from anywhere — does not touch the console itself.
 */
export function isKnownThirdPartyNoise(args: readonly unknown[]): boolean {
  const [format, arg1, arg2] = args;
  if (typeof format !== "string") return false;

  // styled-components v6 unknown-prop warning. The exact phrase
  // "is being sent through to the DOM" is emitted ONLY by styled-components,
  // and NO workspace code imports styled-components — it exists solely as a
  // transitive dep of vendored packages (Filerobot, react-live, react-dropzone).
  // So any occurrence is third-party noise we can't fix at the source.
  if (
    format.includes("it looks like an unknown prop") &&
    format.includes("is being sent through to the DOM")
  ) {
    return true;
  }

  // React: "React does not recognize the `%s` prop on a DOM element." → the
  // offending prop name is the first interpolated arg. Restrict to Filerobot's
  // known leaked props so our own typos still surface.
  if (
    format.includes("does not recognize the `%s` prop on a DOM element") &&
    typeof arg1 === "string" &&
    FILEROBOT_LEAKED_DOM_PROPS.has(arg1)
  ) {
    return true;
  }

  // React: "Received `%s` for a non-boolean attribute `%s`." → value is arg1,
  // attribute name is arg2. Same Filerobot allowlist guard.
  if (
    format.includes("Received `%s` for a non-boolean attribute `%s`") &&
    typeof arg2 === "string" &&
    FILEROBOT_LEAKED_DOM_PROPS.has(arg2)
  ) {
    return true;
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
