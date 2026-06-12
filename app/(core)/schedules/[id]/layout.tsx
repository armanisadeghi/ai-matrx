import { createDynamicRouteMetadata } from "@/utils/route-metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const shortId = id.length > 12 ? `${id.slice(0, 8)}…` : id;
  return createDynamicRouteMetadata("/schedules", {
    title: shortId,
    description: "View and manage a scheduled task.",
    letter: "Sh",
  });
}

export default function ScheduleDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
