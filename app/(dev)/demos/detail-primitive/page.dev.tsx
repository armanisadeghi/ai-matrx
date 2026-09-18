import { createRouteMetadata } from "@/utils/route-metadata";

import { DetailShowcase } from "@/features/window-panels/detail/DetailShowcase";

export const metadata = createRouteMetadata("/demos/detail-primitive", {
  title: "Detail primitive",
  description:
    "One core, three presentations: a real record opened as a window, a docked side panel, and a page — desktop and phone width side by side.",
  letter: "D",
});

/**
 * /demos/detail-primitive — the demos-deployment door to the Detail
 * primitive's feature-visibility surface.
 *
 * 🚨 THIS ROUTE IS NOT THE SURFACE. `(dev)` is compiled out of every profile
 * but `full`, `user` and `demos`, and the preview server's default is `core` —
 * so this path 307s to demos.aimatrx.com for the people who actually run the
 * app (VERIFY-U-P1, D6). The surface itself is
 * `features/window-panels/detail/DetailShowcase.tsx`, and `/detail` in `(core)`
 * serves it in every profile. This entry stays so the demos deployment keeps
 * its listing.
 */
export default function DetailPrimitiveDemoPage() {
  return <DetailShowcase />;
}
