import { redirect } from "next/navigation";
import { GmailReadReview } from "@/features/google-workspace/GmailReadReview";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/gmail-read-review", {
  title: "Gmail reading — AI Matrx",
  description:
    "Search and open messages from your connected Gmail account on demand.",
});

export default async function GmailReadReviewPage() {
  const { isAuthenticated } = await getSessionVerdict();
  if (!isAuthenticated) {
    redirect(`/login?redirectTo=${encodeURIComponent("/gmail-read-review")}`);
  }
  return <GmailReadReview />;
}
