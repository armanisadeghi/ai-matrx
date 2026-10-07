import PageHeader from "@/features/shell/components/header/PageHeader";
import { AppletsGrid } from "@/features/applets/components/applet-listings/AppletsGrid";
import { AppletsListHeader } from "@/features/applets/components/shell/AppletsListHeader";
import AppletsLanding from "@/features/auth/components/module-landing/landings/AppletsLanding";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";

export default async function AppletsListPage() {
  const { isAuthenticated } = await getSessionVerdict();
  if (!isAuthenticated) return <AppletsLanding />;
  return (
    <>
      <PageHeader>
        <AppletsListHeader />
      </PageHeader>

      <div className="h-full overflow-y-auto bg-textured">
        <div className="container mx-auto max-w-[1800px] px-4 pb-6 pt-[calc(var(--shell-header-h)+1rem)] sm:px-6 md:px-8 lg:px-12">
          <AppletsGrid consumerId="apps-main" />
        </div>
      </div>
    </>
  );
}
