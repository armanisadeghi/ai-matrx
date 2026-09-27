// app/(core)/board/all/page.tsx
//
// Boards LIST page — every board the person made. The board itself opens at
// /board (home) and /board/<id>; see features/spatial/FEATURE.md.

import { BoardsListPage } from "@/features/spatial/boards/BoardsListPage";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/board/all", {
  title: "Boards",
  description: "Every board you made: open, rename, copy or delete them, or start a new one.",
  letter: "Bd",
  canonicalPath: "/board/all",
});

export default function BoardsAllPage() {
  return <BoardsListPage />;
}
