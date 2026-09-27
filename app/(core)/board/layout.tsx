import type { ReactNode } from "react";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/board", {
  title: "Board",
  description: "Your own canvas: chats, notes, files, tasks and every feature you use, side by side.",
  letter: "Bd",
});

export default function BoardLayout({ children }: { children: ReactNode }) {
  return children;
}
