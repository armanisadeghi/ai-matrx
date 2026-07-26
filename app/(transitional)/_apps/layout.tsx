import { createRouteMetadata } from "@/utils/route-metadata";
import AppsLayoutClient from "./AppsLayoutClient";

export const metadata = createRouteMetadata("/apps", {
  title: "Apps",
  description: "App builder, custom applications, demos, and tooling.",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return <AppsLayoutClient>{children}</AppsLayoutClient>;
}
