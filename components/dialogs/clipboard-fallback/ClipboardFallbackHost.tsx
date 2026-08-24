/**
 * components/dialogs/clipboard-fallback/ClipboardFallbackHost.tsx
 *
 * Slim client shell + public entry point for the global manual-copy
 * dialog — the exact sibling of `ConfirmDialogHost.tsx`. Statically
 * importable from anywhere without pulling the dialog markup into the
 * static graph; the heavy body lives in `ClipboardFallbackHostImpl.tsx`
 * and loads via `next/dynamic({ ssr: false })`.
 *
 *   1. Re-exports the imperative API (`showManualCopy`) from
 *      `manualCopyOpener.ts` (pure TS, costs nothing to import).
 *   2. Renders `<ClipboardFallbackHost />` once in `app/Providers.tsx`,
 *      beside `<ConfirmDialogHost />`, so a blocked clipboard anywhere
 *      in the app always has a live host to fall back to.
 */

"use client";

import dynamic from "next/dynamic";

export { showManualCopy } from "./manualCopyOpener";
export type { ManualCopyOptions } from "./manualCopyOpener";

const ClipboardFallbackHostImpl = dynamic(
  () => import("./ClipboardFallbackHostImpl"),
  { ssr: false, loading: () => null },
);

export function ClipboardFallbackHost() {
  return <ClipboardFallbackHostImpl />;
}
