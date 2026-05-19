"use client";

/**
 * OverlayController — thin client shell.
 *
 * Statically importable from anywhere. The body
 * (`OverlayControllerImpl.tsx`) is ~2,300 lines with 111 per-overlay
 * `dynamic(() => import(...))` declarations and 222 `useAppSelector`
 * subscriptions. We MUST NOT parse that on every page boot — it
 * defeats the per-overlay code-splitting and pulls every overlay's
 * dependency graph (window-panel chrome, agent runtime types, file
 * handler, etc.) into the page's static graph.
 *
 * Pattern (mirrors the original `components/overlays/OverlayController.tsx`
 * shell + the legacy `UnifiedOverlayController`): outer shell stays
 * trivial; the Impl is `next/dynamic`-loaded so its parse cost lives
 * in its own client chunk. The 111 inner `dynamic()` calls inside
 * the Impl continue to split per-overlay chunks — they only run when
 * the Impl chunk has loaded, which only happens when the gate's
 * `selectAnyOverlayOpen` becomes true.
 *
 * Why a static import here would be a regression:
 *   1. Every authenticated page (and now every public page) imports
 *      DeferredSingletons / PublicProviders, which imports this file.
 *      A static import would pull the Impl into the page's main bundle
 *      whether or not any overlay ever opens.
 *   2. The Impl statically `import type`s prop types from across the
 *      codebase. Even with `import type`, TypeScript erases them but
 *      Next.js's bundle-analyzer reports inflated module ownership.
 *   3. With 111 inline `dynamic()` declarations parsed up-front, the
 *      build emits 111 + 1 chunks regardless of whether they're ever
 *      requested.
 *
 * Adding a new overlay is now a 3-touch change: add the overlayId, the
 * controller block in `OverlayControllerImpl.tsx`, and the opener file
 * under `openers/`. The shell here is unchanged.
 */

import dynamic from "next/dynamic";

const OverlayControllerImpl = dynamic(() => import("./OverlayControllerImpl"), {
  ssr: false,
  loading: () => null,
});

export default function OverlayController() {
  return <OverlayControllerImpl />;
}
