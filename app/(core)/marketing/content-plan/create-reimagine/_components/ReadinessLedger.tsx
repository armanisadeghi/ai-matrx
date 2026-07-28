"use client";

/**
 * The readiness ledger — persistent, never a day-zero wizard step.
 *
 * Left column of truth: what the archetype PROMISED. Right: what actually
 * exists. Plan-side numbers come from `plan.node`; foundation numbers come from
 * the CMS project through the `/api/cms/*` seam. When there is no CMS site
 * linked the items read "not linked" — an honest unknown, never a fake zero.
 */
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  HelpCircle,
  Link2Off,
  ShieldAlert,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { CardLoading } from "@/components/matrx/LoadingComponents";
import { cn } from "@/lib/utils";

import type { CmsReadiness } from "../_lib/data";
import type { ItemState, Readiness } from "../_lib/readiness";

export interface ReadinessLedgerProps {
  readiness: Readiness;
  cms: CmsReadiness | null;
  cmsLoading: boolean;
  cmsError: string | null;
  onRetryCms: () => void;
  committedArchetype: string | null;
  committedAt: string | null;
  selectedKey: string | null;
}

const STATE_ICON: Record<ItemState, React.ReactNode> = {
  met: <CheckCircle2 className="h-3.5 w-3.5 text-success" />,
  partial: <CircleDashed className="h-3.5 w-3.5 text-warning" />,
  unmet: <AlertTriangle className="h-3.5 w-3.5 text-destructive" />,
  unknown: <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />,
  unlinked: <Link2Off className="h-3.5 w-3.5 text-muted-foreground" />,
};

