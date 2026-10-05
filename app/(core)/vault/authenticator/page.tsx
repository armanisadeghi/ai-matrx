import { redirect } from "next/navigation";

import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";
import { RecordPageHeader } from "@/features/shell/components/header/templates/RecordPageHeader";
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
      <RecordPageHeader
        backHref="/vault"
        parents={[{ label: "Vault", href: "/vault" }]}
        record={{ name: "Authenticator" }}
      />
      <AuthenticatorWorkspace />
    </>
  );
}
