"use client";

import { useState, type ReactNode } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import * as VisuallyHidden from "@radix-ui/react-visually-hidden";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/styles/themes/utils";
import type { GalleryTab, ModalShellFooter } from "../../types";
import { SegmentedControl } from "@ai-matrx/design-system/controls";

interface TabbedGalleryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: string;
  tabs: GalleryTab[];
  initialTabId?: string;
  toolbarSlot?: ReactNode;
  footer?: ModalShellFooter;
  className?: string;
}

export function TabbedGalleryModal({
  open,
  onOpenChange,
  title,
  subtitle,
  tabs,
  initialTabId,
  toolbarSlot,
  footer,
  className,
}: TabbedGalleryModalProps) {
  const [activeId, setActiveId] = useState<string>(
    initialTabId ?? tabs[0]?.id ?? "",
  );
  const active = tabs.find((t) => t.id === activeId) ?? tabs[0];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "max-w-none gap-0 border-border bg-card p-0",
          "h-[700px] w-[920px] overflow-hidden rounded-xl text-foreground shadow-2xl",
          className,
        )}
        style={{ backdropFilter: "none" }}
      >
        <VisuallyHidden.Root>
          <DialogTitle>{title}</DialogTitle>
        </VisuallyHidden.Root>

        <div className="flex h-full flex-col">
        <header className="flex shrink-0 items-center justify-between border-b border-border bg-card px-5 py-3">
          <div className="min-w-0">
            <h1 className="text-[22px] font-semibold text-foreground">
              {title}
            </h1>
            {subtitle ? (
              <div className="text-[12.5px] text-muted-foreground">
                {subtitle}
              </div>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <SegmentedControl aria-label="Gallery" value={activeId} onValueChange={setActiveId} data={tabs.map((tab) => ({ value: tab.id, label: tab.label }))} />
            {toolbarSlot ? <div className="ml-1">{toolbarSlot}</div> : null}
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-hidden">
          <ScrollArea className="h-full w-full">
            <div className="bg-background py-3">
              {active
                ? typeof active.content === "function"
                  ? active.content()
                  : active.content
                : null}
            </div>
          </ScrollArea>
        </div>

        <footer className="flex h-14 shrink-0 items-center justify-between border-t border-border bg-card px-5">
          <div className="text-[13px] text-muted-foreground">
            {countLabel(active)}
          </div>
          {footer ? (
            <button
              type="button"
              onClick={() => {
                footer.onPrimary?.();
                onOpenChange(false);
              }}
              className="rounded-md bg-emerald-500 px-4 py-1.5 text-[13px] font-medium text-white hover:bg-emerald-600"
            >
              {footer.primaryLabel}
            </button>
          ) : null}
        </footer>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function countLabel(tab?: GalleryTab): string {
  if (!tab) return "";
  if (typeof tab.count === "number") return `${tab.count} ${tab.label}`;
  return "";
}
