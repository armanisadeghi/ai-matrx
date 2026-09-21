import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/demos/tests", {
  titlePrefix: "Slack Login",
  title: "Tests",
  description: "Slack OAuth login flow tests",
  letter: "SL",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
