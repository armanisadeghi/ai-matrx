/**
 * app/(core)/files/webhooks/page.tsx
 *
 * Outbound webhook management. Register HTTPS endpoints to receive signed
 * callbacks when your events fire. CRUD is owner-scoped direct-to-DB; delivery
 * runs DB-side (files.webhook_* pipeline). See features/files/webhooks/.
 */

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import { WebhooksManager } from "@/features/files/webhooks/components/WebhooksManager";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { ChevronLeftTapButton } from "@/components/icons/tap-buttons";

export const metadata: Metadata = { title: "Webhooks | Files" };

export default async function FilesWebhooksPage() {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) {
    // Guests never see the workspace shell — bounce to the /files landing.
    redirect("/files");
  }
  return (
    <>
      <RouteHeader
        left={
          <>
            <ChevronLeftTapButton href="/files" ariaLabel="Back to Files" />
            <span className="ml-2 truncate text-sm font-medium text-foreground">
              Webhooks
            </span>
          </>
        }
      />
      <div className="h-full overflow-y-auto bg-textured">
        <WebhooksManager />
      </div>
    </>
  );
}
