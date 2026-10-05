import { SpacePage } from "@/features/spaces/page/SpacePage";

export default async function SpaceRoute({ params }: { params: Promise<{ spaceId: string }> }) {
  const { spaceId } = await params;
  return <SpacePage spaceId={spaceId} />;
}
