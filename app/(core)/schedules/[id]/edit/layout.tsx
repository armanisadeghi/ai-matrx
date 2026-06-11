import { createDynamicRouteMetadata } from "@/utils/route-metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const shortId = id.length > 12 ? `${id.slice(0, 8)}…` : id;
  return createDynamicRouteMetadata("/schedules", {
    titlePrefix: "Edit",
    title: shortId,
    description: "Edit a scheduled task.",
    letter: "Se",
  });
}

export default function ScheduleEditLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
