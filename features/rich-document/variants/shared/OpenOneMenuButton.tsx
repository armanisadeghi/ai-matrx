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
  contentSourceKey,
  sameContentSource,
  useRegistryMenuSource,
} from "@/features/context-menu-v3/menu-presence";
import { openContextMenuForElement } from "@/features/context-menu-v3/utils/open-context-menu";

/**
 * The right-click trigger that carries this content, nearest the button: a bar
 * renders BESIDE its content (a note preview), so the plain bubbling path would
 * open an outer menu (the editor's) instead of the content's own.
 */
function contentTriggerFor(button: HTMLElement, source: ContentSource): HTMLElement {
  const key = contentSourceKey(source);
  const carries = (el: Element) => el.getAttribute("data-content-source") === key;
  const selector = '[data-alchemy-trigger="context"][data-content-source]';
  for (let node: HTMLElement | null = button; node; node = node.parentElement) {
    if (node.matches(selector) && carries(node)) return node;
    const hit = [...node.querySelectorAll<HTMLElement>(selector)].find(carries);
    if (hit) return hit;
  }
  return button;
}
import type { ContentSource } from "../../types";

/** True when an ancestor right-click menu already carries this content. */
export function useOneMenuFor(source: ContentSource): boolean {
  return sameContentSource(useRegistryMenuSource(), source);
}

export function OpenOneMenuButton({
  source,
  className,
  ariaLabel = "More actions",
}: {
  source: ContentSource;
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
      onClick={() => {
        const button = buttonRef.current;
        if (!button) return;
        const trigger = contentTriggerFor(button, source);
        if (trigger === button) {
          openContextMenuForElement(button);
          return;
        }
        // Open the content's menu AT the button.
        const rect = button.getBoundingClientRect();
        trigger.dispatchEvent(
          new MouseEvent("contextmenu", {
            bubbles: true,
            cancelable: true,
            view: window,
            button: 2,
            buttons: 2,
            clientX: rect.left + rect.width / 2,
            clientY: rect.bottom,
          }),
        );
      }}
    >
      <MoreHorizontal className="h-4 w-4" />
    </Button>
  );
}
