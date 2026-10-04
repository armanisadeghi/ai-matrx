import { FileSignature } from "lucide-react";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";
import { ModuleSignInGate } from "@/features/auth/components/module-landing/ModuleSignInGate";

export default async function EsignLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = await getSessionVerdict();
  if (!isAuthenticated) {
    return (
      <ModuleSignInGate
        title="E-Signatures"
        route="/esign"
        description="Send documents for signature and track every signer."
        icon={FileSignature}
      />
    );
  }
  return children;
}
