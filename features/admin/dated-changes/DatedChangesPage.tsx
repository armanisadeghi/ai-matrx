"use client";

/**
 * /administration/automation/scheduling/dated-changes — every dated change, newest date first,
 * each named in plain words with its current → new value, the date as the source stated it,
 * why it is on the reminder, and the one fix beside it (Cancel a scheduled change; Mark resolved
 * a refused or failed one). Both state their consequence before they run and take a note.
 * Editing is cancel-and-recreate: what a change will do is fixed when it is made (DB-enforced).
 */

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertOctagon, AlertTriangle, CalendarClock, CheckCircle2, ExternalLink, XCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@ai-matrx/design-system";
import { TextInputDialog } from "@/components/dialogs/text-input/TextInputDialog";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { toast } from "@/lib/toast";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsSuperAdmin } from "@/lib/redux/selectors/userSelectors";
import { useNow } from "@/hooks/useNow";
import { cn } from "@/lib/utils";
import { DATED_CHANGES_QUERY_KEY } from "@/features/admin/attention/sources/useDatedChangeSource";
import {
  cancelDatedChange,
  fetchDatedChanges,
  resolveDatedChange,
  setDatedChangeTimeZone,
  type DatedChange,
} from "./service";
import { OFFERINGS_PAGE_HREF, describeDatedChange, formatEffective, formatPricing } from "./describe";

const LIST_QUERY_KEY = ["admin-attention", "dated-changes", "all"] as const;

const STATUS_LABEL: Record<DatedChange["status"], string> = {
  scheduled: "Scheduled",
  applied: "Applied",
  refused: "Refused",
  failed: "Failed",
  cancelled: "Cancelled",
};

type Pending = { kind: "cancel" | "resolve" | "zone"; change: DatedChange } | null;

