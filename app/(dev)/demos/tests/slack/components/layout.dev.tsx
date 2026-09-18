import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/demos/tests", {
  titlePrefix: "Slack Components",
  title: "Tests",
  description: "Slack UI component and block kit tests",
  letter: "SKC",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
