import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/surfaces", {
  title: "Surfaces",
  description:
    "Per-page agent roles and settings — pick which agents power each surface, for you or your org.",
  letter: "Sf",
});

export default function SurfacesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
