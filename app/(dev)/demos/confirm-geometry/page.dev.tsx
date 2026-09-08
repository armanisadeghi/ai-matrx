import { ConfirmGeometryHarness } from "./_components/ConfirmGeometryHarness";

import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/demos/confirm-geometry", {
  title: "Confirm Geometry",
  description:
    "Geometric proof: the confirm dialog's sticky footer never paints over the consequence copy.",
});

export default function ConfirmGeometryDemoPage() {
  return <ConfirmGeometryHarness />;
}
