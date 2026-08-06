import { TableSkeleton } from "@/components/user-generated-table-data/TableSkeleton";

export default function Loading() {
  return (
    <div className="w-full h-full overflow-hidden bg-muted/40 pt-[var(--shell-header-h)] p-4 rounded-lg space-y-4">
      <div className="flex justify-between items-center">
        <div className="w-1/3 h-10 bg-muted rounded animate-pulse" />
        <div className="flex space-x-2">
          <div className="w-24 h-10 bg-muted rounded animate-pulse" />
          <div className="w-24 h-10 bg-muted rounded animate-pulse" />
        </div>
      </div>
      <TableSkeleton rows={10} columns={7} />
      <div className="flex justify-between items-center">
        <div className="w-24 h-10 bg-muted rounded animate-pulse" />
        <div className="flex space-x-2">
          <div className="w-10 h-10 bg-muted rounded animate-pulse" />
          <div className="w-10 h-10 bg-muted rounded animate-pulse" />
        </div>
        <div className="w-24 h-10 bg-muted rounded animate-pulse" />
      </div>
    </div>
  );
}
