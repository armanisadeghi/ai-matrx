import { Skeleton } from "@ai-matrx/design-system";

interface OrganizationsStatsProps {
  loading: boolean;
  organizationCount: number;
  teamCount: number;
}

export function OrganizationsStats({
  loading,
  organizationCount,
  teamCount,
}: OrganizationsStatsProps) {
  if (loading) {
    return (
      <div
        className="flex items-center gap-5 flex-wrap"
        role="status"
        aria-busy="true"
        aria-label="Loading workspace statistics"
      >
        <span className="sr-only">Loading workspace statistics</span>
        <Skeleton className="h-6 w-28" />
        <Skeleton className="h-6 w-20" />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-5 flex-wrap">
      <Stat
        value={organizationCount}
        label={organizationCount === 1 ? "workspace" : "workspaces"}
      />
      <Stat value={teamCount} label={teamCount === 1 ? "team" : "teams"} />
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
