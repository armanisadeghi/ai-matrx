import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/demos/local-tools/documents", {
  title: "Local Tools Documents",
  description: "Interactive demo: Local Tools Documents. AI Matrx demo route.",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
