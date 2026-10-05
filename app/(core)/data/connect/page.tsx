// app/(core)/data/connect/page.tsx — THE MOUNT for "Connect a database" (lane VISION-REACH,
// wave 3). The page is features/unified-data/connect-database/ConnectDatabasePage.tsx.

import { redirect } from "next/navigation";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";
import { loginHref } from "@/utils/auth/auth-destination";
import { ConnectDatabasePage } from "@/features/unified-data/connect-database/ConnectDatabasePage";

export default async function ConnectDatabaseRoutePage() {
  const { isAuthenticated } = await getSessionVerdict();
  if (!isAuthenticated) redirect(loginHref("/data/connect"));
  return <ConnectDatabasePage />;
}
