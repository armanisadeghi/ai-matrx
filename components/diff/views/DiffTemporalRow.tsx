import { Clock3, Loader2 } from "lucide-react";
import type { DiffChangeMoment, DiffTemporalMetadata } from "../engine/types";
import { formatAbsoluteDate, formatRelativeTime } from "@/utils/datetime";

function ChangeMoment({ moment }: { moment: DiffChangeMoment | undefined }) {
  if (!moment) {
    return (
      <span className="text-muted-foreground/60">Change date unavailable</span>
    );
  }

  const absolute = formatAbsoluteDate(
    moment.timestamp,
    {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    },
    "Date unavailable",
  );
  const relative = formatRelativeTime(moment.timestamp, {
    style: "long",
    fallback: "",
  });

  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
      <Clock3 className="h-3 w-3 shrink-0" />
      <span>
        {moment.label}
        {moment.version != null ? ` in v${moment.version}` : ""}
      </span>
      <span className="font-medium text-foreground/80">{absolute}</span>
      {relative ? <span>({relative})</span> : null}
    </span>
  );
}

export function DiffSideMoment({
  moment,
}: {
  moment: DiffChangeMoment | undefined;
}) {
  return (
    <div className="mt-0.5 text-[10px] font-normal text-muted-foreground">
      <ChangeMoment moment={moment} />
    </div>
  );
}

/**
 * Shared field-history row for the structured diff viewer. It deliberately
 * lives outside field adapters so every entity comparison can add provenance
 * without forking its renderer registry.
 */
export function DiffFieldTemporalRow({
  fieldKey,
  temporalMetadata,
}: {
  fieldKey: string;
  temporalMetadata: DiffTemporalMetadata | undefined;
}) {
  if (!temporalMetadata) return null;

  const field = temporalMetadata.fields?.[fieldKey];
  if (
    !field &&
    !temporalMetadata.loading &&
    !temporalMetadata.unavailableMessage
  ) {
    return null;
  }

  if (temporalMetadata.loading && !field) {
    return (
      <div className="grid grid-cols-[200px_1fr] border-t border-border/40 bg-muted/10 text-[10px] text-muted-foreground">
        <div className="border-r border-border" />
        <div className="flex items-center gap-1.5 px-3 py-1.5">
          <Loader2 className="h-3 w-3 animate-spin" />
          Resolving exact field change dates…
        </div>
      </div>
    );
  }

  if (!field && temporalMetadata.unavailableMessage) {
    return (
      <div className="grid grid-cols-[200px_1fr] border-t border-border/40 bg-amber-500/5 text-[10px] text-amber-700 dark:text-amber-300">
        <div className="border-r border-border" />
        <div className="px-3 py-1.5">{temporalMetadata.unavailableMessage}</div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[200px_1fr_1fr] border-t border-border/40 bg-muted/10 text-[10px] text-muted-foreground">
      <div className="border-r border-border px-3 py-1.5 font-medium">
        Change history
      </div>
      <div className="border-r border-border px-3 py-1.5">
        <ChangeMoment moment={field?.old} />
      </div>
      <div className="px-3 py-1.5">
        <ChangeMoment moment={field?.new} />
      </div>
    </div>
  );
}
