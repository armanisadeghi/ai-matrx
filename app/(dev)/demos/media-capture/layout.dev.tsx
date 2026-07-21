import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/demos/media-capture", {
  titlePrefix: "Media Capture",
  title: "Demo",
  description:
    "Exercise the production media-capture primitives: framing modes, quality profiles, device switching, error states.",
  letter: "MC",
});

export default function MediaCaptureDemoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
