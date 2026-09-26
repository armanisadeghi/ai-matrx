// The authed creator manage surface (/education/creator). Claim a handle, edit
// your public identity, feature YouTube videos + free tools + classes, publish.
// Signed-in only; every creator_* RPC is gated on auth.uid() owning the row.
// noindex — the PUBLIC page is /c/[handle].

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import { CreatorDashboard } from "@/features/education/creators/components/CreatorDashboard";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

export const metadata: Metadata = {
  title: "Creator page · AI Matrx Education",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function CreatorManagePage() {
  const { user, authUnavailable } = await getServerAuth();
  if (!user) {
    // Could-not-verify is not signed-out — never bounce a signed-in creator to
    // /login over an auth-authority blink.
    if (authUnavailable) {
      console.warn("[/education/creator] identity could not be verified — showing the retry notice, not redirecting.");
      return (
        <div className="mx-auto w-full max-w-3xl px-4 sm:px-6 py-8 text-sm text-muted-foreground">
          We could not verify who you are on this request, so your creator page
          is not loading. You have not been signed out — reload in a moment.
          <ErrorAlchemyMenu />
        </div>
      );
    }
    redirect(`/login?redirectTo=${encodeURIComponent("/education/creator")}`);
  }

  return <CreatorDashboard />;
}
