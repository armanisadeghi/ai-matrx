import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/administration", {
  titlePrefix: "Schema Visualizer Pro",
  title: "Admin",
  description: "Enhanced database schema visualization and analysis",
  letter: "SV",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
