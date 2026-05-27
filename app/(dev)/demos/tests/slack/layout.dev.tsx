import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/tests", {
  titlePrefix: "Slack",
  title: "Tests",
  description: "Slack integration and webhook tests",
  letter: "Sl",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
