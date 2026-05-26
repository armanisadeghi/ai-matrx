import AppletTestsLayoutClient from "./AppletTestsLayoutClient";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/tests", {
  titlePrefix: "Applets",
  title: "Tests",
  description: "Applet and entity analyzer test harness",
  letter: "At",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return <AppletTestsLayoutClient>{children}</AppletTestsLayoutClient>;
}
