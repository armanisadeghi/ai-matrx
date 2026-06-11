import { RunRefineView } from "./_components/RunRefineView";

export default async function RunRefinePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="h-full w-full overflow-y-auto overscroll-contain bg-textured">
      <RunRefineView runId={id} />
    </div>
  );
}
