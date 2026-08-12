"use client";

/**
 * PlanDriftSheet — the drift worklist. Every row obeys THE DOOR LAW: the
 * planned page opens its node, the live page opens in a new tab, and the
 * verdict says what differs ("the plan says /a; the site serves /b") — never
 * a timestamp, never a bare id. Every row that HAS a repair carries it, and
 * a repair is dry-run first: the confirm dialog shows the server's own
 * account of what would happen before anything is applied.
 */
import { useState } from "react";
import { ArrowUpRight, CircleAlert, GitBranch, Loader2, Unlink } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

import type { DriftItem } from "../lib/drift";
import type { DriftRepair, RepairOutcome, usePlanDrift } from "../hooks/usePlanDrift";

/** Big crawls can surface thousands of orphans — cap the synchronous DOM and
 * say so, rather than pretending the list is complete. */
const RENDER_CAP = 300;

export type DriftFilter = "all" | "ghost" | "conflict" | "orphan";

const FILTER_LABEL: Record<DriftFilter, string> = {
  all: "Everything",
  ghost: "Not live",
  conflict: "Route conflicts",
  orphan: "Not in the plan",
};

type Drift = ReturnType<typeof usePlanDrift>;

export function PlanDriftSheet({
  open,
  onOpenChange,
  filter,
  onFilterChange,
  drift,
  onOpenNode,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filter: DriftFilter;
  onFilterChange: (filter: DriftFilter) => void;
  drift: Drift;
  /** The door for a planned page: select it in the workspace. */
  onOpenNode: (nodeId: string) => void;
}) {
  const [pending, setPending] = useState<{
    repair: DriftRepair;
    outcome: RepairOutcome;
  } | null>(null);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  const { model, repairsFor, publishPending, preview, apply } = drift;
  const items = model.items.filter(
    (item) => filter === "all" || item.kind === filter,
  );

  const startRepair = async (repair: DriftRepair) => {
    setPreviewing(repair.id);
    const outcome = await preview(repair);
    setPreviewing(null);
    setPending({ repair, outcome });
  };

  const confirmRepair = async () => {
    if (!pending) return;
    setApplying(true);
    const outcome = await apply(pending.repair);
    setApplying(false);
    setPending(null);
    if (outcome.ok) {
      toast.success(
        outcome.changed > 0
          ? `Done — ${outcome.changed} change${outcome.changed === 1 ? "" : "s"} applied.`
          : "Nothing needed changing — it was already in this state.",
      );
    } else {
      toast.error(outcome.lines[0] ?? "The repair failed.");
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="flex w-full flex-col sm:w-[560px] sm:max-w-[560px]"
        >
          <SheetHeader>
            <SheetTitle>Plan vs. the live site</SheetTitle>
          </SheetHeader>

          <div className="flex flex-wrap gap-1 px-4">
            {(Object.keys(FILTER_LABEL) as DriftFilter[]).map((value) => {
              const count =
                value === "all"
                  ? model.counts.total
                  : value === "ghost"
                    ? model.counts.ghosts
                    : value === "conflict"
                      ? model.counts.conflicts
                      : model.counts.orphans;
              return (
                <Button
                  key={value}
                  variant={filter === value ? "secondary" : "ghost"}
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => onFilterChange(value)}
                >
                  {FILTER_LABEL[value]}
                  <span className="ml-1.5 tabular-nums text-muted-foreground">
                    {count}
                  </span>
                </Button>
              );
            })}
          </div>

          {publishPending && (filter === "all" || filter === "ghost") ? (
            <div className="mx-4 rounded border border-border bg-muted/40 px-3 py-2">
              <p className="text-xs text-muted-foreground">
                {publishPending.explainer}
              </p>
              <Button
                size="sm"
                className="mt-2 h-7 text-xs"
                disabled={previewing === publishPending.id}
                onClick={() => void startRepair(publishPending)}
              >
                {previewing === publishPending.id ? (
                  <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                ) : null}
                {publishPending.label}
              </Button>
            </div>
          ) : null}

          <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-2">
            {items.length === 0 ? (
              <li className="rounded border border-border px-3 py-6 text-center text-sm text-muted-foreground">
                Nothing here — the plan and the live site agree.
              </li>
            ) : null}
            {items.slice(0, RENDER_CAP).map((item) => (
              <DriftRow
                key={item.key}
                item={item}
                repairs={repairsFor(item)}
                previewingId={previewing}
                onRepair={startRepair}
                onOpenNode={onOpenNode}
              />
            ))}
            {items.length > RENDER_CAP ? (
              <li className="px-1 py-2 text-xs text-muted-foreground">
                Showing the first {RENDER_CAP} of {items.length}. Repair some,
                or narrow the filter above — nothing else is hidden.
              </li>
            ) : null}
          </ul>

          {model.unreadable.length > 0 ? (
            <div className="border-t border-border px-4 py-2">
              <p className="text-[11px] font-medium text-amber-600 dark:text-amber-400">
                {model.unreadable.length} record
                {model.unreadable.length === 1 ? "" : "s"} could not be read and
                {model.unreadable.length === 1 ? " was" : " were"} skipped:
              </p>
              <ul className="mt-1 space-y-0.5">
                {model.unreadable.slice(0, 5).map((line, index) => (
                  <li key={index} className="text-[11px] text-muted-foreground">
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(next) => {
          if (!next) setPending(null);
        }}
        title={pending?.repair.label ?? ""}
        description={pending?.repair.explainer}
        variant={pending?.repair.tone === "destructive" ? "destructive" : "default"}
        confirmLabel={pending?.repair.label ?? "Apply"}
        busy={applying}
        contentClassName="sm:max-w-lg"
        content={
          pending ? (
            <div className="rounded border border-border bg-muted/40 p-2">
              <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Preview — what would happen
              </p>
              {pending.outcome.lines.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  The server reported no changes for this action.
                </p>
              ) : (
                <ul className="max-h-48 space-y-0.5 overflow-y-auto">
                  {pending.outcome.lines.map((line, index) => (
                    <li
                      key={index}
                      className={cn(
                        "break-words text-xs",
                        pending.outcome.ok
                          ? "text-foreground"
                          : "text-destructive",
                      )}
                    >
                      {line}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null
        }
        onConfirm={confirmRepair}
      />
    </>
  );
}

const TONE_CLASS = {
  danger: "bg-destructive/15 text-destructive",
  warning: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  info: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
} as const;

/** Static classes only — Tailwind cannot see an interpolated class name. */
const TONE_ICON_CLASS = {
  danger: "text-destructive",
  warning: "text-amber-600 dark:text-amber-400",
  info: "text-sky-600 dark:text-sky-400",
} as const;

function DriftRow({
  item,
  repairs,
  previewingId,
  onRepair,
  onOpenNode,
}: {
  item: DriftItem;
  repairs: DriftRepair[];
  previewingId: string | null;
  onRepair: (repair: DriftRepair) => void;
  onOpenNode: (nodeId: string) => void;
}) {
  const tone =
    item.kind === "conflict"
      ? "danger"
      : item.kind === "orphan"
        ? "info"
        : item.severity === "high"
          ? "danger"
          : "warning";
  const Icon =
    item.kind === "conflict"
      ? GitBranch
      : item.kind === "orphan"
        ? Unlink
        : CircleAlert;
  // The live address to open, whichever witness gave us one.
  const externalUrl =
    item.kind === "orphan"
      ? item.url
      : item.kind === "conflict"
        ? item.liveUrl
        : (item.liveUrl ?? item.previewUrl);

  return (
    <li className="rounded border border-border px-3 py-2">
      <div className="flex items-start gap-2">
        <Icon className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", TONE_ICON_CLASS[tone])} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {item.kind === "orphan" ? (
              <span className="break-all text-sm font-medium text-foreground">
                {item.title}
              </span>
            ) : (
              // THE DOOR LAW: the name of a planned page IS the door to it.
              <button
                type="button"
                className="break-words text-left text-sm font-medium text-primary underline-offset-2 hover:underline"
                onClick={() => onOpenNode(item.nodeId)}
              >
                {item.title}
              </button>
            )}
            <Badge
              variant="secondary"
              className={cn("px-1.5 text-[10px]", TONE_CLASS[tone])}
            >
              {item.kind === "conflict"
                ? "route conflict"
                : item.kind === "orphan"
                  ? "not in the plan"
                  : item.reason === "not_built"
                    ? "not built"
                    : item.reason === "not_published"
                      ? "draft only"
                      : "not crawled"}
            </Badge>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{item.verdict}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {externalUrl ? (
              <a
                href={externalUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground hover:bg-accent"
              >
                {item.kind === "conflict" ? item.pageRoute : item.route}
                <ArrowUpRight className="h-3 w-3" />
              </a>
            ) : (
              <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                {item.kind === "conflict" ? item.nodeRoute : item.route}
              </span>
            )}
            {repairs.map((repair) => (
              <Button
                key={repair.id}
                size="sm"
                variant={repair.tone === "destructive" ? "outline" : "secondary"}
                className="h-6 px-2 text-[11px]"
                title={repair.explainer}
                disabled={previewingId === repair.id}
                onClick={() => onRepair(repair)}
              >
                {previewingId === repair.id ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                ) : null}
                {repair.label}
              </Button>
            ))}
            {repairs.length === 0 && item.kind === "orphan" ? (
              <span className="text-[11px] text-muted-foreground">
                No automatic fix — this URL is not a page on the connected site.
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </li>
  );
}
