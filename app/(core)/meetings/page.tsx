// app/(core)/meetings/page.tsx
//
// THE ONE PLACE A MEETING IS CREATED IN THIS APP. Server Component; the auth
// branch happens server-side so a signed-out visitor is never shown a form that
// cannot submit.

import PageHeader from "@/features/shell/components/header/PageHeader";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";
import { MeetingsWorkspace } from "@/features/meet/components/MeetingsWorkspace";
import { SignedOutMeetings } from "@/features/meet/components/SignedOutMeetings";
import { IntelligenceIndicator } from "@/features/mandates/feature-intelligence/IntelligenceIndicator";
import { MEET_PLACES } from "@/features/meet/intelligence-places";

// The same jobs are disclosed inside every live meeting too (MeetingSurface →
// the package's `headerControls` slot); here they sit beside the list where
// meetings are scheduled.
const MEETING_JOBS = MEET_PLACES.places.flatMap((place) => place.mandateKeys);

export default async function MeetingsPage() {
  const { isAuthenticated } = await getSessionVerdict();
  if (!isAuthenticated) return <SignedOutMeetings />;

  return (
    <>
      <PageHeader>
        <div className="flex min-w-0 items-center gap-1.5">
          <h1 className="truncate text-sm font-semibold">Meetings</h1>
          <IntelligenceIndicator
            feature="meet"
            mandateKeys={MEETING_JOBS}
            label="The AI jobs in every meeting (live notes, answers, the wrap-up)"
          />
        </div>
      </PageHeader>
      <div className="h-full overflow-y-auto">
        <MeetingsWorkspace />
      </div>
    </>
  );
}
