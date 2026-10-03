"use client";

/**
 * The phone presentation of a composer menu — the Claude iOS + sheet: a
 * bottom sheet whose root is the menu's rows as iOS inset groups, where every
 * cascade row pushes its panel as a page with an iOS nav bar (Back, centered
 * title). The rows are the SAME components the desktop popover renders
 * (ComposerMenu.tsx, "sheet" presentation) — never a phone copy.
 *
 * Back on a page asks the page first: an inside view (Notes → a folder) hands
 * its own Back to the sheet through PickerBackOverrideContext, so one Back
 * walks the whole depth before the stack pops.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { BottomSheet, BottomSheetHeader } from "@ai-matrx/design-system";
import { cn } from "@ai-matrx/design-system";
import { PickerBackOverrideContext } from "@host/features/resource-manager/resource-picker/ResourcePickerSubViewHeader";
import {
  ComposerMenuCloseAllContext,
  ComposerMenuPresentationContext,
  ComposerSheetNavContext,
  type ComposerSheetPage,
} from "./ComposerMenu";

export function ComposerMenuSheet({
  open,
  onOpenChange,
  title,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Root title; omit for the + sheet (Claude's has none). */
  title?: string;
  children: ReactNode;
}) {
  const [stack, setStack] = useState<ComposerSheetPage[]>([]);
  const pageBack = useRef<(() => void) | null>(null);
  const top = stack[stack.length - 1];
  // However the sheet closed (a pick, Escape, a swipe), it reopens at its root.
  useEffect(() => {
    if (!open) setStack([]);
  }, [open]);

  const pop = () => {
    pageBack.current = null;
    setStack((current) => current.slice(0, -1));
  };
  const push = (page: ComposerSheetPage) => {
    pageBack.current = null;
    setStack((current) => [...current, page]);
  };
  const back = () => (pageBack.current ? pageBack.current() : pop());
  const setOpen = (next: boolean) => onOpenChange(next);

  return (
    <BottomSheet
      open={open}
      onOpenChange={setOpen}
      size={top ? "full" : "adaptive"}
      surface="solid"
      contentClassName="bg-muted dark:bg-background"
    >
      <ComposerMenuPresentationContext.Provider value="sheet">
        <ComposerSheetNavContext.Provider value={{ push, pop }}>
          <ComposerMenuCloseAllContext.Provider value={() => setOpen(false)}>
            <PickerBackOverrideContext.Provider
              value={(fn) => {
                pageBack.current = fn;
              }}
            >
              {top ? (
                <BottomSheetHeader title={top.title} showBack onBack={back} />
              ) : title ? (
                <BottomSheetHeader title={title} />
              ) : null}
              <div
                key={stack.length}
                className={cn(
                  "flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2",
                  "motion-safe:animate-in motion-safe:fade-in",
                  top && "motion-safe:slide-in-from-right-6",
                )}
              >
                {top ? top.render() : children}
              </div>
            </PickerBackOverrideContext.Provider>
          </ComposerMenuCloseAllContext.Provider>
        </ComposerSheetNavContext.Provider>
      </ComposerMenuPresentationContext.Provider>
    </BottomSheet>
  );
}
