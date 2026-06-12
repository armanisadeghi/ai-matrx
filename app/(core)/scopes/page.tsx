import { ScopesHub } from "@/features/scopes/components/management/ScopesHub";
import ScopesLanding from "@/features/auth/components/module-landing/landings/ScopesLanding";
import { getServerAuth } from "@/utils/supabase/getServerAuth";


export default async function ScopesIndexPage() {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) return <ScopesLanding />;
  return (
    <div className="h-[calc(100dvh-var(--header-height))] overflow-y-auto bg-textured">
      <div className="max-w-6xl mx-auto p-6 md:p-8">
        <ScopesHub />
      </div>
    </div>
  );
}