export function ReadinessLedger(props: ReadinessLedgerProps) {
  const {
    readiness,
    cms,
    cmsLoading,
    cmsError,
    onRetryCms,
    committedArchetype,
    committedAt,
    selectedKey,
  } = props;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Readiness
        </h2>
        {readiness.total > 0 ? (
          <span className="ml-auto font-mono text-[11px] text-muted-foreground">
            {readiness.met}/{readiness.total} foundation
          </span>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto scrollbar-thin p-2.5">
        {readiness.blockers.map((blocker) => (
          <div
            key={blocker.id}
            className={cn(
              "rounded-lg border p-2.5",
              blocker.hard
                ? "border-destructive/40 bg-destructive/10"
                : "border-warning/40 bg-warning/10",
            )}
          >
            <div className="flex items-center gap-1.5">
              <ShieldAlert
                className={cn(
                  "h-3.5 w-3.5",
                  blocker.hard ? "text-destructive" : "text-warning",
                )}
              />
              <span className="text-[12.5px] font-medium text-foreground">
                {blocker.title}
              </span>
            </div>
            <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
              {blocker.detail}
            </p>
          </div>
        ))}

        {committedArchetype ? (
          <div className="rounded-lg border border-border bg-card px-2.5 py-2">
            <p className="text-[11px] text-muted-foreground">
              Committed work order:{" "}
              <span className="font-mono text-foreground">{committedArchetype}</span>
              {committedAt ? (
                <> · {new Date(committedAt).toLocaleDateString()}</>
              ) : null}
            </p>
            {selectedKey && selectedKey !== committedArchetype ? (
              <p className="mt-1 text-[11px] text-warning">
                You are previewing a different shape — committing will re-record
                the work order.
              </p>
            ) : null}
          </div>
        ) : null}

        {readiness.families.length > 0 ? (
          <section>
            <h3 className="px-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Plan coverage
            </h3>
            <div className="mt-1.5 space-y-1.5">
              <CoverageBar
                label="Core pages"
                planned={readiness.corePagesPresent}
                target={readiness.corePagesTotal}
                hint="/"
              />
              {readiness.families.map((family) => (
                <CoverageBar
                  key={family.key}
                  label={family.label}
                  planned={family.planned}
                  target={family.target}
                  hint={family.route}
                  note={
                    family.materialize === "count_only"
                      ? "count only — titles come from research"
                      : undefined
                  }
                />
              ))}
            </div>
          </section>
        ) : null}

        <section>
          <div className="flex items-center gap-1.5 px-0.5">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Foundation
            </h3>
            {cms?.link.linked ? (
              <span className="ml-auto truncate rounded bg-success/15 px-1 text-[10px] font-medium text-success">
                CMS: {cms.link.cmsSlug} ({cms.link.matchedBy})
              </span>
            ) : null}
          </div>

          {cmsLoading ? (
            <div className="mt-1.5">
              <CardLoading />
            </div>
          ) : null}

          {cmsError ? (
            <div className="mt-1.5 rounded-lg border border-destructive/40 bg-destructive/10 p-2.5">
              <p className="text-[11.5px] font-medium text-foreground">
                The CMS side could not be read.
              </p>
              <p className="mt-1 break-words text-[11px] text-muted-foreground">
                {cmsError}
              </p>
              <Button
                variant="secondary"
                size="sm"
                className="mt-1.5 h-6 px-2 text-[11px]"
                onClick={onRetryCms}
              >
                Retry
              </Button>
            </div>
          ) : null}

          {!cmsLoading && !cmsError && cms && !cms.link.linked ? (
            <div className="mt-1.5 rounded-lg border border-border bg-muted/40 p-2.5">
              <div className="flex items-center gap-1.5">
                <Link2Off className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-[11.5px] font-medium text-foreground">
                  No CMS site linked
                </span>
              </div>
              <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                {cms.link.reason ??
                  "Nothing is built yet on the CMS side, so the foundation cannot be measured."}
              </p>
            </div>
          ) : null}

          {readiness.items.length === 0 && !cmsLoading ? (
            <p className="mt-1.5 px-0.5 text-[11px] text-muted-foreground">
              Pick a shape to see what must be pre-established.
            </p>
          ) : null}

          <div className="mt-1.5 space-y-1">
            {readiness.items.map((item) => (
              <div
                key={item.key}
                className="rounded-lg border border-border bg-card px-2 py-1.5"
              >
                <div className="flex items-center gap-1.5">
                  {STATE_ICON[item.state]}
                  <span className="truncate text-[12.5px] text-foreground">
                    {item.label}
                  </span>
                  <span className="ml-auto shrink-0 font-mono text-[11px] text-muted-foreground">
                    {item.state === "unlinked" || item.state === "unknown"
                      ? "?"
                      : item.actual}
                    /{item.required}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-[10.5px] text-muted-foreground/80">
                  {item.declaredAs.startsWith("=") ? (
                    <span className="font-mono">{item.declaredAs} · </span>
                  ) : null}
                  {item.detail}
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function CoverageBar({
  label,
  planned,
  target,
  hint,
  note,
}: {
  label: string;
  planned: number;
  target: number;
  hint: string;
  note?: string;
}) {
  const pct = target === 0 ? (planned > 0 ? 100 : 0) : Math.min(100, (planned / target) * 100);
  const complete = target > 0 && planned >= target;
  return (
    <div className="rounded-lg border border-border bg-card px-2 py-1.5">
      <div className="flex items-baseline gap-2">
        <span className="truncate text-[12.5px] text-foreground">{label}</span>
        <span className="truncate font-mono text-[10.5px] text-muted-foreground/70">
          {hint}
        </span>
        <span
          className={cn(
            "ml-auto shrink-0 font-mono text-[11px]",
            complete ? "text-success" : "text-muted-foreground",
          )}
        >
          {planned}/{target}
        </span>
      </div>
      <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full", complete ? "bg-success" : "bg-primary")}
          style={{ width: `${pct}%` }}
        />
      </div>
      {note ? (
        <p className="mt-0.5 text-[10.5px] text-muted-foreground/80">{note}</p>
      ) : null}
    </div>
  );
}
