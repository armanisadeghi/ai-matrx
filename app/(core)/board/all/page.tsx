// /board/all — the old address of the boards list; the list is /board.

import { redirect } from "next/navigation";

export default function BoardsAllPage() {
  redirect("/board");
}
