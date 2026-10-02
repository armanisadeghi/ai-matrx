"use client";

import dynamic from "next/dynamic";

// NOTE: Voice-pad-slice overlays (`voicePad`, `voicePadAdvanced`, `transcriptionCleanup`)
// are mounted exclusively by the unified window registry now. The legacy
// <VoicePadWrapper /> mount used to live here and double-rendered every
// open voice-pad instance because the registry was already mounting it.
// Do NOT add a wrapper here — register the overlay in
// `windowRegistry.ts` + `windowRegistryMetadata.ts` and let
// `UnifiedOverlayController` handle it. (Bug found 2026-04-29.)

// ⌘K "Search your knowledge" — a keydown listener and the overlay opener,
// nothing else. The bar itself loads behind the overlay controller's single
// lazy edge the first time it opens.
import CommandBarHotkey from "@/features/knowledge/command-bar/CommandBarHotkey";

const WindowTraySync = dynamic(
  () => import("@/features/window-panels/WindowTraySync"),
  { ssr: false, loading: () => null },
);

export default function DeferredIslands() {
  return (
    <>
      {/* Window geometry must listen before idle work: a viewport can shrink
          while the shell is still settling, and an open footer must remain
          reachable even if no later resize event occurs. */}
      <WindowTraySync />
      <CommandBarHotkey />
    </>
  );
}
