import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/demo", {
  titlePrefix: "Fetch React",
  title: "Demo",
  description: "React data fetching patterns, loading states, and cache demos",
  letter: "Fr",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
