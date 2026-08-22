import { Suspense } from "react";
import { redirect } from "next/navigation";

import { GoogleAnalyticsYouTubeReviewRoot } from "@/features/marketing/google/GoogleAnalyticsYouTubeReviewRoot";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
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
  const { isAuthenticated } = await getServerAuth();
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
