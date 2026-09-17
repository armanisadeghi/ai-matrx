import { createRouteMetadata } from "@/utils/route-metadata";

import { DetailPrimitiveDemo } from "./DetailPrimitiveDemo";

export const metadata = createRouteMetadata("/demos/detail-primitive", {
  title: "Detail primitive",
  description:
    "One core, three presentations: a real record opened as a window, a docked side panel, and a page — desktop and phone width side by side.",
  letter: "D",
});

/**
 * /demos/detail-primitive — the feature-visibility surface for `lib/detail`.
 *
 * Server shell only; the demo body is a client island because it opens
 * overlays and reads the person's presentation setting. The demos layout
 * already reserves the shell header's height for the whole tree.
 */
export default function DetailPrimitiveDemoPage() {
  return <DetailPrimitiveDemo />;
}
