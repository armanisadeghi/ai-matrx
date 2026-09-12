"use client";

/**
 * "Inside a shared room — members can see this."
 *
 * WHY THIS EXISTS (V-33 §9.1, measured live 2026-09-12)
 * ----------------------------------------------------
 * DD-136 closed the organization-admin lane on `personal` rows, and the numbers proved it: a plain
 * member and an organization admin both read **0** of other people's private conversations by role.
 * But both of them still read *some*, by a path nobody had described. An owner drops a `personal`
 * conversation into an `internal` war room or thread, `platform.reachability` records the
 * containment, and the room's own lane opens the conversation inside it. An admin read 7 that way —
 * and a plain MEMBER read 5, which is what proves it is not an admin-lane leak at all.
 *
 * 🚨 THAT IS NOT A HOLE. IT IS RULE 9'S UNION, AND THE FIX IS TO SAY SO. Access is the union of
 * every lane: putting your private thing inside a shared room IS sharing it, the same way dropping
 * a private file into a shared folder is. Closing it would break the product — a war room whose
 * conversations its members cannot read is not a war room. What was wrong is that **nothing told
 * the person**. Their conversation still said `personal`, the screen said nothing, and they had no
 * way to know their teammates could read it. A screen never lies (law 4).
 *
 * WHAT IT RENDERS
 * ---------------
 * Nothing at all, unless you are the OWNER of a still-private conversation that really is inside a
 * container someone else can reach — the database door `public.conversation_shared_room_notice`
 * decides, asking `iam.has_access` first so it can never become a way to probe other people's
 * rooms. When it does apply it names the room, because "inside a shared room" that does not say
 * WHICH room is a warning nobody can act on.
 *
 * A failed read renders nothing and reports itself. This chip is a warning, not a permission check:
 * showing a scary sentence because a query failed would be its own kind of lie, and staying silent
 * about a failure is why it reports.
 */

import { useEffect, useState } from "react";
import { Users } from "lucide-react";
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
            "We could not check whether this chat sits inside a shared room, so no warning is shown. If it is in a room, its members can read it.",
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
      className="flex min-w-0 items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-400"
      title={
        `This chat is private to you, and it also sits inside ${where ?? "a shared room"}. ` +
        `Anyone who can open that room can read it. Take it out of the room to make it private again.`
      }
    >
      <Users className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="truncate">
        Inside a shared room{where ? ` (${where})` : ""} — members can see this
      </span>
    </span>
  );
}
