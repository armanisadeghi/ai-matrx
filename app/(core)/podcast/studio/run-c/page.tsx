import { RunView } from "./_components/RunView";


// Bake-off variation C — redesigned run / generation page.
// Static demo: on mount it auto-plays a mocked generation through the real
// reduce() in ~45s, with a Replay control. Reachable at /podcast/studio/run-c.
export default function RunCPage() {
  return (
    <div className="h-full w-full overflow-y-auto overscroll-contain bg-textured">
      <RunView />
    </div>
  );
}
