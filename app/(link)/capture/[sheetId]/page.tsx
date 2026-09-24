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
// WHY THE ORGANIZATION IS NOT ASKED FOR — AND NOT TAKEN FROM THE PHONE EITHER (lane
// ACCESS-IS-PERSONAL, owner's law 2026-09-23: "the permission is to the person, not the org").
// `custom.capture_open` takes the organization id. It used to be handed whichever organization
// the person happened to be working in, so a crew member of Rincon who last worked in her
// franchise group got "no such sheet" at the bin. The SHEET names its own organization now:
// `custom.where_id_opens(<sheet>)` answers it, only for somebody who may open the sheet's
// Table, and the door is handed that. Nobody standing at a bin is shown a picker, and nobody
// is refused for having picked the wrong thing earlier.

import { use, useMemo } from "react";
import Link from "next/link";
import { Button } from "@ai-matrx/design-system";
import { CaptureRun, RecordsMount, personActor, recordsDataSource } from "@ai-matrx/records-ui";

import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { OrganizationContextNotice } from "@/features/organizations/components/OrganizationRequiredNotice";
import type { OrganizationState } from "@/features/organizations/useOrganizationRequired";
import { useObjectOrganization } from "@/features/unified-data/objectOrganization";
import { createClient } from "@/utils/supabase/client";
import { UNIFIED_DATA_CAMPAIGN } from "@/lib/knobs/unifiedDataCampaign";
import { useUnifiedDataCampaign } from "@/lib/knobs/useUnifiedDataCampaignGate";
import { UnifiedDataSwitchNotice } from "@/features/unified-data/components/UnifiedDataSwitchNotice";
import { uploadCaptureFile } from "@/features/capture/uploadCaptureFile";

export default function CrewCaptureRoute({
  params,
}: {
  params: Promise<{ sheetId: string }>;
}) {
  const { sheetId } = use(params);
  const userId = useAppSelector(selectUserId);
  const dataSource = useMemo(() => recordsDataSource(createClient()), []);
  const sheet = useObjectOrganization(dataSource, sheetId);
  const organizationId: string | null =
    sheet.state === "found" ? sheet.organizationId : sheet.state === "stand-in" ? sheet.activeOrganizationId : null;
  const organizationState: OrganizationState =
    sheet.state === "stand-in" ? sheet.organizationState : organizationId ? "ready" : "resolving";
  // ONE SWITCH, the same one every other unified-data screen reads: does THIS
  // organization keep its data in the record store? A crew member arriving on a link
  // from an organization that has not turned it on is told in one sentence, not shown a
  // camera that would be refused at the door.
  const campaign = useUnifiedDataCampaign({
    organizationId,
    organizationState,
    storeSwitch: (organization) => UNIFIED_DATA_CAMPAIGN.check(organization),
  });

  return (
    <main className="min-h-dvh bg-background">
      {sheet.state === "resolving" ? (
        <p className="p-4 text-sm text-muted-foreground">Opening the capture sheet&hellip;</p>
      ) : sheet.state === "not-given" ? (
        <div className="space-y-2 p-4">
          <p className="text-sm font-medium">You have not been given this capture sheet</p>
          <p className="text-xs text-muted-foreground">
            It opens for anyone who can open its table. Nobody has given you that table, or the
            sheet no longer exists. Ask whoever sent you this link to share the table with you.
          </p>
        </div>
      ) : sheet.state === "unavailable" ? (
        <div className="space-y-2 p-4">
          <p className="text-sm font-medium">We could not open this capture sheet</p>
          <p className="text-xs text-muted-foreground">
            The record store did not answer, so nothing was opened. This is not an answer about
            your access. {sheet.why}
          </p>
          <Button size="sm" variant="outline" onClick={sheet.retry}>
            Try again
          </Button>
        </div>
      ) : organizationState !== "ready" ? (
        <div className="p-4">
          <OrganizationContextNotice state={organizationState} what="Capture" />
        </div>
      ) : campaign.state !== "on" ? (
        /* THE ONE NOTICE — resolving, could-not-check and off are three
           different things (lane SHARE-OUT, item 3). */
        <div className="p-4">
          <UnifiedDataSwitchNotice gate={campaign} what="Capture" />
        </div>
      ) : (
        <RecordsMount
          letTheStoreDecideRights
          config={{
            dataSource,
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
