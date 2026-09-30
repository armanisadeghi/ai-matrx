import { createRouteMetadata } from "@/utils/route-metadata";

// One tab of the "Users & Access" tab shell — it names itself, so the browser tab and
// its badge change as a person switches tabs (scripts/check-tab-shell-titles.ts).
export const metadata = createRouteMetadata("/administration", {
  titlePrefix: "Meetings",
  title: "Users & Access",
  letter: "ME",
});

export default function AdministrationUsersMeetingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
