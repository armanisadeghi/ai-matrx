"use client";

/**
 * /demos/spatial with the chat beside it.
 *
 * `SpatialDemoBoard` exposes no store handle yet, so the board context is read
 * from its DOM (`readBoardContextFromDom`). Follow-up: a store-backed reader
 * once the board exposes its `SpatialStore`.
 */

import { useRef } from "react";
import type { Layout } from "react-resizable-panels";
import { type DemoKindExample, SpatialDemoBoard } from "@/features/spatial/demo/SpatialDemoBoard";
import { BoardWithChat } from "./BoardWithChat";
import { readBoardContextFromDom } from "./board-context";

export function SpatialDemoBoardWithChat({
  groupId,
  kinds,
  examplesNote,
  defaultLayout,
}: {
  groupId: string;
  kinds: DemoKindExample[];
  examplesNote: string | null;
  defaultLayout?: Layout;
}) {
  const boardRef = useRef<HTMLDivElement>(null);
  return (
    <BoardWithChat
      id={groupId}
      defaultLayout={defaultLayout}
      getBoardContext={() => readBoardContextFromDom(boardRef.current, "Spatial view demo board")}
    >
      <div ref={boardRef} className="h-full min-h-0">
        <SpatialDemoBoard kinds={kinds} examplesNote={examplesNote} />
      </div>
    </BoardWithChat>
  );
}
