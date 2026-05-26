import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/demos/local-tools/powershell", {
  title: "Local Tools Powershell",
  description: "Interactive demo: Local Tools Powershell. AI Matrx demo route.",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
