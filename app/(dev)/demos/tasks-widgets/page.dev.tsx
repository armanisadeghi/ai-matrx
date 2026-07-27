import { createRouteMetadata } from "@/utils/route-metadata";
import TasksWidgetsDemo from "./_client";

export const metadata = createRouteMetadata("/demos/tasks-widgets", {
  title: "Tasks Widgets Demo",
  description:
    "Every drop-in task widget: create, associate, chip rows, preview, tap-button — all wired to real Redux state with zero local logic on the page.",
});

export default function TasksWidgetsDemoPage() {
  return <TasksWidgetsDemo />;
}
