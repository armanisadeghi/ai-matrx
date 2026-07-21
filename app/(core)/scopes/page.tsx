import { ScopesHub } from "@/features/scopes/components/management/ScopesHub";
import { ScopesHubHeader } from "@/features/scopes/components/management/ScopesHubHeader";
import ScopesLanding from "@/features/auth/components/module-landing/landings/ScopesLanding";
import { getServerAuth } from "@/utils/supabase/getServerAuth";


export default async function ScopesIndexPage() {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) return <ScopesLanding />;
  return (
    <>
      <ScopesHubHeader />
      <div className="h-full overflow-y-auto bg-textured pt-[var(--shell-header-h)]">
        <div className="w-full p-4 md:p-6">
          <ScopesHub />
        </div>
      </div>
    </>
  );
}
