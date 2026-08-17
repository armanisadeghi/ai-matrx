import { ShieldCheck } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import PageHeader from "@/features/shell/components/header/PageHeader";

export default function SecretsReimagineLoading() {
  return (
    <>
      <PageHeader>
        <div className="flex w-full min-w-0 items-center gap-2 px-1">
          <ShieldCheck className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">
            Credentials
          </span>
        </div>
      </PageHeader>

      <main className="h-full overflow-hidden bg-textured">
        <div className="h-full overflow-y-auto pt-[var(--shell-header-h)] scrollbar-thin">
          <div className="mx-auto w-full max-w-6xl space-y-4 px-3 pb-12 pt-4 sm:px-5 lg:px-8">
            <div className="rounded-xl border border-border bg-card p-2">
              <div className="flex gap-2">
                <Skeleton className="h-10 w-28 rounded-lg" />
                <Skeleton className="h-10 w-36 rounded-lg" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {[0, 1, 2, 3, 4, 5].map((index) => (
                <Skeleton key={index} className="h-14 rounded-xl" />
              ))}
            </div>

            <div className="space-y-3">
              {[0, 1, 2, 3, 4].map((index) => (
                <div
                  key={index}
                  className="rounded-xl border border-border bg-card p-3"
                >
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-10 w-10 shrink-0 rounded-lg" />
                    <div className="min-w-0 flex-1 space-y-2">
                      <Skeleton className="h-4 w-48 max-w-full" />
                      <Skeleton className="h-3 w-32 max-w-full" />
                    </div>
                    <Skeleton className="hidden h-8 w-48 rounded-md sm:block" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
