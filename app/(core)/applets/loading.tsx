import PageHeader from "@/features/shell/components/header/PageHeader";
import { AppletsListHeader } from "@/features/applets/components/shell/AppletsListHeader";
import { AppletsGridSkeleton } from "@/features/applets/components/applet-listings/AppletsGridSkeleton";

export default function AppletsLoading() {
  return (
    <>
      <PageHeader>
        <AppletsListHeader />
      </PageHeader>
      <div className="h-full overflow-hidden bg-textured">
        <div className="container mx-auto max-w-[1800px] px-4 pb-6 pt-[calc(var(--shell-header-h)+1rem)] sm:px-6 md:px-8 lg:px-12">
          <AppletsGridSkeleton />
        </div>
      </div>
    </>
  );
}
