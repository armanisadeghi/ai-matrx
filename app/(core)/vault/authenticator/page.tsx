import { redirect } from "next/navigation";

import { getServerAuth } from "@/utils/supabase/getServerAuth";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { AuthenticatorRouteHeader } from "@/features/secrets/components/authenticator/AuthenticatorRouteHeader";
import { AuthenticatorWorkspace } from "@/features/secrets/components/authenticator/AuthenticatorWorkspace";

/**
 * /vault/authenticator — the Matrx Authenticator manage surface.
 *
 * General availability: any signed-in user can enroll and manage their own
 * authenticators. Enroll + manage + consent ONLY (D-15) — there is no code
 * shown anywhere and no "reveal" path. Spec:
 * common-docs/systems/matrx-authenticator/FEATURE.md.
 */
export default async function AuthenticatorRoute() {
  const { isAuthenticated } = await getServerAuth();
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
