import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/demo", {
  titlePrefix: "Resizable Nested",
  title: "Demo",
  description: "Nested resizable regions with header and footer chrome",
  letter: "RN",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
