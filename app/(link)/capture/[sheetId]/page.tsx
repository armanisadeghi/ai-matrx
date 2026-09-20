"use client";

// app/(link)/capture/[sheetId]/page.tsx — THE LINK THE CREW OPENS ON THEIR PHONES.
//
// PRODUCTS row 15: *"Let my crew photograph each bin and log the weight on site."*
//
// WHY IT IS IN `(link)` AND NOT `(core)`. This is a phone, held in one hand, in a yard,
// and it is the whole screen — no product shell, no sidebar, no marketing header. The
// `(link)` group exists for exactly that (lane FORMS moved `/f/<id>` into it after a first
// render showed a patient intake form wearing our Download / Sign in header). It is the
// same reason, one screen further: chrome here is somebody scrolling past a question while
// holding a clipboard.
//
// WHY IT IS SIGNED-IN AND `/f/<id>` IS NOT. A public form is answered by a stranger, so
// the unguessable link IS the capability and the server has to be the caller. A capture
// sheet is answered by a MEMBER of the organization holding `editor` on the Table, so the
// browser calls the five `custom.capture_*` doors as ITSELF, with that person's own
// session, and the doors decide. The link is an address, not a secret: a crew member who
// drops their phone in a skip has leaked nothing.
//
// WHY THE ORGANIZATION IS NOT ASKED FOR. `custom.capture_open` takes the organization id,
// and the phone has one: whichever organization the person is in. If they are in the wrong
// one the door answers with no row and the screen says so in words — it does not guess, and
// it does not show a picker to somebody standing at a bin.

import { use } from "react";
import Link from "next/link";
import { CaptureRun, RecordsMount, personActor, recordsDataSource } from "@ai-matrx/records-ui";

import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { useOrganizationRequired } from "@/features/organizations/useOrganizationRequired";
import { OrganizationContextNotice } from "@/features/organizations/components/OrganizationRequiredNotice";
import { createClient } from "@/utils/supabase/client";
import { UNIFIED_DATA_CAMPAIGN } from "@/lib/knobs/unifiedDataCampaign";
import { useUnifiedDataCampaign } from "@/lib/knobs/useUnifiedDataCampaignGate";
import { uploadCaptureFile } from "@/features/capture/uploadCaptureFile";

export default function CrewCaptureRoute({
  params,
}: {
  params: Promise<{ sheetId: string }>;
}) {
  const { sheetId } = use(params);
  const userId = useAppSelector(selectUserId);
  const { organizationId, organizationState } = useOrganizationRequired();
  // ONE SWITCH, the same one every other unified-data screen reads: does THIS
  // organization keep its data in the record store? A crew member arriving on a link
  // from an organization that has not turned it on is told in one sentence, not shown a
  // camera that would be refused at the door.
  const campaign = useUnifiedDataCampaign({
    organizationId,
    organizationState,
    storeSwitch: (organization) => UNIFIED_DATA_CAMPAIGN.enabled(organization),
  });

  return (
    <main className="min-h-dvh bg-background">
      {organizationState !== "ready" ? (
        <div className="p-4">
          <OrganizationContextNotice state={organizationState} what="Capture" />
        </div>
      ) : campaign.on === null ? null : !campaign.on ? (
        <p className="max-w-2xl p-4 text-sm opacity-80">{campaign.because}</p>
      ) : (
        <RecordsMount
          letTheStoreDecideRights
          config={{
            dataSource: recordsDataSource(createClient()),
            actor: personActor(userId),
            organizationId: organizationId!,
          }}
          host={{
            Link,
            density: "condensed",
            // THE ONE BYTE STORE. A photograph and a voice note go where every other
            // captured file on this platform goes — `files.files`, through the files
            // feature's own handler. Inventing a second byte path is that feature's
            // named failure class, and it is not invented here.
            upload: uploadCaptureFile,
          }}
        >
          <CaptureRun sheetId={sheetId} />
        </RecordsMount>
      )}
    </main>
  );
}
