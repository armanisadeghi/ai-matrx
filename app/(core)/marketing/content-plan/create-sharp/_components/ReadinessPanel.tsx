"use client";

/**
 * The persistent checklist. Not a wizard step — this is the answer to "how
 * much of this site actually exists?" for a plan that is brand new, half
 * built, or three years old.
 *
 * Two halves, because they have two different authorities:
 *  • Pages — measured against the live `plan.node` tree.
 *  • Foundation — measured against the CMS site (theme, header/footer, nav,
 *    assets). Unlinked is a first-class answer, never an error: a site with
 *    nothing built must read as "nothing built".
 */
import { Check, CircleDashed, HelpCircle, Minus } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";

import type { FoundationState } from "../_lib/data";
import type { FoundationRow, Readiness } from "../_lib/model";

function StateIcon({ state }: { state: FoundationState }) {
  if (state === "met") {
    return <Check className="h-3.5 w-3.5 shrink-0 text-success" />;
  }
  if (state === "partial") {
    return <Minus className="h-3.5 w-3.5 shrink-0 text-warning" />;
  }
  if (state === "unknown") {
    return <HelpCircle className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />;
  }
  return <CircleDashed className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />;
}

function Meter({ value, target }: { value: number; target: number }) {
  const pct = target <= 0 ? 100 : Math.min(100, (value / target) * 100);
  const complete = value >= target;
  return (
    <div className="h-1 w-16 shrink-0 overflow-hidden rounded-full bg-muted">
      <div
        className={`h-full rounded-full ${complete ? "bg-success" : "bg-primary"}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function FoundationLine({ row }: { row: FoundationRow }) {
  const reference = row.declaredAs.startsWith("=");
  return (
    <li className="flex items-center gap-2 px-3 py-1.5 hover:bg-accent/30">
      <StateIcon state={row.state} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-foreground">{row.label}</div>
        <div className="truncate text-[11px] text-muted-foreground">
          {reference ? (
            <span className="font-mono">{row.declaredAs} </span>
          ) : null}
          {row.detail}
        </div>
      </div>
      <span className="shrink-0 font-mono text-xs text-muted-foreground">
        {row.state === "unknown" ? "—" : row.actual} / {row.required}
      </span>
    </li>
  );
}

export function ReadinessPanel({
  readiness,
  cmsLabel,
  cmsLoading,
}: {
  readiness: Readiness;
  /** "Linked to <cms site>" or the reason there is no link. */
  cmsLabel: string;
  cmsLoading: boolean;
}) {
  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <section className="border-b border-border/60">
        <header className="flex items-center gap-2 px-3 py-2">
          <h3 className="text-sm font-semibold text-foreground">Pages</h3>
          <span className="ml-auto text-xs text-muted-foreground">
            {readiness.planNodesLive} live plan node
            {readiness.planNodesLive === 1 ? "" : "s"}
          </span>
        </header>
        <ul>
          <li className="flex items-center gap-2 px-3 py-1.5 hover:bg-accent/30">
            <StateIcon
              state={
                readiness.coreMissing.length === 0
                  ? "met"
                  : readiness.coreMet > 0
                    ? "partial"
                    : "unmet"
              }
            />
            <div className="min-w-0 flex-1">
              <div className="text-sm text-foreground">Core pages</div>
              <div className="truncate text-[11px] text-muted-foreground">
                {readiness.coreMissing.length === 0
                  ? "all present"
                  : `missing: ${readiness.coreMissing.join(", ")}`}
              </div>
            </div>
            <Meter value={readiness.coreMet} target={readiness.coreTotal} />
            <span className="shrink-0 font-mono text-xs text-muted-foreground">
              {readiness.coreMet} / {readiness.coreTotal}
            </span>
          </li>
          {readiness.families.map((family) => (
            <li
              key={family.key}
              className="flex items-center gap-2 px-3 py-1.5 hover:bg-accent/30"
            >
              <StateIcon
                state={
                  family.planned >= family.target
                    ? "met"
                    : family.planned > 0
                      ? "partial"
                      : "unmet"
                }
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-foreground">
                  {family.label}
                </div>
                <div className="truncate font-mono text-[11px] text-muted-foreground">
                  {family.route}
                  {family.materialize === "count_only"
                    ? " · titles from research"
                    : ""}
                </div>
              </div>
              <Meter value={family.planned} target={family.target} />
              <span className="shrink-0 font-mono text-xs text-muted-foreground">
                {family.planned} / {family.target}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <header className="flex items-center gap-2 px-3 py-2">
          <h3 className="text-sm font-semibold text-foreground">Foundation</h3>
          <span className="ml-auto min-w-0 truncate text-xs text-muted-foreground">
            {cmsLoading ? "checking the CMS…" : cmsLabel}
          </span>
        </header>
        {cmsLoading ? (
          <div className="space-y-2 px-3 pb-3">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-5/6" />
            <Skeleton className="h-6 w-4/6" />
          </div>
        ) : readiness.foundation.length === 0 ? (
          <p className="px-3 pb-3 text-sm text-muted-foreground">
            This shape declares no foundation requirements.
          </p>
        ) : (
          <ul className="pb-2">
            {readiness.foundation.map((row) => (
              <FoundationLine key={row.key} row={row} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
