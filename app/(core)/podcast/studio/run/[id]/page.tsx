import { StudioRunView } from "@/features/podcasts/studio/components/StudioRunView";


export default async function StudioRunPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="h-full w-full overflow-y-auto overscroll-contain bg-textured">
      <StudioRunView runId={id} />
    </div>
  );
}
