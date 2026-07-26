import { ReactNode } from "react";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/free/games/matrx-jump", {
  titlePrefix: "Matrx Jump",
  title: "Free Games",
  description: "Tilt-controlled jump game built for mobile browsers.",
  letter: "Mj",
});

export default function Layout({ children }: { children: ReactNode }) {
  return <div>{children}</div>;
}
