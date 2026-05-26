import { Skeleton } from "@/components/ui/skeleton";

export default function AgentVersionsLoading() {
  return (
    <div
      className="h-full flex flex-col overflow-hidden"
      style={{ paddingTop: "var(--shell-header-h)" }}
    >
      <div className="shrink-0 flex items-center gap-3 px-4 py-2 border-b border-border">
        <Skeleton className="h-8 w-[200px] rounded-md" />
        <Skeleton className="h-4 w-32" />
        <div className="flex-1" />
        <Skeleton className="h-8 w-48 rounded-md" />
      </div>
      <div className="flex-1 p-4 space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-40 w-full rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}
