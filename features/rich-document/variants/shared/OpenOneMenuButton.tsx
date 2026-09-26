"use client";

// features/rich-document/variants/shared/OpenOneMenuButton.tsx
//
// THE ONE MENU (RC-B6): when this content already has its right-click menu,
// ⋯ opens THAT menu at the button (desktop dropdown or the phone's sheet)
// instead of drawing a second one beside it. Extracted from the retired
// OverflowMenu; the menu it opens moves onto the Alchemy engine in ALC-15 S3.

import * as React from "react";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  sameContentSource,
  useRegistryMenuSource,
} from "@/features/context-menu-v3/menu-presence";
import { openContextMenuForElement } from "@/features/context-menu-v3/utils/open-context-menu";
import type { ContentSource } from "../../types";

/** True when an ancestor right-click menu already carries this content. */
export function useOneMenuFor(source: ContentSource): boolean {
  return sameContentSource(useRegistryMenuSource(), source);
}

export function OpenOneMenuButton({
  className,
  ariaLabel = "More actions",
}: {
  className?: string;
  ariaLabel?: string;
}): React.ReactElement {
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  return (
    <Button
      ref={buttonRef}
      variant="ghost"
      size="icon"
      className={cn("h-8 w-8 p-0", className)}
      aria-label={ariaLabel}
      aria-haspopup="menu"
      onClick={() => openContextMenuForElement(buttonRef.current)}
    >
      <MoreHorizontal className="h-4 w-4" />
    </Button>
  );
}
