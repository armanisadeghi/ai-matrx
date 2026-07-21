import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/camera", {
  title: "Camera",
  description:
    "Capture photos with your camera — review, save to your files, and browse recent captures.",
  letter: "Ca",
  additionalMetadata: {
    keywords: ["camera", "photo capture", "media capture", "webcam"],
  },
});

export default function CameraLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
