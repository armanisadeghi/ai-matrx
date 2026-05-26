import { createRouteMetadata } from "@/utils/route-metadata";
import AppsDemoLayoutClient from "./AppsDemoLayoutClient";

export const metadata = createRouteMetadata("/apps/demo", {
  titlePrefix: "Applet",
  title: "Apps",
  description: "Applet layout and embedding demos.",
  letter: "Ad", // Apps demo (matches nav)
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return <AppsDemoLayoutClient>{children}</AppsDemoLayoutClient>;
}
