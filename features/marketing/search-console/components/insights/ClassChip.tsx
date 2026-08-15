import { cn } from "@/styles/themes/utils";
import { GSC_TRAFFIC_CLASSES } from "@/features/marketing/search-console/types";

export function ClassChip({ trafficClass }: { trafficClass: string | null }) {
  const meta = GSC_TRAFFIC_CLASSES.find((item) => item.key === trafficClass);
  if (!meta) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <span
      className={cn(
        "rounded border border-border bg-card px-1.5 py-0.5 text-[11px] font-medium",
        meta.tone,
      )}
      title={meta.description}
    >
      {meta.label}
    </span>
  );
}
