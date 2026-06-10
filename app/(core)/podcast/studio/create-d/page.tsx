// app/(core)/podcast/studio/create-d/page.tsx
//
// STUDIO D — Create surface (design bake-off variation D).
// Reference: Descript "New Project" composer × Spotify for Creators.
// Persona: consumer / prosumer creator.
//
// Server Component shell: textured page background + slim header, then the
// client Composer. Mock shows are loaded statically (no backend).

import type { Metadata } from "next";
import { StudioHeader } from "./_components/StudioHeader";
import { Composer } from "./_components/Composer";
import { MOCK_SHOWS } from "./_mock/shows";

export const metadata: Metadata = {
  title: "New Episode — Podcast Studio",
  description:
    "Compose a fully produced two-host podcast episode from any source — topic, document, web page, or recording.",
};

export default function CreateStudioDPage() {
  return (
    <div className="h-full w-full overflow-y-auto overscroll-contain bg-textured">
      <StudioHeader />
      <Composer shows={MOCK_SHOWS} />
    </div>
  );
}
