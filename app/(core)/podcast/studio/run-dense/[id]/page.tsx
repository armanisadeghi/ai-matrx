import { RunDenseView } from "./_components/RunDenseView";

export default async function RunDensePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="h-full w-full overflow-hidden bg-textured">
      <RunDenseView runId={id} />
    </div>
  );
}
