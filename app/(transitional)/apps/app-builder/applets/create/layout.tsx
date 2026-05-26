import { ReactNode } from "react";
import { createRouteMetadata } from "@/utils/route-metadata";
import AppletCreateLayoutClient from "./AppletCreateLayoutClient";

export const metadata = createRouteMetadata("/apps", {
  titlePrefix: "New Applet",
  title: "App Builder",
  description: "Create a new applet.",
  letter: "Pc", // Applet create
});

export default function AppletCreateLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <AppletCreateLayoutClient>{children}</AppletCreateLayoutClient>;
}
