"use client";

// features/war-room/components/room/WarRoomSurfaceHost.tsx
//
// THE ONE `matrx-user/war-room` surface for one room: its read half (the room
// scope, built at trigger time from the live store + the live room view) and
// its write half (`useWarRoomWriteHandlers`). Every place that shows a room
// mounts THIS — the room route (`WarRoomShell`) and a room on the Board — so an
// agent reads and writes the same values, targets and handlers wherever the
// room is on screen.
//
// Must sit inside a `<RoomViewProvider>`: the scope and the staged-thread write
// target read the room's view state (mode, projected tab, density, staged
// thread) from it. A thread's agent panel nests a DEEPER provider, so while a
// thread's agent is open the thread surface wins (by design).

import type { ReactNode } from "react";
import { useAppSelector, useAppStore } from "@/lib/redux/hooks";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { buildWarRoomRoomScope } from "@/features/war-room/lib/war-room-scope";
import { selectOrderedGalleryThreadIds } from "@/features/war-room/redux/selectors";
import { resolveStagedId, useRoomView } from "./roomViewContext";
import { useWarRoomWriteHandlers } from "./useWarRoomWriteHandlers";

export const WAR_ROOM_SURFACE_NAME = "matrx-user/war-room";

export function WarRoomSurfaceHost({
  sessionId,
  children,
}: {
  sessionId: string;
  children: ReactNode;
}) {
  const store = useAppStore();
  const roomView = useRoomView();
  const visibleThreadIdsForStage = useAppSelector(
    selectOrderedGalleryThreadIds(sessionId),
  );
  // Plain function (React Compiler memoizes it): read at trigger time.
  const getRoomScope = () =>
    buildWarRoomRoomScope(store.getState(), sessionId, {
      mode: roomView.mode,
      projectedTab: roomView.projectedTab,
      density: roomView.density,
      stagedThreadId: resolveStagedId(
        roomView.chosenStageId,
        visibleThreadIdsForStage,
      ),
    });

  // Write half — handlers run the room's own thunks; see the hook.
  const getRoomWriteHandlers = useWarRoomWriteHandlers(sessionId);

  return (
    <SurfaceRuntimeProvider
      surfaceName={WAR_ROOM_SURFACE_NAME}
      getScope={getRoomScope}
      getWriteHandlers={getRoomWriteHandlers}
    >
      {children}
    </SurfaceRuntimeProvider>
  );
}
