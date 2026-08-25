"use client";

/**
 * Public exposure scoreboard — what a logged-out visitor can reach.
 *
 * Reads LIVE (`admin_public_exposure_report`) rather than a committed snapshot,
 * because the only question this board answers is "can a stranger reach this
 * right now". It joins that against the ONE declaration list in
 * `lib/security/public-exposure.ts` — the same list the release gate judges, so
 * this page and the gate can never disagree.
 *
 * Undeclared is the alarming state: it means the database allows something
 * nobody wrote a reason for. That is exactly how the 2026-08-25 leak survived.
 */

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Globe,
  PencilLine,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/utils/supabase/client";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import {
  classifyExposures,
  type ClassifiedExposure,
  type LiveExposure,
  type PublicExposure,
} from "@/lib/security/public-exposure";

interface LoadState {
  rows: ClassifiedExposure[];
  undeclared: ClassifiedExposure[];
  tracked: ClassifiedExposure[];
  stale: PublicExposure[];
}

const EMPTY: LoadState = { rows: [], undeclared: [], tracked: [], stale: [] };

export function PublicExposureConsole() {
  const [state, setState] = useState<LoadState>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: rpcError } = await createClient().rpc(
      "admin_public_exposure_report",
    );
    if (rpcError) {
      setError(rpcError);
      setState(EMPTY);
      setLoading(false);
      return;
    }
    setState(classifyExposures((data ?? []) as LiveExposure[]));
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return (
      <AccessGate
        token="admin_report"
        id="public-exposure"
        error={error}
        onRetry={() => void load()}
        fallbackHref="/administration/reporting"
        fallbackLabel="All reports"
      />
    );
  }

  const { rows, undeclared, tracked, stale } = state;
  const declared = rows.length - undeclared.length - tracked.length;
  const writeOpen = rows.filter((r) => r.write_open).length;

  return (
    <div className="flex h-full min-h-0 flex-col bg-textured">
      <header className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <Globe className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
          <div className="min-w-0">
            <h1 className="text-sm font-semibold text-foreground">
              Public exposure
            </h1>
            <p className="text-xs text-muted-foreground">
              Everything a signed-out visitor can reach. Each one must be
              declared with a reason, or the release gate fails.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Stat label="declared" value={declared} tone="ok" />
          <Stat label="tracked" value={tracked.length} tone="warn" />
          <Stat label="undeclared" value={undeclared.length} tone="bad" />
          <Stat label="writable" value={writeOpen} tone={writeOpen ? "warn" : "ok"} />
          <Button
            size="sm"
            variant="outline"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw
              className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
              aria-hidden
            />
            {loading ? "Checking…" : "Re-check"}
          </Button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto">
        {loading && !rows.length ? (
          <p className="px-4 py-6 text-xs text-muted-foreground">
            Asking the database what anonymous callers can reach…
          </p>
        ) : null}

        {undeclared.length > 0 ? (
          <Section
            title="Undeclared — nobody wrote down why these are public"
            tone="bad"
          >
            {undeclared.map((r) => (
              <Row key={rowKey(r)} row={r} />
            ))}
            <p className="px-4 pb-3 text-xs text-muted-foreground">
              If intentional, declare it in{" "}
              <code className="rounded bg-muted px-1 py-0.5">
                lib/security/public-exposure.ts
              </code>{" "}
              with a reason. If not, fix the policy — never declare it just to
              silence the check.
            </p>
          </Section>
        ) : null}

        {tracked.length > 0 ? (
          <Section title="Known wrong — tracked, not yet fixed" tone="warn">
            {tracked.map((r) => (
              <Row key={rowKey(r)} row={r} />
            ))}
          </Section>
        ) : null}

        {stale.length > 0 ? (
          <Section title="Stale declarations — no longer exposed" tone="info">
            {stale.map((e) => (
              <div
                key={`${e.relation}::${e.policy}::${e.cmd}`}
                className="border-b border-border px-4 py-2 text-xs text-muted-foreground"
              >
                <span className="font-medium text-foreground">{e.relation}</span>{" "}
                ({e.policy}, {e.cmd}) — remove this line from the declaration
                file so the list stays honest.
              </div>
            ))}
          </Section>
        ) : null}

        {rows.length - undeclared.length - tracked.length > 0 ? (
          <Section title="Declared intentional" tone="ok">
            {rows
              .filter((r) => r.status === "declared")
              .map((r) => (
                <Row key={rowKey(r)} row={r} />
              ))}
          </Section>
        ) : null}
      </div>
    </div>
  );
}

const rowKey = (r: ClassifiedExposure) =>
  `${r.relation}::${r.policy}::${r.cmd}`;

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "ok" | "warn" | "bad";
}) {
  const color =
    tone === "bad"
      ? "text-destructive"
      : tone === "warn"
        ? "text-amber-600 dark:text-amber-500"
        : "text-muted-foreground";
  return (
    <div className="flex shrink-0 items-baseline gap-1 whitespace-nowrap rounded-md border border-border px-2 py-1">
      <span className={`text-sm font-semibold tabular-nums ${color}`}>
        {value}
      </span>
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

function Section({
  title,
  tone,
  children,
}: {
  title: string;
  tone: "ok" | "warn" | "bad" | "info";
  children: React.ReactNode;
}) {
  const Icon =
    tone === "bad" ? ShieldAlert : tone === "warn" ? AlertTriangle : tone === "ok" ? ShieldCheck : CheckCircle2;
  const color =
    tone === "bad"
      ? "text-destructive"
      : tone === "warn"
        ? "text-amber-600 dark:text-amber-500"
        : "text-muted-foreground";
  return (
    <section>
      <h2
        className={`flex items-center gap-2 border-b border-border bg-card px-4 py-2 text-xs font-semibold ${color}`}
      >
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
        {title}
      </h2>
      {children}
    </section>
  );
}

function Row({ row }: { row: ClassifiedExposure }) {
  return (
    <div className="border-b border-border px-4 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs font-medium text-foreground">
          {row.relation}
        </span>
        <Badge variant="outline" className="text-[10px]">
          {row.cmd}
        </Badge>
        {row.write_open ? (
          <Badge variant="destructive" className="gap-1 text-[10px]">
            <PencilLine className="h-3 w-3" aria-hidden />
            anon can write
          </Badge>
        ) : null}
        {row.defect ? (
          <Badge variant="outline" className="text-[10px]">
            {row.defect}
          </Badge>
        ) : null}
        <span className="font-mono text-[10px] text-muted-foreground">
          {row.policy}
        </span>
      </div>
      {row.why ? (
        <p className="mt-1 text-xs text-muted-foreground">{row.why}</p>
      ) : (
        <p className="mt-1 text-xs text-destructive">
          No declared reason. A stranger can reach this and nobody said why.
        </p>
      )}
    </div>
  );
}
