import { OverlayInstancesDemo } from "./_components/OverlayInstancesDemo";

import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/demos/overlay-instances", {
  title: "Overlay Instances",
  description: "Interactive demo: Overlay Instances. AI Matrx demo route.",
});

export default function OverlayInstancesDemoPage() {
  return <OverlayInstancesDemo />;
}
