"use client";

// features/war-room/components/room/RoomResourcesButton.tsx
//
// Room-level resources: the header control that opens EVERYTHING attached to
// the war room itself (room-wide references — a data store every thread
// should see, the room's project docs…) as the canonical <AssociationList>
// over the room adapter. Threads have their own paperclip; this is the
// room-scope sibling.

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
import { WarRoomResourcesList } from "@/features/war-room/components/resources/WarRoomResourcesList";
import { useRoomResourcesAdapter } from "@/features/war-room/hooks/useThreadResourcesAdapter";
import { selectContentAssignmentsForRoom } from "@/features/war-room/redux/selectors";
import { cn } from "@/lib/utils";

export function RoomResourcesButton({
  sessionId,
  className,
}: {
  sessionId: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const count = useAppSelector(
    selectContentAssignmentsForRoom(sessionId),
  ).length;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Room resources — attached to the whole room"
        aria-label="Room resources"
        className={cn(
          "grid h-7 grid-flow-col place-items-center gap-1 rounded-md px-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
          className,
        )}
      >
        <Paperclip className="size-3.5" />
        {count > 0 && (
          <span className="text-[10px] font-medium tabular-nums">{count}</span>
        )}
      </button>
      {open && (
        <RoomResourcesSheet
          sessionId={sessionId}
          open={open}
          onOpenChange={setOpen}
        />
      )}
    </>
  );
}

function RoomResourcesSheet({
  sessionId,
  open,
  onOpenChange,
}: {
  sessionId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isMobile = useIsMobile();
  const adapter = useRoomResourcesAdapter(sessionId);
  const body = (
    <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin px-1 py-1">
      <WarRoomResourcesList adapter={adapter} variant="full" containerKind="room" />
    </div>
  );
  const subtitle =
    "Attached to the whole room — every thread's agent can see these.";

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="flex max-h-[85dvh] flex-col pb-safe">
          <DrawerHeader className="text-left">
            <DrawerTitle className="flex items-center gap-2">
              <Paperclip className="h-4 w-4 text-muted-foreground" />
              Room resources
            </DrawerTitle>
            <DrawerDescription>{subtitle}</DrawerDescription>
          </DrawerHeader>
          <div className="min-h-0 flex-1 px-2 pb-2 flex flex-col">{body}</div>
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
            Room resources
          </SheetTitle>
          <SheetDescription>{subtitle}</SheetDescription>
        </SheetHeader>
        {body}
      </SheetContent>
    </Sheet>
  );
}
