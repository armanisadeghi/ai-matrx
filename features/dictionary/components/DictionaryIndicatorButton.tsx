"use client";

// DictionaryIndicatorButton — the compact control for transcription/TTS surfaces
// that don't show the full dictionary. A dictionary icon with an active-entry
// count badge; clicking opens the DictionarySelectorWindow for this surface.
// The merged dictionary is resolved in the background so STT/TTS pick it up.

import { BookA } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useDictionaryContext } from "@/features/dictionary/hooks/useDictionaryContext";
import { useOpenDictionarySelectorWindow } from "@/features/overlays/openers/dictionarySelectorWindow";

interface Props {
  surfaceKey: string;
  className?: string;
  /** Visual size — "icon" (default) or "sm" with a label. */
  variant?: "icon" | "labeled";
}

export function DictionaryIndicatorButton({ surfaceKey, className, variant = "icon" }: Props) {
  // Mounting this subscribes the surface to its dictionary (resolves in bg).
  const { activeCount } = useDictionaryContext(surfaceKey);
  const openSelector = useOpenDictionarySelectorWindow();

  const onClick = () => openSelector({ surfaceKey });

  if (variant === "labeled") {
    return (
      <Button variant="outline" size="sm" className={cn("gap-1.5", className)} onClick={onClick}>
        <BookA className="h-4 w-4" />
        Dictionary
        {activeCount > 0 && (
          <span className="ml-0.5 rounded-full bg-primary/15 px-1.5 text-[11px] font-medium text-primary">
            {activeCount}
          </span>
        )}
      </Button>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn("relative h-8 w-8", className)}
          onClick={onClick}
          aria-label="Dictionary context"
        >
          <BookA className="h-4 w-4" />
          {activeCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground">
              {activeCount > 99 ? "99+" : activeCount}
            </span>
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {activeCount > 0
          ? `${activeCount} dictionary term${activeCount === 1 ? "" : "s"} active — click to change`
          : "Set dictionary context"}
      </TooltipContent>
    </Tooltip>
  );
}
