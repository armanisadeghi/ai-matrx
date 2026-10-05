import { redirect } from "next/navigation";
import { RecordPageHeader } from "@/features/shell/components/header/templates/RecordPageHeader";
import { AssistsManager } from "@/features/assists/manager/AssistsManager";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";
import { loginHref } from "@/utils/auth/auth-destination";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/assists", {
  title: "Assists",
  description: "Every assist the system has offered you, in every state.",
  canonicalPath: "/assists",
});

export default async function AssistsPage() {
  const { isAuthenticated } = await getSessionVerdict();
  if (!isAuthenticated) redirect(loginHref("/assists"));

  return (
    <>
      <RecordPageHeader record={{ name: "Assists" }} />
      <div className="flex h-full flex-col overflow-hidden bg-textured pt-[var(--shell-header-h)]">
        <div className="min-h-0 flex-1">
          <AssistsManager />
        </div>
      </div>
    </>
  );
}
