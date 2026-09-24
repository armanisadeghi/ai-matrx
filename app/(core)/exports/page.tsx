// app/(core)/exports/page.tsx
//
// /exports — the drop zone. Guests are sent to sign in; there is nothing to
// show somebody who has nowhere to put a Library.

import { redirect } from "next/navigation";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";
import { BringYourExportPage } from "@/features/exports/components/BringYourExportPage";

export default async function ExportsIndexRoute() {
  const { isAuthenticated } = await getSessionVerdict();
  if (!isAuthenticated) redirect("/login?next=/exports");
  return <BringYourExportPage />;
}
