"use client";

// Profile › Writing voice — a person's own measured writing voice (brand-voice
// system, person scope; `features/marketing/voice`). Only the person can
// measure or confirm it; the organization it is filed in is asked for on the
// first action through the ONE org funnel (ensureOrgId). Rendered by the
// settings core (route, Preferences window, phone drawer); the old
// `/settings/profile/voice` URL redirects here.

import { useAppSelector } from "@/lib/redux/hooks";
import { selectDisplayName, selectUserId } from "@/lib/redux/selectors/userSelectors";
import { ensureOrgId } from "@/lib/organizations/ensureOrgId";
import { withOrganizationRefusalShown } from "@ai-matrx/chat/host/org";
import { VoicePage } from "@/features/marketing/voice/VoicePage";

export default function WritingVoiceTab() {
  const userId = useAppSelector(selectUserId);
  const name = useAppSelector(selectDisplayName);
  if (!userId) return null;
  return (
    <VoicePage
      scope="person"
      ownerId={userId}
      ownerName={name || "Your"}
      organizationId={null}
      resolveOrganization={() => withOrganizationRefusalShown("measured", () => ensureOrgId(null))}
      embedded
    />
  );
}
