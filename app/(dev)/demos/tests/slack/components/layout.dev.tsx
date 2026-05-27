import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/tests", {
  titlePrefix: "Slack Components",
  title: "Tests",
  description: "Slack UI component and block kit tests",
  letter: "SC",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
