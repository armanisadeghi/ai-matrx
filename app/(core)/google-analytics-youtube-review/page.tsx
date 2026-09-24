import { Suspense } from "react";
import { redirect } from "next/navigation";

import { GoogleAnalyticsYouTubeReviewRoot } from "@/features/marketing/google/GoogleAnalyticsYouTubeReviewRoot";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata(
  "/google-analytics-youtube-review",
  {
    title: "Google Analytics and YouTube — AI Matrx",
    description:
      "Connect read-only Google Analytics and YouTube data to AI Matrx.",
  },
);

export default async function GoogleAnalyticsYouTubeReviewPage() {
  const { isAuthenticated } = await getSessionVerdict();
  if (!isAuthenticated) {
    redirect(
      `/login?redirectTo=${encodeURIComponent("/google-analytics-youtube-review")}`,
    );
  }

  return (
    <Suspense fallback={null}>
      <GoogleAnalyticsYouTubeReviewRoot />
    </Suspense>
  );
}
