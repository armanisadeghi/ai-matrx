import { redirect } from "next/navigation";

import { RecordPageHeader } from "@/features/shell/components/header/templates/RecordPageHeader";
import { BringYourWorkPage } from "@/features/connectors/bring-your-work/BringYourWorkPage";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";
import { currentRequestLoginHref } from "@/utils/auth/server-login-href";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/bring-your-work", {
  title: "Connect your AI",
  description: "Connect your own AI to AI Matrx and move your work in from Notion, Airtable or Sheets.",
  canonicalPath: "/bring-your-work",
});

export default async function BringYourWorkRoute() {
  const { isAuthenticated } = await getSessionVerdict();
  if (!isAuthenticated) redirect(await currentRequestLoginHref("/bring-your-work"));

  return (
    <>
      <RecordPageHeader record={{ name: "Connect your AI" }} />
      <div className="flex h-full flex-col overflow-hidden bg-textured pt-[var(--shell-header-h)]">
        <div className="min-h-0 flex-1 overflow-auto">
          <BringYourWorkPage />
        </div>
      </div>
    </>
  );
}
