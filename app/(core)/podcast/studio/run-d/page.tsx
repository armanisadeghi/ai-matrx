// app/(core)/podcast/studio/run-d/page.tsx
//
// STUDIO D — Generation progress surface (design bake-off variation D).
// Reference: a CI/deploy build view × a render-farm export, resolving into a
// Spotify episode page. Persona: consumer / prosumer creator.
//
// No [id] segment, no backend: the client RunView replays the mock event
// sequence through the real reducer over ~45s, then shows the finished episode.

import { RunView } from "./_components/RunView";


export default function RunStudioDPage() {
  return (
    <div className="h-full w-full">
      <RunView />
    </div>
  );
}
