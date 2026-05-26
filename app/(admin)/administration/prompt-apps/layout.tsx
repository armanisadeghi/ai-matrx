import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/administration", {
  titlePrefix: "Prompt Apps",
  title: "Admin",
  description: "Manage public prompt applications and deployments",
  letter: "PA",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
