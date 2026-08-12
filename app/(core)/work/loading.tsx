import { Skeleton } from "@/components/ui/skeleton";
import { AiWorkHeader } from "@/features/ai-work/components/AiWorkHeader";

export default function WorkLoading() {
  return (
    <>
      <AiWorkHeader />
      <div className="h-full overflow-hidden px-4 pb-6 pt-[calc(var(--shell-header-h)+0.75rem)] sm:px-6">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 8 }, (_, index) => (
            <Skeleton key={index} className="h-28 w-full rounded-lg" />
          ))}
        </div>
      </div>
    </>
  );
}
