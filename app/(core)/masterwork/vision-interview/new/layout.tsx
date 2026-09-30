import { createRouteMetadata } from "@/utils/route-metadata";

// One tab of the "Vision Interview" tab shell — it names itself, so the browser tab and
// its badge change as a person switches tabs (scripts/check-tab-shell-titles.ts).
export const metadata = createRouteMetadata("/masterwork/vision-interview", {
  titlePrefix: "New Interview",
  title: "Vision Interview",
  letter: "NI",
});

export default function MasterworkVisionInterviewNewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
