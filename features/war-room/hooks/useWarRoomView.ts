"use client";

// features/war-room/hooks/useWarRoomView.ts
//
// Hold a view of a room for as long as the calling component is mounted (see
// `redux/roomViewSession.ts`). Any number of components may hold the same room;
// the room is read and "opened" once per session, and a remount inside the
// grace window neither re-opens nor closes it.

import { useEffect } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { openRoomView } from "@/features/war-room/redux/roomViewSession";

export function useWarRoomView(roomId: string | null): void {
  const dispatch = useAppDispatch();
  useEffect(() => {
    if (!roomId) return undefined;
    return dispatch(openRoomView(roomId));
  }, [dispatch, roomId]);
}
