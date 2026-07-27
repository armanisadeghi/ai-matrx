import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/demo", {
  titlePrefix: "Screen Capture",
  title: "Demo",
  description: "SSR screen capture demo",
  letter: "Sy",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
