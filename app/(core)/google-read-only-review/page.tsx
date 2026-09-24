import { redirect } from "next/navigation";

import { ReadOnlySweepWorkspace } from "@/features/marketing/google/ReadOnlySweepWorkspace";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/google-read-only-review", {
  title: "Google read-only connections — AI Matrx",
  description:
    "Connect and verify read-only Google Contacts, Calendar, Tasks, YouTube Analytics, and Tag Manager operations.",
});

export default async function GoogleReadOnlyReviewPage() {
  const { isAuthenticated } = await getSessionVerdict();
  if (!isAuthenticated) {
    redirect(
      `/login?redirectTo=${encodeURIComponent("/google-read-only-review")}`,
    );
  }
  return <ReadOnlySweepWorkspace reviewMode />;
}
