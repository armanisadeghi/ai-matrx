import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/tests", {
  titlePrefix: "Direct Chat",
  title: "Tests",
  description: "Direct chat connection and streaming tests",
  letter: "DC",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
