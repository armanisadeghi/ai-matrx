"use client";

// features/war-room/components/all/WarRoomThreadHitRow.tsx
//
// One cross-room thread search result — thread title is primary, parent War Room
// is always visible so you know exactly where to go (and whether a thread
// already exists before creating a duplicate).

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Loader2, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  roomColorOf,
  roomIconOf,
} from "@/features/war-room/components/room/roomIdentity";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectSessionById } from "@/features/war-room/redux/selectors";
import type { WarRoomSearchThreadHit } from "@/features/war-room/hooks/useWarRoomAllSearch";

export function WarRoomThreadHitRow({ hit }: { hit: WarRoomSearchThreadHit }) {
  const router = useRouter();
  const session = useAppSelector(selectSessionById(hit.sessionId));
  const [pending, startTransition] = useTransition();
  const RoomIcon = roomIconOf(session?.icon);
  const roomColor = roomColorOf(session?.color);
  const href = `/war-room/${hit.sessionId}?thread=${hit.threadId}`;

  return (
    <Link
      href={href}
      prefetch={false}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey) return;
        e.preventDefault();
        if (pending) return;
        startTransition(() => router.push(href));
      }}
      className={cn(
        "group relative flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5 pl-4",
        "transition-all hover:border-primary/40 hover:shadow-[var(--elevation-1)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
        pending && "opacity-70 pointer-events-none",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-0 left-0 w-1 rounded-l-xl",
          roomColor.swatch,
        )}
      />
      <span
        className={cn(
          "grid place-items-center size-8 shrink-0 rounded-lg",
          roomColor.tint,
          roomColor.text,
        )}
      >
        <MessageSquare className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground truncate">
          {hit.threadTitle}
        </p>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground min-w-0">
          <RoomIcon className="size-3 shrink-0" />
          <span className="truncate">{hit.roomTitle}</span>
          <span className="text-muted-foreground/50 shrink-0">·</span>
          <span className="shrink-0">Thread</span>
        </p>
      </div>
      {pending ? (
        <Loader2 className="size-4 shrink-0 animate-spin text-primary" />
      ) : (
        <ChevronRight className="size-4 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
      )}
    </Link>
  );
}
