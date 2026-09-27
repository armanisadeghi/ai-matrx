"use client";

// features/meet/components/manage/MeetingRowMenu.tsx
//
// EVERYTHING YOU DO WITH ONE MEETING, in one "…" menu — Zoom's row actions and
// Google Calendar's event menu: Join/Start, Copy link, Invite, Edit,
// Reschedule, Duplicate, Cancel, Archive (Restore on an archived one), and the
// Yes / No / Maybe answer for an invitee. A person who may not manage the
// meeting sees only what they can do — never an item that would refuse.

import {
  Archive,
  ArchiveRestore,
  CalendarClock,
  Check,
  Copy,
  CopyPlus,
  ExternalLink,
  HelpCircle,
  MoreHorizontal,
  Pencil,
  UserPlus,
  Video,
  X,
  XCircle,
} from "lucide-react";
import type { MeetingRecord, RsvpAnswer } from "@ai-matrx/meet/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

export type MeetingMenuAction =
  | "open"
  | "join"
  | "copy"
  | "invite"
  | "edit"
  | "reschedule"
  | "duplicate"
  | "cancel"
  | "archive"
  | "restore"
  | { rsvp: RsvpAnswer };

export function MeetingRowMenu({
  meeting,
  canManage,
  isHost,
  isInvitee,
  onAction,
}: {
  meeting: MeetingRecord;
  canManage: boolean;
  isHost: boolean;
  isInvitee: boolean;
  onAction: (action: MeetingMenuAction) => void;
}) {
  const archived = !!meeting.deletedAt;
  const cancelled = !!meeting.cancelledAt;
  const ended = meeting.endedAt !== null && !meeting.recurrenceRule;
  const open = !archived && !cancelled;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label={`More actions for ${meeting.title}`}
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-52"
        onClick={(e) => e.stopPropagation()}
      >
        <DropdownMenuItem className="gap-2" onSelect={() => onAction("open")}>
          <ExternalLink className="h-4 w-4" aria-hidden="true" /> Open details
        </DropdownMenuItem>
        {open && !ended ? (
          <DropdownMenuItem className="gap-2" onSelect={() => onAction("join")}>
            <Video className="h-4 w-4" aria-hidden="true" />{" "}
            {isHost ? "Start" : "Join"}
          </DropdownMenuItem>
        ) : null}
        {ended && !archived ? (
          <DropdownMenuItem className="gap-2" onSelect={() => onAction("join")}>
            <Video className="h-4 w-4" aria-hidden="true" /> Open the record
          </DropdownMenuItem>
        ) : null}
        {!archived ? (
          <DropdownMenuItem className="gap-2" onSelect={() => onAction("copy")}>
            <Copy className="h-4 w-4" aria-hidden="true" /> Copy link
          </DropdownMenuItem>
        ) : null}
        {open && !ended && canManage ? (
          <DropdownMenuItem
            className="gap-2"
            onSelect={() => onAction("invite")}
          >
            <UserPlus className="h-4 w-4" aria-hidden="true" /> Invite…
          </DropdownMenuItem>
        ) : null}
        {open && isInvitee && !ended ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="gap-2"
              onSelect={() => onAction({ rsvp: "accepted" })}
            >
              <Check className="h-4 w-4" aria-hidden="true" /> Going
            </DropdownMenuItem>
            <DropdownMenuItem
              className="gap-2"
              onSelect={() => onAction({ rsvp: "tentative" })}
            >
              <HelpCircle className="h-4 w-4" aria-hidden="true" /> Maybe
            </DropdownMenuItem>
            <DropdownMenuItem
              className="gap-2"
              onSelect={() => onAction({ rsvp: "declined" })}
            >
              <X className="h-4 w-4" aria-hidden="true" /> Not going
            </DropdownMenuItem>
          </>
        ) : null}
        {canManage ? <DropdownMenuSeparator /> : null}
        {open && !ended && canManage ? (
          <>
            <DropdownMenuItem
              className="gap-2"
              onSelect={() => onAction("edit")}
            >
              <Pencil className="h-4 w-4" aria-hidden="true" /> Edit…
            </DropdownMenuItem>
            <DropdownMenuItem
              className="gap-2"
              onSelect={() => onAction("reschedule")}
            >
              <CalendarClock className="h-4 w-4" aria-hidden="true" />{" "}
              Reschedule…
            </DropdownMenuItem>
          </>
        ) : null}
        {canManage ? (
          <DropdownMenuItem
            className="gap-2"
            onSelect={() => onAction("duplicate")}
          >
            <CopyPlus className="h-4 w-4" aria-hidden="true" /> Duplicate…
          </DropdownMenuItem>
        ) : null}
        {open && !ended && canManage ? (
          <DropdownMenuItem
            onSelect={() => onAction("cancel")}
            className="gap-2 text-destructive focus:text-destructive"
          >
            <XCircle className="h-4 w-4" aria-hidden="true" /> Cancel meeting…
          </DropdownMenuItem>
        ) : null}
        {!archived && canManage ? (
          <DropdownMenuItem
            className="gap-2"
            onSelect={() => onAction("archive")}
          >
            <Archive className="h-4 w-4" aria-hidden="true" /> Archive…
          </DropdownMenuItem>
        ) : null}
        {archived && canManage ? (
          <DropdownMenuItem
            className="gap-2"
            onSelect={() => onAction("restore")}
          >
            <ArchiveRestore className="h-4 w-4" aria-hidden="true" /> Restore
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
