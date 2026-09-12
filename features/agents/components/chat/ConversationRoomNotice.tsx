"use client";

/**
 * "Personal — only you can see this, even inside a shared room."
 *
 * WHAT THIS CHIP SAID UNTIL 2026-09-12, AND WHY IT CHANGED
 * -------------------------------------------------------
 * It used to say "Inside a shared room — members can see this", and that was TRUE: an owner dropped
 * a `personal` conversation into an `internal` war room, `platform.reachability` recorded the
 * containment, and the room's own lane opened the conversation inside it. Measured live: an
 * organization admin read 7 of other people's private conversations that way and a plain MEMBER
 * read 5 — which is what proved it was never an admin-lane leak. The chip existed because nothing
 * told the person, and a screen never lies (law 4).
 *
 * 🚨 THE CHAIR OVERTURNED THE RULING BEHIND IT (DD-171, 2026-09-12), so the sentence had to change
 * WITH the behaviour, never before it. The old note called this Rule 9's union — "putting your
 * private thing inside a shared room IS sharing it". It is not: a row marked `personal` is
 * reachable only by its OWNER and by explicit direct grants ON THAT ROW, and containment carries the
 * container's reach to rows at `internal` and above, never to `personal`. Union never widens a
 * personal row.
 *
 * THE BEHAVIOUR MOVED FIRST. `iam.has_access_for_base` now refuses both containment walks (the
 * `platform.reachability` conveyance and the composition/containment parent walk) for a row whose
 * own visibility is `personal`, `iam.accessible_entity_ids` refuses it in the set form, and
 * `iam.entity_read_expr` emits the parent-FK arm walled at `internal`. Proven in the same
 * transaction that shipped it: for every personal conversation inside a shared war room that an
 * organization member CAN open, that member reads the room and 0 of the conversations
 * (migrations/iam_containment_never_carries_personal_dd171d_gate.sql §4).
 *
 * WHAT IT RENDERS
 * ---------------
 * Nothing at all, unless you are the OWNER of a still-private conversation that really does sit
 * inside a container other people can reach — the database door `public.conversation_shared_room_notice`
 * decides, asking `iam.has_access` first so it can never become a way to probe other people's rooms.
 * It still names the room, because the useful fact is now the reassurance: your chat is filed in
 * that room and it is STILL only yours. The styling is neutral, not amber: this is no longer a
 * warning, and dressing a reassurance as an alarm is its own kind of lie.
 *
 * A failed read renders nothing and reports itself — staying silent about a failure is why it
 * reports.
 */

import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { supabase } from "@/utils/supabase/client";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";

interface RoomNotice {
  inSharedRoom: boolean;
  roomCount: number;
  roomLabel: string | null;
  roomType: string | null;
}

export function ConversationRoomNotice({ conversationId }: { conversationId?: string }) {
  const [notice, setNotice] = useState<RoomNotice | null>(null);

  useEffect(() => {
    if (!conversationId) {
      setNotice(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase.rpc("conversation_shared_room_notice", {
        p_conversation_id: conversationId,
      });
      if (cancelled) return;
      if (error) {
        // Silent on screen, never silent in the log: the chip's absence is indistinguishable from
        // "not in a room", so the failure has to be recorded somewhere a person will find it.
        captureError({
          source: "supabase-postgrest",
          operation: "rpc",
          schema: "public",
          relation: "conversation_shared_room_notice",
          code: error.code,
          message: `Could not check whether this conversation sits inside a shared room: ${error.message}`,
          details: error.details ?? undefined,
          hint: error.hint ?? undefined,
          conversationId,
          callSite: "ConversationRoomNotice",
          userMessage:
            "We could not check whether this chat sits inside a shared room, so no note is shown. A personal chat stays personal either way — being inside a room does not share it.",
          recoverable: true,
        });
        setNotice(null);
        return;
      }
      const row = Array.isArray(data) ? data[0] : null;
      setNotice(
        row
          ? {
              inSharedRoom: row.in_shared_room,
              roomCount: row.room_count,
              roomLabel: row.room_label,
              roomType: row.room_type,
            }
          : null,
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  if (!notice?.inSharedRoom) return null;

  const where =
    notice.roomCount > 1
      ? `${notice.roomLabel} and ${notice.roomCount - 1} other ${notice.roomCount === 2 ? "room" : "rooms"}`
      : notice.roomLabel;

  return (
    <span
      className="flex min-w-0 items-center gap-1.5 rounded-md border border-slate-300 bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
      title={
        `This chat is personal, and it also sits inside ${where ?? "a shared room"}. ` +
        `Being in that room does not share it: only you can open it. ` +
        `Change its visibility to Internal if you want the room's members to read it.`
      }
    >
      <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="truncate">
        Personal — only you can see this, even inside a shared room{where ? ` (${where})` : ""}
      </span>
    </span>
  );
}
