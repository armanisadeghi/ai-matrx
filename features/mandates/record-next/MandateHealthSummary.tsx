"use client";

// features/mandates/record-next/MandateHealthSummary.tsx
//
// The Health tab's answer for ONE mandate: is anything open against it, and
// what fixes it. The same findings the Mandate health page lists
// (`fetchMandateHealth`, code-references/health.ts), filtered to this key —
// never a second health source. Before this the tab was only the code
// diagnostics table, which for most jobs read "Unknown" on every row (UX punch
// list 2026-09-26: "a tab that says nothing").

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { StatusToken } from "@/components/official/ConfigurationFields";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { useAppDispatch } from "@/lib/redux/hooks";
import {
  KIND_LABEL,
  SEVERITY_LABEL,
  SEVERITY_RANK,
  SOURCE_LABEL,
  fetchMandateHealth,
  type HealthFinding,
} from "@/features/mandates/code-references/health";
import { plainFailureReason } from "@/lib/entity-list/failure";

const SEVERITY_CLASS: Record<HealthFinding["severity"], string> = {
  high: "border-red-500/40 text-red-700 dark:text-red-400",
  medium: "border-amber-500/40 text-amber-700 dark:text-amber-400",
  low: "border-border text-muted-foreground",
};

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; findings: HealthFinding[]; failed: string[] };

export function MandateHealthSummary({ mandateKey }: { mandateKey: string }) {
  const dispatch = useAppDispatch();
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetchMandateHealth(dispatch)
      .then((load) => {
        if (cancelled) return;
        setState({
          status: "ready",
          findings: load.findings
            .filter((f) => f.mandateKey === mandateKey)
            .sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]),
          // Plain words; the raw messages stay in the console.
          failed: load.failures.map((f) => {
            console.error(`[mandate-health] ${f.source} failed`, f.message);
            return `${SOURCE_LABEL[f.source]} ${plainFailureReason(f.message)}`;
          }),
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        console.error("[mandate-health] read failed", error);
        setState({
          status: "error",
          message: plainFailureReason(error),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [dispatch, mandateKey]);

  if (state.status === "loading") {
    return (
      <div role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        Checking this job for open problems…
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div role="alert" className="flex items-center gap-2 text-sm text-destructive">
        <span>Open problems could not be checked: the check {state.message}. Reload the page to try again.
        <ErrorAlchemyMenu className="ml-auto" /></span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {state.findings.length === 0 ? (
        <div className="flex items-center gap-2 text-sm">
          <StatusToken status={state.failed.length > 0 ? "caution" : "ok"} label={state.failed.length > 0 ? "Partly checked" : "No open problems"} />
          {state.failed.length > 0 ? (
            <span className="text-xs text-muted-foreground">
              Some checks could not run: {state.failed.join("; ")}.
              <ErrorAlchemyMenu />
            </span>
          ) : null}
        </div>
      ) : (
        <div className="divide-y divide-border rounded-md border border-border text-sm">
          {state.findings.map((f) => (
            <div key={f.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
              <Badge variant="outline" className={SEVERITY_CLASS[f.severity]}>
                {SEVERITY_LABEL[f.severity]}
              </Badge>
              <span className="font-medium">{KIND_LABEL[f.kind]}</span>
              <span className="min-w-0 flex-1 text-muted-foreground">
                {f.problem}
                {f.detail ? ` — ${f.detail}` : ""}
              </span>
              {f.codeUrl ? (
                <a
                  href={f.codeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline"
                >
                  Open code
                </a>
              ) : null}
              <span className="text-xs">
                Fix: {f.fixHref ? (
                  <Link href={f.fixHref} className="text-primary hover:underline">
                    {f.fix}
                  </Link>
                ) : (
                  f.fix
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
