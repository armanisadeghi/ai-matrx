import { KeyRound } from "lucide-react";

import { AccessRequestsSurface } from "@/features/access-gate/components/AccessRequestsSurface";
import { ModuleSignInGate } from "@/features/auth/components/module-landing/ModuleSignInGate";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/settings/access-requests", {
  titlePrefix: "Access requests",
  title: "Settings",
  description:
    "Answer people asking to open something you own, and track the access you've asked for.",
  letter: "AR",
});

/**
 * /settings/access-requests — the durable home of `iam.access_requests`.
 *
 * The DM chips answer a request where the owner already is; this page is what
 * makes the row reachable when the DM never landed (delivery failure, or an ask
 * filed with no signed-in sender to message from).
 */
export default async function AccessRequestsPage() {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) {
    return (
      <ModuleSignInGate
        title="Access requests"
        route="/settings/access-requests"
        description="Answer people asking to open something you own, and track what you've asked for."
        icon={KeyRound}
      />
    );
  }

  return (
    <div className="h-full overflow-hidden">
      <AccessRequestsSurface />
    </div>
  );
}
