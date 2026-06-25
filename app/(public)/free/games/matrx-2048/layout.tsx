import { ReactNode } from "react";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/free/games/matrx-2048", {
  titlePrefix: "2048",
  title: "Free Games",
  description: "Join the tiles and reach 2048 — a fast, polished number puzzle. Swipe or use arrow keys.",
  letter: "20",
});

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
