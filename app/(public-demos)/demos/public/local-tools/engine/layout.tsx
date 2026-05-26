import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/demos/local-tools/engine", {
  title: "Local Tools Engine",
  description: "Interactive demo: Local Tools Engine. AI Matrx demo route.",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
