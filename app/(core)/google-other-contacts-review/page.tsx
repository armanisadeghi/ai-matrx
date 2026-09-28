import { redirect } from "next/navigation";

import { OtherContactsReview } from "@/features/google-workspace/OtherContactsReview";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/google-other-contacts-review", {
  title: "Google Other Contacts review — AI Matrx",
  description: "Internal review of bounded Google Other Contacts CRM imports.",
});

export default async function GoogleOtherContactsReviewPage() {
  const session = await getSessionVerdict();
  if (!session.isAuthenticated) {
    redirect(`/login?redirectTo=${encodeURIComponent("/google-other-contacts-review")}`);
  }
  // The browser-side reviewer affordance and every provider call independently
  // enforce the internal-test identity. The JWT verdict intentionally contains
  // no role/email policy projection here.
  return <OtherContactsReview />;
}
