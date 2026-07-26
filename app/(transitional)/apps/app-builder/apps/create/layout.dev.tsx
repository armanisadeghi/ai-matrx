import { ReactNode } from "react";
import { createRouteMetadata } from "@/utils/route-metadata";
import AppCreateLayoutClient from "./AppCreateLayoutClient";

export const metadata = createRouteMetadata("/apps", {
  titlePrefix: "New App",
  title: "App Builder",
  description: "Create a new Matrx application.",
  letter: "Um", // App create (builder)
});

export default function AppCreateLayout({ children }: { children: ReactNode }) {
  return <AppCreateLayoutClient>{children}</AppCreateLayoutClient>;
}
