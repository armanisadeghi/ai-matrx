import { Skeleton } from "@/components/ui/skeleton";

export default function AgentDetailLoading() {
  return (
    <div className="h-full flex flex-col overflow-hidden p-4 space-y-4">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-20 w-full" />
    </div>
  );
}
