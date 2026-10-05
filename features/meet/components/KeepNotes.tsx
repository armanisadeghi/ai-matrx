"use client";

// features/meet/components/KeepNotes.tsx
//
// The two halves of KEEP YOUR NOTES (see `features/meet/lib/guest-claim.ts`):
//
//   <KeepNotesPrompt>       a guest looking at a finished meeting's record is
//                           offered a free account. An offer in the corner,
//                           never a gate: the record renders beneath it either way.
//   useGuestClaimOnArrival  back from sign-up with `?claim=1`, the kept guest
//                           pass is presented with the new session once; the
//                           returned key changes on success so the record
//                           re-reads as the attendee.

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useMeetHost, type MeetingRecord } from "@ai-matrx/meet/react";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import {
  claimGuestAttendance,
  GUEST_CLAIM_PARAM,
  keepNotesHref,
  rememberedGuestPass,
} from "@/features/meet/lib/guest-claim";

export function KeepNotesPrompt({ slug }: { slug: string }) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-white/20 bg-black/40 py-1 pl-3 pr-1 text-sm text-[color:var(--mx-meet-stage-text)] backdrop-blur">
      <span className="hidden sm:inline">Keep these notes</span>
      <Button variant="primary" asChild>
        <Link href={keepNotesHref(slug)}>Create free account</Link>
      </Button>
    </div>
  );
}

/** Returns a key that changes once the claim lands (remount the record with it). */
export function useGuestClaimOnArrival(meeting: MeetingRecord): number {
  const host = useMeetHost();
  const api = host?.api ?? null;
  const [generation, setGeneration] = useState(0);
  const tried = useRef(false);

  useEffect(() => {
    if (api === null || tried.current) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get(GUEST_CLAIM_PARAM) === null) return;
    tried.current = true;
    // The intent is spent either way: a reload never asks twice.
    params.delete(GUEST_CLAIM_PARAM);
    const query = params.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`,
    );
    const pass = rememberedGuestPass(meeting.roomName);
    if (pass === null) {
      toast.error("No guest pass for this meeting in this browser");
      return;
    }
    void claimGuestAttendance(api, meeting, pass)
      .then(() => {
        toast.success("Meeting notes added to your account");
        setGeneration((value) => value + 1);
      })
      .catch((thrown: unknown) => {
        console.error("[meet] keep-your-notes claim refused:", thrown);
        toast.error((thrown as Error).message);
      });
  }, [api, meeting]);

  return generation;
}
