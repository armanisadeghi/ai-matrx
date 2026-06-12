import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/schedules", {
  title: "Schedules",
  description: "Create and manage scheduled agent and automation tasks.",
  letter: "Sh",
});

export default function SchedulesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
