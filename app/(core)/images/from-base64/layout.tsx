import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/images/from-base64", {
  titlePrefix: "Base64",
  title: "Images",
  description:
    "Paste a base64 string — get a previewable, downloadable image with a permanent share URL. Format auto-detected from the bytes.",
  letter: "Ib",
  additionalMetadata: {
    keywords: [
      "base64 to image",
      "base64 decoder",
      "data URL to image",
      "image from base64",
      "decode base64 image online",
    ],
  },
});

export default function FromBase64Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
