import { ReactNode } from "react";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata(
  "/free/games/matrx-jump/jump-with-settings",
  {
    titlePrefix: "Settings",
    title: "Matrx Jump",
    description: "Play Matrx Jump with configurable game settings.",
    letter: "Js",
  },
);

export default function Layout({ children }: { children: ReactNode }) {
  return <div>{children}</div>;
}