export default function DatedChangesPage() {
  const isSuperAdmin = useAppSelector(selectIsSuperAdmin);
  const queryClient = useQueryClient();
  const now = useNow();
  const [pending, setPending] = useState<Pending>(null);
  const [busy, setBusy] = useState(false);

  const query = useQuery<DatedChange[]>({
    queryKey: LIST_QUERY_KEY,
    queryFn: () => fetchDatedChanges(true),
    enabled: Boolean(isSuperAdmin),
    retry: false,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: LIST_QUERY_KEY });
    void queryClient.invalidateQueries({ queryKey: DATED_CHANGES_QUERY_KEY });
  };

  const onConfirm = async (note: string) => {
    if (!pending) return;
    setBusy(true);
    try {
      if (pending.kind === "cancel") {
        await cancelDatedChange(pending.change.id, note.trim());
        toast.success("Cancelled. The price will not change on that date.");
      } else if (pending.kind === "zone") {
        await setDatedChangeTimeZone(pending.change.id, note.trim());
        toast.success("Time zone confirmed. The change now applies at midnight in that zone.");
      } else {
        await resolveDatedChange(pending.change.id, note.trim());
        toast.success("Marked resolved. It leaves the reminder, with your note kept on the change.");
      }
      setPending(null);
      refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  if (!isSuperAdmin) {
    return (
      <div className="h-full overflow-y-auto px-4 py-4 sm:px-6">
        <p className="text-sm text-muted-foreground">Dated changes are shown to super admins only.</p>
      </div>
    );
  }

  const changes = query.data ?? [];

  return (
    <div className="h-full overflow-y-auto px-4 py-4 sm:px-6 space-y-4 max-w-4xl" data-surface-value="dated_changes">
      <div className="flex items-start gap-2">
        <CalendarClock className="mt-0.5 h-5 w-5 text-primary" aria-hidden />
        <p className="text-sm text-muted-foreground">
          Changes stored now and applied on their date — today, model prices a provider announced ahead. Each
          applies only if the value is still the one it expected; otherwise it is refused and nothing changes.
        </p>
      </div>

      {query.isError ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Dated changes could not be read</AlertTitle>
          <AlertDescription className="text-xs">
            {query.error instanceof Error ? query.error.message : String(query.error)} — a refused or overdue change
            would not be visible here until this read works, so treat this as unknown, not healthy.
            <Button variant="outline" size="sm" className="ml-2 h-6 text-xs" onClick={refresh}>
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {query.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-md" />
          ))}
        </div>
      ) : null}

      {query.isSuccess && changes.length === 0 ? (
        <p className="text-sm text-muted-foreground">No dated change has been scheduled yet.</p>
      ) : null}

      <ul className="space-y-2">
        {changes.map((change) => {
          const words = describeDatedChange(change, now);
          const critical = words.severity === "critical" && change.attention !== null;
          const needsAttention = change.attention !== null;
          const Icon =
            change.status === "applied"
              ? CheckCircle2
              : change.status === "cancelled"
                ? XCircle
                : critical
                  ? AlertOctagon
                  : needsAttention
                    ? AlertTriangle
                    : CalendarClock;
          return (
            <li
              key={change.id}
              id={change.id}
              className={cn(
                "rounded-lg border bg-card p-3 scroll-mt-24",
                critical ? "border-destructive/50" : "border-border",
              )}
              data-testid="dated-change-row"
            >
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <Icon
                  className={cn(
                    "h-4 w-4 shrink-0",
                    critical ? "text-destructive" : needsAttention ? "text-warning" : "text-muted-foreground",
                  )}
                  aria-hidden
                />
                <EntityRef
                  token="ai_offering"
                  id={change.targetRowId}
                  name={words.title}
                  href={OFFERINGS_PAGE_HREF}
                  openInNewTab
                  labelClassName="font-medium text-foreground"
                />
                <Badge variant={critical ? "destructive" : "secondary"} className="text-[11px]">
                  {STATUS_LABEL[change.status]}
                </Badge>
                {change.attention ? <span className="text-[11px] text-muted-foreground">{words.state}</span> : null}
              </div>

              <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-[8rem_1fr]">
                <dt className="text-muted-foreground">Date</dt>
                <dd>{formatEffective(change)}</dd>
                <dt className="text-muted-foreground">Price today</dt>
                <dd>{formatPricing(change.currentValue)} per million tokens</dd>
                <dt className="text-muted-foreground">Expected</dt>
                <dd>{formatPricing(change.expected)}</dd>
                <dt className="text-muted-foreground">New</dt>
                <dd>{formatPricing(change.newValue)}</dd>
                <dt className="text-muted-foreground">Why</dt>
                <dd>{change.reason}</dd>
                {change.effectiveNote ? (
                  <>
                    <dt className="text-muted-foreground">Source says</dt>
                    <dd>{change.effectiveNote}</dd>
                  </>
                ) : null}
                {change.resolutionNote ? (
                  <>
                    <dt className="text-muted-foreground">Resolved</dt>
                    <dd>{change.resolutionNote}</dd>
                  </>
                ) : null}
              </dl>

              {change.attention ? <p className="mt-2 text-xs text-foreground">{words.sentence}</p> : null}

              <div className="mt-2 flex flex-wrap items-center gap-2">
                {change.sourceUrl ? (
                  <a
                    href={change.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:text-primary hover:underline"
                  >
                    <ExternalLink className="h-3 w-3" aria-hidden />
                    The provider&apos;s page
                  </a>
                ) : null}
                {change.status === "scheduled" && !change.timeZone ? (
                  <Button
                    size="sm"
                    variant={change.attention === "zone_unconfirmed" ? "default" : "outline"}
                    className="h-7 text-xs"
                    onClick={() => setPending({ kind: "zone", change })}
                  >
                    Confirm time zone
                  </Button>
                ) : null}
                {change.status === "scheduled" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => setPending({ kind: "cancel", change })}
                  >
                    Cancel this change
                  </Button>
                ) : null}
                {(change.status === "refused" || change.status === "failed") && !change.resolvedAt ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => setPending({ kind: "resolve", change })}
                  >
                    Mark resolved
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      <TextInputDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setPending(null);
        }}
        title={
          pending?.kind === "zone"
            ? `Which time zone does the ${pending.change.targetLabel ?? "model"} price change use?`
            : pending?.kind === "cancel"
              ? `Cancel the ${pending.change.targetLabel ?? "model"} price change?`
              : `Mark the ${pending?.change.targetLabel ?? "model"} price change resolved?`
        }
        description={
          pending?.kind === "zone"
            ? `The source names no time zone, so the change is read as ${formatEffective(pending.change).split(" (")[0]} UTC. Enter the zone the provider bills on (for example America/Los_Angeles, or UTC to keep it). The moment it applies is recomputed from that; it can be set once — to change a stated zone, cancel the change and schedule it again.`
            : pending?.kind === "cancel"
            ? `On ${formatEffective(pending.change)} the price will stay ${formatPricing(pending.change.expected)} instead of becoming ${formatPricing(pending.change.newValue)}. This cannot be undone — schedule a new change if it is still needed. Say why.`
            : "It leaves the reminder for every super admin. Say what was done — for example, the price was set by hand or a corrected change was scheduled."
        }
        placeholder={
          pending?.kind === "zone"
            ? "e.g. America/Los_Angeles"
            : pending?.kind === "cancel"
              ? "e.g. Google extended the introductory price."
              : "e.g. Set the new price by hand on the offerings page."
        }
        multiline={pending?.kind !== "zone"}
        rows={3}
        confirmLabel={pending?.kind === "zone" ? "Confirm time zone" : pending?.kind === "cancel" ? "Cancel the change" : "Mark resolved"}
        busy={busy}
        onConfirm={onConfirm}
      />
    </div>
  );
}
