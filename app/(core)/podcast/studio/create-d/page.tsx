// app/(core)/podcast/studio/create-d/page.tsx
//
// STUDIO D — Create surface (design bake-off variation D).
// Reference: Descript "New Project" composer × Spotify for Creators.
// Persona: consumer / prosumer creator.
//
// Server Component shell: textured page background + slim header, then the
// client Composer. Mock shows are loaded statically (no backend).

import { StudioHeader } from "./_components/StudioHeader";
import { Composer } from "./_components/Composer";
import { MOCK_SHOWS } from "./_mock/shows";


export default function CreateStudioDPage() {
  return (
    <div className="h-full w-full overflow-y-auto overscroll-contain bg-textured">
      <StudioHeader />
      <Composer shows={MOCK_SHOWS} />
    </div>
  );
}
