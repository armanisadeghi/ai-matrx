import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { VaultRouteHeader } from "@/features/secrets/components/VaultRouteHeader";
import { VaultPage } from "@/features/secrets/components/VaultPage";

export const metadata: Metadata = {
  title: "Credential | Vault | AI Matrx",
};

export default async function VaultItemRoute({
  params,
}: {
  params: Promise<{ itemId: string }>;
}) {
  const { itemId } = await params;
  const { isAuthenticated } = await getSessionVerdict();
  if (!isAuthenticated) {
    redirect(`/login?next=${encodeURIComponent(`/vault/${itemId}`)}`);
  }

  return (
    <>
      <PageHeader>
        <VaultRouteHeader />
      </PageHeader>
      <VaultPage itemId={itemId} />
    </>
  );
}
