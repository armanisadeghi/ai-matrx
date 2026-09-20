import { Skeleton } from "@ai-matrx/design-system";

export function DesktopBuilderSkeleton() {
  return (
    <div className="flex h-full">
      <div
        className="h-full overflow-hidden w-full max-w-[640px] shrink-0 px-2"
        style={{ paddingTop: "var(--shell-header-h)" }}
      >
        <div className="flex flex-col h-full">
          <div className="flex flex-col gap-2 shrink-0 pt-0.5 pb-2">
            <Skeleton className="h-9 w-full rounded-md" />
            <Skeleton className="h-6 w-48 rounded-md" />
            <Skeleton className="h-6 w-40 rounded-md" />
          </div>
          <div className="flex flex-col gap-2 flex-1 pr-1">
            <Skeleton className="h-[360px] w-full rounded-lg" />
            <Skeleton className="h-28 w-full rounded-lg" />
            <Skeleton className="h-28 w-full rounded-lg" />
            <Skeleton className="flex-1 w-full rounded-lg" />
          </div>
          <div className="flex items-center justify-end gap-1 shrink-0 py-2 border-t border-border bg-background">
            <Skeleton className="h-7 w-16 rounded-md" />
            <Skeleton className="h-7 w-20 rounded-md" />
          </div>
        </div>
      </div>
      <div className="flex-1 h-full overflow-hidden flex justify-center">
        <div className="w-full max-w-3xl h-full pt-12">
          <div className="flex flex-col h-full overflow-hidden">
            <div className="flex-1 flex items-center justify-center">
              <Skeleton className="h-6 w-32 rounded-md" />
            </div>
            <Skeleton className="h-24 w-full rounded-lg shrink-0" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function MobileBuilderSkeleton() {
  return (
    <div className="flex flex-col gap-4 h-full">
      <Skeleton className="h-10 w-full rounded-lg" />
      <Skeleton className="flex-1 w-full rounded-lg" />
      <Skeleton className="h-10 w-full rounded-lg" />
    </div>
  );
}

export function RightPanelSkeleton() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
        Initializing...
      </div>
    </div>
  );
}
