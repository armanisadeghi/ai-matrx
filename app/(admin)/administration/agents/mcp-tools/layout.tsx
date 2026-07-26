import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/administration", {
  titlePrefix: "MCP Tools",
  title: "Admin",
  description: "Model Context Protocol tools and server management",
  letter: "MC",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
