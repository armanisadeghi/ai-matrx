"use client";

import {
  AlertTriangle,
  Ban,
  Link2,
  Palette,
  Plug,
  Rocket,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ChangesSummary {
  bindingsCreated: number;
  treatmentsSet: number;
  matchesToConfirm: number;
  cellsUnresolved: number;
  pairsExcluded: number;
  pairsTotal: number;
}

/**
 * The batch receipt. Nothing is written until this is pressed, and the counts
 * are the honest shape of what would be written — including what is NOT ready.
 */
export function ChangesFooter({ summary }: { summary: ChangesSummary }) {
  const blocked = summary.cellsUnresolved > 0 || summary.matchesToConfirm > 0;

  return (
    <div className="sticky bottom-0 z-20 rounded-lg border border-border bg-card/95 px-3 py-2.5 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-card/80">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Changes preview
        </span>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <Stat
            icon={Plug}
            tone="text-emerald-600 dark:text-emerald-400"
            count={summary.bindingsCreated}
            label="bindings created"
          />
          <Dot />
          <Stat
            icon={Palette}
            tone="text-sky-600 dark:text-sky-400"
            count={summary.treatmentsSet}
            label="treatments set"
          />
          <Dot />
          <Stat
            icon={Link2}
            tone="text-amber-600 dark:text-amber-400"
            count={summary.matchesToConfirm}
            label="matches to confirm"
          />
          <Dot />
          <Stat
            icon={AlertTriangle}
            tone="text-rose-600 dark:text-rose-400"
            count={summary.cellsUnresolved}
            label="cells unresolved"
          />
          {summary.pairsExcluded > 0 && (
            <>
              <Dot />
              <Stat
                icon={Ban}
                tone="text-muted-foreground"
                count={summary.pairsExcluded}
                label="pairs excluded"
              />
            </>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground">
            {summary.pairsTotal} job × place pairs
          </span>
          <Button
            size="sm"
            className="h-8 gap-1.5 text-xs"
            disabled
            title="Preview only — this mockup writes nothing"
          >
            <Rocket className="h-3.5 w-3.5" />
            Apply batch
          </Button>
        </div>
      </div>

      {blocked && (
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          Unresolved cells and unconfirmed name matches are written as nothing —
          the batch applies the settled cells and leaves the rest loud.
        </p>
      )}
    </div>
  );
}

function Stat({
  icon: Icon,
  tone,
  count,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone: string;
  count: number;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon className={cn("h-3.5 w-3.5 shrink-0", tone)} />
      <span className="text-sm font-semibold tabular-nums text-foreground">
        {count}
      </span>
      <span className="text-[11px] text-muted-foreground">{label}</span>
    </span>
  );
}

function Dot() {
  return <span className="text-muted-foreground/50">·</span>;
}
