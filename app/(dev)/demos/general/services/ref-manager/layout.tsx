import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/demo", {
  titlePrefix: "Ref Manager",
  title: "Demo",
  description: "Stable ref management patterns across renders and portals",
  letter: "Rf",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
