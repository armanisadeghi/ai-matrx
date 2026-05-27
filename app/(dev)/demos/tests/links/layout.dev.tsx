import LinksTestLayoutClient from "./LinksTestLayoutClient";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/tests", {
  titlePrefix: "Links",
  title: "Tests",
  description: "Link module navigation and routing tests",
  letter: "Lk",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return <LinksTestLayoutClient>{children}</LinksTestLayoutClient>;
}
