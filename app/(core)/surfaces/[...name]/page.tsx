import { SurfaceHubDetailPage } from "@/features/surfaces/components/hub/SurfaceHubDetailPage";

export default async function SurfaceHubDetailRoute({
  params,
}: {
  params: Promise<{ name: string[] }>;
}) {
  const { name } = await params;
  return <SurfaceHubDetailPage segments={name} />;
}
