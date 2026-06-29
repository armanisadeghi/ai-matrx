"use client";

import dynamic from "next/dynamic";
import { useIdleReady } from "@/utils/idle-scheduler";

// NOTE: Voice-pad-slice overlays (`voicePad`, `voicePadAdvanced`, `transcriptionCleanup`)
// are mounted exclusively by the unified window registry now. The legacy
// <VoicePadWrapper /> mount used to live here and double-rendered every
// open voice-pad instance because the registry was already mounting it.
// Do NOT add a wrapper here — register the overlay in
// `windowRegistry.ts` + `windowRegistryMetadata.ts` and let
// `UnifiedOverlayController` handle it. (Bug found 2026-04-29.)
//
// Messaging islands (LazyMessagingInitializer + MessagingSideSheet) used to
// mount here, which left the (authenticated) route group without messaging
// (icon click did nothing, conversations never loaded). They now mount in
// `app/DeferredSingletons.tsx` via `LazyMessagingIsland` so they work on
// every authenticated route.

const CanvasSideSheetInner = dynamic(
  () =>
    import("@/features/canvas/core/CanvasSideSheetInner").then(
      (m) => m.CanvasSideSheetInner,
    ),
  { ssr: false, loading: () => null },
);

const WindowTraySync = dynamic(
  () => import("@/features/window-panels/WindowTraySync"),
  { ssr: false, loading: () => null },
);

export default function DeferredIslands() {
  const ready = useIdleReady();

  if (!ready) return null;

  return (
    <>
      <CanvasSideSheetInner />
      <WindowTraySync />
    </>
  );
}
