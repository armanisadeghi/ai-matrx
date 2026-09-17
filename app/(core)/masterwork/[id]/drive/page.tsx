// app/(core)/masterwork/[id]/drive/page.tsx
//
// "Interview me while I drive" — the hands-free lane of a Rulebook.
//
// Arman, 2026-09-17: "a little mobile page that is specifically for extracting
// knowledge and expertise from someone while they're driving somewhere. So
// it's net zero time."
//
// It rides the ONE lane scaffold like every other Rulebook working mode
// (`RulebookLaneRoute`), so it gets the access gate, the Rulebook's own
// organization, and the Rulebook surface scope the interviewer resolves its
// bindings from — a lane that hand-rolled any of those would silently get an
// empty scope, which is exactly the "second door" defect the scaffold exists
// to close. `body="bare"` because the page draws its own full-bleed dark
// surface: a frame either IS the chrome or has none.
//
// The short link a person texts themselves is `/drive` (see
// `app/(core)/drive/page.tsx`), which lands here.

"use client";

import { use } from "react";
import { DriveInterviewPage } from "@/features/masterwork/drive/DriveInterviewPage";
import { RulebookLaneRoute } from "@/features/masterwork/components/RulebookLaneRoute";

export default function RulebookDriveRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <RulebookLaneRoute
      rulebookId={id}
      lane="drive"
      title="Drive"
      body="fill"
      requireOwner
      ownerMessage="Only the Rulebook's owner can be interviewed for it — the rules have to come from the Expert themself."
    >
      {({ rulebook }) => (
        <DriveInterviewPage
          rulebookId={rulebook.id}
          rulebookName={rulebook.name}
          rulebookOrganizationId={rulebook.organization_id ?? null}
        />
      )}
    </RulebookLaneRoute>
  );
}
