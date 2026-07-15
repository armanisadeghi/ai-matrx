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
        <div className="max-w-6xl mx-auto p-6 md:p-8">
          <ScopesHub />
        </div>
      </div>
    </>
  );
}
