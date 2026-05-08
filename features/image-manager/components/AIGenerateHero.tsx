"use client";

/**
 * features/image-manager/components/AIGenerateHero.tsx
 *
 * Shared placeholder body for the AI Generate section. Used by both the
 * route shell and the legacy modal so the experience is identical
 * regardless of entry point.
 *
 * Phase 2.8 polish: a "Set defaults" action opens the user-preferences
 * overlay deep-linked to `ai.imageGeneration` (image-generation tab) so
 * the user can pre-configure model + style before AI gen lands.
 */

import { Settings, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppDispatch } from "@/lib/redux/hooks";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";

export function AIGenerateHero() {
  const dispatch = useAppDispatch();

  const handleOpenDefaults = () => {
    dispatch(
      openOverlay({
        overlayId: "userPreferencesWindow",
        data: { initialTabId: "ai.imageGeneration" },
      }),
    );
  };

  return (
    <div className="h-full flex items-start md:items-center justify-center overflow-y-auto overscroll-contain p-4 md:p-8">
      <div className="text-center max-w-md">
        <div className="mx-auto h-14 w-14 rounded-full bg-rose-500/10 text-rose-500 flex items-center justify-center mb-4">
          <Sparkles className="h-7 w-7" />
        </div>
        <h3 className="text-lg font-semibold text-foreground">
          AI Image Generation
        </h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Coming soon — describe an image in plain English and have it appear in
          your cloud, ready to use.
        </p>
        <div className="mt-5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleOpenDefaults}
          className="min-h-[44px] gap-1.5 md:min-h-0"
          >
            <Settings className="h-3.5 w-3.5" />
            Set generation defaults
          </Button>
        </div>
      </div>
    </div>
  );
}
