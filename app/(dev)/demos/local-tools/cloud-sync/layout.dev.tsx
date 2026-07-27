import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/demos/local-tools/cloud-sync", {
  title: "Local Tools Cloud Sync",
  description: "Interactive demo: Local Tools Cloud Sync. AI Matrx demo route.",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
