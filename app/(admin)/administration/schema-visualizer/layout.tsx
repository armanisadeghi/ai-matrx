import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/administration", {
  titlePrefix: "Schema Visualizer",
  title: "Admin",
  description: "Database schema visualization and relationship diagrams",
  letter: "Sv",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
