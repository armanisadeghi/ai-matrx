import { Skeleton } from "@/components/ui/skeleton";

export default function AgentRunLoading() {
  return (
    <div className="flex h-full overflow-hidden">
      {/* Sidebar skeleton — mirrors w-64 from AgentRunPage */}
      <div className="w-64 shrink-0 border-r border-border flex flex-col p-3 gap-2 hidden md:flex">
        <Skeleton className="h-8 w-full rounded-md" />
        <Skeleton className="h-9 w-full rounded-md" />
        <Skeleton className="h-9 w-full rounded-md" />
        <Skeleton className="h-9 w-full rounded-md" />
        <Skeleton className="h-9 w-full rounded-md" />
        <Skeleton className="h-9 w-full rounded-md" />
      </div>
      {/* Main content skeleton — max-w-3xl centered, input fixed at bottom */}
      <div className="flex-1 flex justify-center overflow-hidden min-w-0">
        <div className="w-full max-w-3xl h-full flex flex-col overflow-hidden px-4 pb-4 pt-2 gap-3">
          <div className="flex-1 min-h-0">
            <Skeleton className="h-full w-full rounded-lg" />
          </div>
          <Skeleton className="h-14 w-full shrink-0 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
