import { Suspense } from "react";
import { redirect } from "next/navigation";

import { RecordPageHeader } from "@/features/shell/components/header/templates/RecordPageHeader";
import { ConnectComputerPage } from "@/features/residential-egress/components/ConnectComputerPage";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";
import { currentRequestLoginHref } from "@/utils/auth/server-login-href";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/connect-computer", {
  title: "Connect a computer",
  description:
    "Let AI Matrx use one of your own computers to open pages that block our servers.",
  canonicalPath: "/connect-computer",
});

export default async function ConnectComputerRoute() {
  const { isAuthenticated } = await getSessionVerdict();
  // The helper sends people here as `/connect-computer?code=ABCD-1234`. A
  // signed-out visitor must come BACK to that exact URL, code and all — so the
  // bounce rebuilds the request from the canonical proxy headers through the
  // auth-destination primitive rather than naming a bare path (which would
  // drop the query and strand the person on a page with nothing to approve).
  if (!isAuthenticated) redirect(await currentRequestLoginHref("/connect-computer"));

  return (
    <>
      <RecordPageHeader record={{ name: "Connect a computer" }} />
      <div className="flex h-full flex-col overflow-hidden bg-textured pt-[var(--shell-header-h)]">
        <div className="min-h-0 flex-1 overflow-auto">
          {/* `useSearchParams` needs a boundary; the fallback names what it is
              waiting for rather than showing a bare spinner. */}
          <Suspense
            fallback={
              <p className="mx-auto w-full max-w-3xl px-4 py-6 text-xs text-muted-foreground">
                Reading your connection request…
              </p>
            }
          >
            <ConnectComputerPage />
          </Suspense>
        </div>
      </div>
    </>
  );
}
