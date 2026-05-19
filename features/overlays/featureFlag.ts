"use client";

/**
 * Feature flag for the new explicit OverlayController.
 *
 * The flag is read from three sources, first match wins:
 *   1. URL param `?newOverlayController=1`  (per-tab dev override)
 *   2. localStorage `matrx_new_overlay_controller = "1"`  (sticky dev opt-in)
 *   3. Env var `NEXT_PUBLIC_USE_NEW_OVERLAY_CONTROLLER=1`  (preview/prod cutover)
 *
 * Same logic is used by both `app/DeferredSingletons.tsx` (authenticated
 * routes) and `app/(public)/PublicProviders.tsx` (public routes) so flipping
 * the env var promotes the new controller everywhere uniformly.
 *
 * After the cutover is complete the flag is removed and the new controller
 * mounts unconditionally; the rollback path is removing the env var (or
 * setting it to `"0"`) and redeploying.
 */

export type OverlayControllerFlagSource =
  | "url"
  | "localStorage"
  | "env"
  | "default";

export interface OverlayControllerFlagResult {
  useNew: boolean;
  source: OverlayControllerFlagSource;
}

export function readOverlayControllerFlag(): OverlayControllerFlagResult {
  if (typeof window === "undefined") {
    return {
      useNew: process.env.NEXT_PUBLIC_USE_NEW_OVERLAY_CONTROLLER === "1",
      source: "env",
    };
  }
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get("newOverlayController") === "1") {
      return { useNew: true, source: "url" };
    }
    if (
      window.localStorage?.getItem("matrx_new_overlay_controller") === "1"
    ) {
      return { useNew: true, source: "localStorage" };
    }
  } catch {
    // ignore — fall through to env / default
  }
  if (process.env.NEXT_PUBLIC_USE_NEW_OVERLAY_CONTROLLER === "1") {
    return { useNew: true, source: "env" };
  }
  return { useNew: false, source: "default" };
}
