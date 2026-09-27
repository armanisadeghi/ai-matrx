"use client";

// features/meet/components/invite/MeetingInviteButton.tsx
//
// The "Invite" control. Two looks, one behaviour:
//   stage — the meeting header / pre-join corner: light glass on the dark
//           meeting stage (--mx-meet-stage-*), the same treatment as the AI
//           jobs indicator beside it.
//   row   — a compact outline button for a /meetings row.
// The dialog mounts only while open, so a list of fifty meetings resolves no
// ownership until somebody clicks one.

import { useState } from "react";
import { UserPlus } from "lucide-react";
import { meetingLink, type MeetingRecord } from "@ai-matrx/meet/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MeetingInviteDialog } from "@/features/meet/components/invite/MeetingInviteDialog";

export function meetingOrigin(): string {
  return typeof window === "undefined" ? "" : window.location.origin;
}

export function MeetingInviteButton({
  meeting,
  signedIn,
  look = "stage",
  className,
}: {
  meeting: MeetingRecord;
  signedIn: boolean;
  look?: "stage" | "row";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const link = meetingLink(meetingOrigin(), meeting.slug);

  return (
    <>
      <Button
        type="button"
        variant={look === "row" ? "outline" : "ghost"}
        size="sm"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className={cn(
          "gap-1.5",
          look === "stage" &&
            "h-11 border border-white/30 bg-white/10 px-3 text-[color:var(--mx-meet-stage-text)] hover:bg-white/20 hover:text-[color:var(--mx-meet-stage-text)] focus-visible:ring-white/60 sm:h-9",
          className,
        )}
      >
        <UserPlus className="h-4 w-4" aria-hidden="true" />
        Invite
      </Button>
      {open ? (
        <MeetingInviteDialog
          open={open}
          onOpenChange={setOpen}
          meeting={meeting}
          link={link}
          signedIn={signedIn}
        />
      ) : null}
    </>
  );
}
