"use client";

// features/war-room/components/thread/ThreadResourcesSheet.tsx
//
// The 1-click resources surface for a thread: a paperclip+count button (lives
// in every thread header — grid tile and stage) opening the full
// ThreadResourcesTab in a right Sheet (desktop) / bottom Drawer (mobile).
// Associations stop being a buried tab — every thread shows what it holds and
// takes new attachments from anywhere, at any density.

import { useState } from "react";
import { Paperclip } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { selectContentAssignmentsForThread } from "@/features/war-room/redux/selectors";
import { ThreadResourcesTab } from "./ThreadResourcesTab";
import { cn } from "@/lib/utils";

export function ThreadResourcesButton({
  threadId,
  threadTitle,
  className,
}: {
  threadId: string;
  threadTitle?: string | null;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const count = useAppSelector(
    selectContentAssignmentsForThread(threadId),
  ).length;

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        title="Resources — everything attached to this thread"
        aria-label="Thread resources"
        className={cn(
          "grid size-6 shrink-0 grid-flow-col place-items-center gap-0.5 rounded-md px-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
          count > 0 && "w-auto",
          className,
        )}
      >
        <Paperclip className="size-3.5" />
        {count > 0 && (
          <span className="text-[10px] font-medium tabular-nums">{count}</span>
        )}
      </button>
      {open && (
        <ThreadResourcesSheet
          threadId={threadId}
          threadTitle={threadTitle}
          open={open}
          onOpenChange={setOpen}
        />
      )}
    </>
  );
}

export function ThreadResourcesSheet({
  threadId,
  threadTitle,
  open,
  onOpenChange,
}: {
  threadId: string;
  threadTitle?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isMobile = useIsMobile();
  const title = "Resources";
  const subtitle = threadTitle?.trim()
    ? `Everything attached to “${threadTitle.trim()}”`
    : "Everything attached to this thread";
  const body = (
    <div className="flex min-h-0 flex-1 flex-col">
      <ThreadResourcesTab threadId={threadId} />
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="flex max-h-[85dvh] flex-col pb-safe">
          <DrawerHeader className="text-left">
            <DrawerTitle className="flex items-center gap-2">
              <Paperclip className="h-4 w-4 text-muted-foreground" />
              {title}
            </DrawerTitle>
            <DrawerDescription>{subtitle}</DrawerDescription>
          </DrawerHeader>
          <div className="min-h-0 flex-1 px-2 pb-2">{body}</div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-2 sm:max-w-md"
      >
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Paperclip className="h-4 w-4 text-muted-foreground" />
            {title}
          </SheetTitle>
          <SheetDescription>{subtitle}</SheetDescription>
        </SheetHeader>
        {body}
      </SheetContent>
    </Sheet>
  );
}
