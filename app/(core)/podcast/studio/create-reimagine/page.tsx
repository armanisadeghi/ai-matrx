import { Composer } from "./_components/Composer";

// REIMAGINED create surface (ui-reimagine bake-off entry).
// The "Studio Command Bar" — a NotebookLM/Suno-style single-canvas composer that
// replaces the original seven-section scrolling form. Real submit path: it
// creates a durable pc_studio_runs row and routes to /podcast/studio/run-reimagine/<id>.
export default function CreateReimaginePage() {
  return (
    <div className="h-full w-full overflow-y-auto overscroll-contain bg-textured">
      <Composer />
    </div>
  );
}
