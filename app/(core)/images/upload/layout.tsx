import { createRouteMetadata } from "@/utils/route-metadata";

// One tab of the "Images" tab shell — it names itself, so the browser tab and
// its badge change as a person switches tabs (scripts/check-tab-shell-titles.ts).
export const metadata = createRouteMetadata("/images", {
  titlePrefix: "Upload",
  title: "Images",
  letter: "UP",
});

export default function ImagesUploadLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
