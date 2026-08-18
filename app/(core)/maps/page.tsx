// app/(core)/maps/page.tsx
//
// Maps LIST page — the library of visual maps the user has authored. A map is
// a canvas item of type "diagram"; see features/canvas/maps/FEATURE.md.

import { MapsListPage } from "@/features/canvas/maps/MapsListPage";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/maps", {
  title: "Maps",
  description:
    "Draw a picture of how something works — steps, people or parts, with arrows between them.",
  canonicalPath: "/maps",
});

export default function MapsIndexPage() {
  return <MapsListPage />;
}
