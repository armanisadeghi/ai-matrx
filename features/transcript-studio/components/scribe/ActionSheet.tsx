"use client";

/**
 * ActionSheet — a controlled bottom sheet of tappable actions.
 *
 * One pattern for "more actions" across the studio (session menu, recording
 * card overflow). Works on touch and desktop (vaul drawer). Driven entirely by
 * an items array so callers just describe the actions.
 */

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";

export interface ActionSheetItem {
  key: string;
  label: string;
  icon?: ReactNode;
  description?: string;
  destructive?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

interface ActionSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  items: ActionSheetItem[];
  /** Extra classes for the drawer content (e.g. a min-height for tall menus). */
  contentClassName?: string;
}

export function ActionSheet({
  open,
  onOpenChange,
  title,
  items,
  contentClassName,
}: ActionSheetProps) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className={cn("mx-auto max-w-lg", contentClassName)}>
        <DrawerHeader className="pb-2 text-left">
          <DrawerTitle className="text-base">{title ?? "Actions"}</DrawerTitle>
        </DrawerHeader>
        <div className="flex flex-col gap-1 px-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              disabled={item.disabled}
              onClick={() => {
                onOpenChange(false);
                item.onSelect();
              }}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-3 text-left text-sm transition-colors active:bg-accent disabled:opacity-50",
                item.destructive ? "text-destructive" : "text-foreground",
              )}
            >
              {item.icon && (
                <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                  {item.icon}
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{item.label}</span>
                {item.description && (
                  <span className="block text-xs text-muted-foreground">
                    {item.description}
                  </span>
                )}
              </span>
            </button>
          ))}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
