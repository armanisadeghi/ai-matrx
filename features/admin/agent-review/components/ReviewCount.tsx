import { Skeleton } from "@ai-matrx/design-system";
import { cn } from "@/lib/utils";

type ReviewCountProps = {
  count: number;
  loading: boolean;
  skeletonClassName?: string;
};

/** Never present the empty initial array as an authoritative zero count. */
export function ReviewCount({
  count,
  loading,
  skeletonClassName,
}: ReviewCountProps) {
  if (!loading) return count;

  return (
    <span aria-label="loading" className="inline-flex align-middle">
      <Skeleton
        aria-hidden="true"
        className={cn("inline-block h-4 w-6", skeletonClassName)}
      />
    </span>
  );
}
