import { createRouteMetadata } from "@/utils/route-metadata";

// One tab of the "Images" tab shell — it names itself, so the browser tab and
// its badge change as a person switches tabs (scripts/check-tab-shell-titles.ts).
export const metadata = createRouteMetadata("/images", {
  titlePrefix: "My Cloud",
  title: "Images",
  letter: "MC",
});

export default function ImagesMyCloudLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
