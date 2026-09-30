import { createRouteMetadata } from "@/utils/route-metadata";

// One tab of the "Users & Access" tab shell — it names itself, so the browser tab and
// its badge change as a person switches tabs (scripts/check-tab-shell-titles.ts).
export const metadata = createRouteMetadata("/administration", {
  titlePrefix: "Usage & Cost",
  title: "Users & Access",
  letter: "UG",
});

export default function AdministrationUsersUsageLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
