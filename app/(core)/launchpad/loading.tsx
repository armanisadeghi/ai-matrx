import PageHeader from "@/features/shell/components/header/PageHeader";
import HeaderIconTitle from "@/features/shell/components/header/variants/variants/HeaderIconTitle";
import { Skeleton } from "@/components/ui/skeleton";

export default function LaunchpadLoading() {
  return (
    <>
      <PageHeader>
        <HeaderIconTitle icon="Rocket" title="Launchpad" />
      </PageHeader>
      <div className="h-full overflow-hidden bg-textured px-3 pb-10 pt-[calc(var(--shell-header-h)+1rem)] sm:px-5 lg:px-7">
        <div className="mx-auto w-full max-w-[1680px] space-y-5">
          <Skeleton className="h-32 w-full rounded-2xl sm:h-28" />
          <Skeleton className="h-[70px] w-full rounded-2xl" />
          <Skeleton className="h-24 w-full rounded-2xl" />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {Array.from({ length: 8 }, (_, index) => (
              <Skeleton key={index} className="h-36 w-full rounded-2xl" />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
