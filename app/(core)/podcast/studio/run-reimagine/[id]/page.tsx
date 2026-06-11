import { StudioStage } from "./_components/StudioStage";

// REIMAGINED run surface (ui-reimagine bake-off entry).
// The "Studio Stage" — a single living canvas where the episode materializes:
// the cover-art breathes while producing and becomes the album cover + player
// when done, with the pipeline as a slim control rail. Consumes useStudioRun
// unchanged (real POST /podcast/generate stream, resume, heartbeat/stall
// watchdog, background-poll, recovery), preserving every never-dead-end behavior.
export default async function RunReimaginePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="h-full w-full overflow-y-auto overscroll-contain bg-textured">
      <StudioStage runId={id} />
    </div>
  );
}
