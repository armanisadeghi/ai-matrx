"use client";

// A person's own writing voice (brand voice, person mode). Only the person can
// measure or confirm their own voice; the organization it is filed in is asked
// for on the first action through the ONE org funnel (ensureOrgId).

import { useAppSelector } from "@/lib/redux/hooks";
import { selectDisplayName, selectUserId } from "@/lib/redux/selectors/userSelectors";
import { ensureOrgId } from "@/lib/organizations/ensureOrgId";
import { VoicePage } from "@/features/marketing/voice/VoicePage";

export default function PersonVoicePage() {
  const userId = useAppSelector(selectUserId);
  const name = useAppSelector(selectDisplayName);
  if (!userId) return <p className="p-4 text-sm text-muted-foreground">Sign in to measure your writing voice.</p>;
  return (
    <VoicePage
      scope="person"
      ownerId={userId}
      ownerName={name || "Your"}
      organizationId={null}
      resolveOrganization={() => ensureOrgId(null)}
    />
  );
}
