import { redirect } from "next/navigation";
import { GoogleWorkspaceReviewRoot } from "@/features/google-workspace/GoogleWorkspaceReviewRoot";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import { createRouteMetadata } from "@/utils/route-metadata";

const REVIEW_PICKER_QUERY = "AI Matrx OAuth Review";

export const metadata = createRouteMetadata("/google-workspace-review", {
  title: "Google Workspace — AI Matrx",
  description:
    "Connect selected Google Docs and Sheets and send explicitly reviewed Gmail messages with AI Matrx.",
});

export default async function GoogleWorkspaceReviewPage() {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) {
    redirect(
      `/login?redirectTo=${encodeURIComponent("/google-workspace-review")}`,
    );
  }

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="border-b bg-card/80 px-4 py-3 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <span className="text-sm font-semibold tracking-wide">AI Matrx</span>
          <span className="text-xs text-muted-foreground">
            Google Workspace connection
          </span>
        </div>
      </div>
      <GoogleWorkspaceReviewRoot pickerInitialQuery={REVIEW_PICKER_QUERY} />
    </main>
  );
}
