// app/(core)/meetings/page.tsx
//
// THE ONE PLACE A MEETING IS CREATED IN THIS APP. Server Component; the auth
// branch happens server-side so a signed-out visitor is never shown a form that
// cannot submit.

import PageHeader from "@/features/shell/components/header/PageHeader";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import { MeetingsWorkspace } from "@/features/meet/components/MeetingsWorkspace";
import { SignedOutMeetings } from "@/features/meet/components/SignedOutMeetings";

export default async function MeetingsPage() {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) return <SignedOutMeetings />;

  return (
    <>
      <PageHeader>
        <h1 className="text-sm font-semibold">Meetings</h1>
      </PageHeader>
      <div className="h-full overflow-y-auto">
        <MeetingsWorkspace />
      </div>
    </>
  );
}
