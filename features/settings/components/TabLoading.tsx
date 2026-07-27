"use client";

import { Loader2 } from "lucide-react";

/**
 * Canonical settings-tab loading state — used as the `loading` option of every
 * `next/dynamic` settings tab (registry `lazyTab` + per-tab inner splits) and
 * as `SettingsTabHost`'s Suspense fallback, so the chunk-load spinner is
 * identical everywhere.
 */
export function TabLoading() {
  return (
    <div className="flex h-full items-center justify-center py-12">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );
}
