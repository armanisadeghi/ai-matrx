import { createRouteMetadata } from "@/utils/route-metadata";

// One tab of the "Tasks" tab shell — it names itself, so the browser tab and
// its badge change as a person switches tabs (scripts/check-tab-shell-titles.ts).
export const metadata = createRouteMetadata("/tasks", {
  titlePrefix: "New Task",
  title: "Tasks",
  letter: "NT",
});

export default function TasksNewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
