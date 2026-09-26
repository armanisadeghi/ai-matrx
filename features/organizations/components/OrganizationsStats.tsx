import { Skeleton } from "@ai-matrx/design-system";

interface OrganizationsStatsProps {
  loading: boolean;
  organizationCount: number;
}

export function OrganizationsStats({
  loading,
  organizationCount,
}: OrganizationsStatsProps) {
  if (loading) {
    return (
      <div
        className="flex items-center gap-5 flex-wrap"
        role="status"
        aria-busy="true"
        aria-label="Loading organization statistics"
      >
        <span className="sr-only">Loading organization statistics</span>
        <Skeleton className="h-6 w-28" />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-5 flex-wrap">
      <Stat
        value={organizationCount}
        label={organizationCount === 1 ? "organization" : "organizations"}
      />
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-lg font-bold text-foreground tabular-nums">
        {value}
      </span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}
