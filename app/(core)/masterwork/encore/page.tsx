// app/(core)/masterwork/encore/page.tsx
//
// Encore — the Operator door. Every released Masterwork the user can reach,
// each one Run in a click. (A Masterwork is released from Masterwork Studio.)

import { redirect } from "next/navigation";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";
import { RecordPageHeader } from "@/features/shell/components/header/templates/RecordPageHeader";
import { EncoreHomePage } from "@/features/masterwork/encore/EncoreHomePage";
import { loginHref } from "@/utils/auth/auth-destination";

export default async function EncoreRoute() {
  const { isAuthenticated } = await getSessionVerdict();
  if (!isAuthenticated) redirect(loginHref("/masterwork/encore"));
  return (
    <>
      <RecordPageHeader record={{ name: "Encore" }} />
      <EncoreHomePage />
    </>
  );
}
