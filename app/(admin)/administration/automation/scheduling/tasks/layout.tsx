import { createRouteMetadata } from "@/utils/route-metadata";

// One tab of the "Scheduling" tab shell — it names itself, so the browser tab and
// its badge change as a person switches tabs (scripts/check-tab-shell-titles.ts).
export const metadata = createRouteMetadata("/administration", {
  titlePrefix: "Tasks",
  title: "Scheduling",
  letter: "TA",
});

export default function AdministrationAutomationSchedulingTasksLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
