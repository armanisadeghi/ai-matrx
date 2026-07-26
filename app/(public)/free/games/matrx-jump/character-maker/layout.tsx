import { ReactNode } from "react";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata(
  "/free/games/matrx-jump/character-maker",
  {
    titlePrefix: "Character Maker",
    title: "Matrx Jump",
    description: "Design a custom character for Matrx Jump.",
    letter: "Cm",
  },
);

export default function Layout({ children }: { children: ReactNode }) {
  return <div>{children}</div>;
}
