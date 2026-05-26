import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/tasks", {
  title: "Tasks",
  description:
    "Manage your tasks and projects efficiently with our powerful task management system",
  additionalMetadata: {
    keywords: [
      "tasks",
      "task management",
      "projects",
      "productivity",
      "todo",
      "checklist",
    ],
  },
});

/**
 * No body-level wrapper — the page itself uses the shell's full-height area
 * (per the agents/[id]/build pattern). Adding `h-page`, `bg-textured`, or any
 * extra padding here forces every panel below the transparent shell header
 * and creates the boxed look the design rejects.
 */
export default function TasksLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
