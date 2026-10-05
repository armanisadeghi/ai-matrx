// /board — the boards list: every board the person made, recents first, "New board" to start
// one. A board opens at /board/<id>. `/board?add=<item key>` (the menu's "Add to your board"
// rows) opens the board they last opened and starts that item there. Mechanics:
// features/board/FEATURE.md.

import { BoardsListPage } from "@/features/board/boards/BoardsListPage";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/board", {
  title: "Boards",
  description: "Every board you made: open, rename, copy or delete them, or start a new one.",
  letter: "Bd",
  canonicalPath: "/board",
});

export default function BoardsPage() {
  return <BoardsListPage />;
}
