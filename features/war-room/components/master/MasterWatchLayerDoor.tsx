"use client";

/**
 * MasterWatchLayerDoor — THE single dynamic front door for MasterWatchLayer
 * (build-lab E3a). WarRoomShell and WarRoomAllView previously each declared an
 * identical `dynamic()` wrapper, which manufactured the ~1,600-module watch
 * layer into TWO chunk groups. One shared door = one group. Import this
 * statically from any surface that mounts the layer; never re-wrap the
 * underlying module in another dynamic().
 */

import dynamic from "next/dynamic";

export const MasterWatchLayerDoor = dynamic(
  () =>
    import("@/features/war-room/components/master/MasterWatchLayer").then(
      (m) => m.MasterWatchLayer,
    ),
  { ssr: false, loading: () => null },
);
