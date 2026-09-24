import { redirect } from "next/navigation";

import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { AuthenticatorRouteHeader } from "@/features/secrets/components/authenticator/AuthenticatorRouteHeader";
import { AuthenticatorWorkspace } from "@/features/secrets/components/authenticator/AuthenticatorWorkspace";

/**
 * /vault/authenticator — the Matrx Authenticator manage surface.
 *
 * General availability: any signed-in user can enroll, view current rotating
 * codes, and manage their own authenticators. Seeds have no reveal path. Spec:
 * common-docs/systems/clients/matrx-authenticator/FEATURE.md.
 */
export default async function AuthenticatorRoute() {
  const { isAuthenticated } = await getSessionVerdict();
  if (!isAuthenticated) redirect("/login?next=/vault/authenticator");

  return (
    <>
      <PageHeader>
        <AuthenticatorRouteHeader />
      </PageHeader>
      <AuthenticatorWorkspace />
    </>
  );
}
