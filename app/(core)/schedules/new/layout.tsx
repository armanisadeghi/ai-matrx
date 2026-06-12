import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/schedules", {
  titlePrefix: "New",
  title: "Schedules",
  description: "Create a new scheduled task.",
  letter: "Sn",
});

export default function NewScheduleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
