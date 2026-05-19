"use client";

import React, { useState } from "react";
import dynamic from "next/dynamic";
import { Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ResourcePickerMenu } from "./ResourcePickerMenu";
import type { WindowPosition } from "@/features/window-panels/hooks/useWindowPanel";

// Lazy-loaded: the window component (with its WindowPanel chrome + every
// resource-picker tab) is its own chunk, only fetched when `useWindowMode`
// is true AND the user actually opens it. Was a static import — that
// dragged the entire window-panel chunk graph into this button's bundle.
// TODO(overlay-overhaul): once a callback-aware opener exists for
// resourcePickerWindow (currently the generated opener passes
// `onResourceSelected` through Redux as a function, which doesn't work),
// migrate this to `useOpenResourcePickerWindow()` and delete this dynamic.
const ResourcePickerWindow = dynamic(
  () =>
    import("@/features/window-panels/windows/ResourcePickerWindow").then(
      (m) => ({ default: m.ResourcePickerWindow }),
    ),
  { ssr: false },
);

interface ResourcePickerButtonProps {
  onResourceSelected?: (resource: any) => void;
  attachmentCapabilities?: {
    supportsImageUrls?: boolean;
    supportsFileUrls?: boolean;
    supportsYoutubeVideos?: boolean;
    supportsAudio?: boolean;
  };
  /** When true, opens as a floating WindowPanel instead of a popover. Default: false. */
  useWindowMode?: boolean;
  windowPosition?: WindowPosition;
}

export function ResourcePickerButton({
  onResourceSelected,
  attachmentCapabilities,
  useWindowMode = false,
  windowPosition = "center",
}: ResourcePickerButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  const trigger = (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 w-7 p-0 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
      tabIndex={-1}
      title="Add resource"
      onClick={useWindowMode ? () => setIsOpen(true) : undefined}
    >
      <Database className="w-3.5 h-3.5" />
    </Button>
  );

  if (useWindowMode) {
    return (
      <>
        {trigger}
        <ResourcePickerWindow
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
          onResourceSelected={(resource) => {
            onResourceSelected?.(resource);
            setIsOpen(false);
          }}
          attachmentCapabilities={attachmentCapabilities}
          position={windowPosition}
        />
      </>
    );
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen} modal={false}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        className="w-80 p-0 border-gray-300 dark:border-gray-700 z-[200]"
        align="start"
        side="top"
        sideOffset={8}
      >
        <ResourcePickerMenu
          onResourceSelected={(resource) => {
            onResourceSelected?.(resource);
            setIsOpen(false);
          }}
          onClose={() => setIsOpen(false)}
          attachmentCapabilities={attachmentCapabilities}
        />
      </PopoverContent>
    </Popover>
  );
}
