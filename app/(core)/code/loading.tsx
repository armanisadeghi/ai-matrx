import { Skeleton } from "@ai-matrx/design-system";

export default function CodeLoading() {
  return (
    <div
      className="flex h-full w-full overflow-hidden bg-neutral-50 dark:bg-neutral-950"
      style={{ paddingTop: "var(--shell-header-h)" }}
    >
      <div className="w-[18%] shrink-0 border-r border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-[#181818]">
        <Skeleton className="h-9 w-full rounded-none border-b border-neutral-200 dark:border-neutral-800" />
      </div>
      <div className="flex flex-1 flex-col">
        <Skeleton className="h-9 w-full shrink-0 rounded-none border-b border-neutral-200 dark:border-neutral-800" />
        <Skeleton className="min-h-0 w-full flex-1 rounded-none" />
        <Skeleton className="h-8 w-full shrink-0 rounded-none border-t border-neutral-200 dark:border-neutral-800" />
      </div>
      <Skeleton className="h-full w-[20%] shrink-0 rounded-none border-l border-neutral-200 dark:border-neutral-800" />
    </div>
  );
}
