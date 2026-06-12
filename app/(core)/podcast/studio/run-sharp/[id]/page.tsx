import { RunSharpView } from "./_components/RunSharpView";

export default async function RunSharpPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="h-full w-full overflow-y-auto overscroll-contain bg-textured">
      <RunSharpView runId={id} />
    </div>
  );
}
