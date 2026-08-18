"use client";

/**
 * The result pane.
 *
 * The rule this obeys: **never show a number without showing why.** Every term
 * reports the raw value it saw, the points it produced, its share of the
 * bucket, where the value came from, and one sentence a non-technical expert
 * can read. A score with no explanation is a dead end, and a dead end is how
 * people stop trusting a model that is actually right.
 */

import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle, Ban, Flag } from "lucide-react";

import type { EvaluationResult, LinkValuationConfig } from "../types";

function money(value: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(value);
}

function provenanceLabel(value: string): string {
  if (value === "derived") return "computed";
  if (value === "none") return "not supplied";
  return value;
}

interface Props {
  config: LinkValuationConfig;
  result: EvaluationResult;
}

export function ResultPanel({ config, result }: Props) {
  const firedGates = result.gates.filter((gate) => gate.fired);
  const buckets = config.buckets.filter((bucket) => bucket.enabled);

  return (
    <div className="flex flex-col gap-4">
      {/* Headline */}
      <section className="rounded-md border border-border bg-card p-3">
        <div className="grid gap-3 sm:grid-cols-4">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Total score
            </p>
            <p className="text-2xl font-semibold tabular-nums text-foreground">
              {result.totalScore.toFixed(config.scoreDecimals)}
            </p>
            <p className="text-xs text-muted-foreground">
              {result.labels.quality}
            </p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Max link value
            </p>
            <p
              className={`text-2xl font-semibold tabular-nums ${
                result.rejected ? "text-destructive" : "text-foreground"
              }`}
            >
              {money(result.money.maxValue, config.money.currency)}
            </p>
            <p className="text-xs text-muted-foreground">
              {result.rejected ? "Refused by a gate" : "Ceiling for this link"}
            </p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Relevance
            </p>
            <p className="text-2xl font-semibold tabular-nums text-foreground">
              {(result.buckets.relevance?.score ?? 0).toFixed(
                config.scoreDecimals,
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              {result.labels.relevance}
            </p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Evidence confidence
            </p>
            <p className="text-2xl font-semibold tabular-nums text-foreground">
              {Math.round(result.confidence * 100)}%
            </p>
            <Progress value={result.confidence * 100} className="mt-1 h-1" />
          </div>
        </div>
      </section>

      {firedGates.length > 0 ? (
        <section className="flex flex-col gap-1.5">
          {firedGates.map((gate) => (
            <div
              key={gate.key}
              className={`flex items-start gap-2 rounded-md border p-2 text-xs ${
                gate.action === "reject"
                  ? "border-destructive/40 bg-destructive/10 text-destructive"
                  : "border-border bg-muted text-foreground"
              }`}
            >
              {gate.action === "reject" ? (
                <Ban className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              ) : (
                <Flag className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              )}
              <span>
                <span className="font-medium">{gate.label}: </span>
                {gate.message}
              </span>
            </div>
          ))}
        </section>
      ) : null}

      {/* Money */}
      <section className="rounded-md border border-border bg-card p-3">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          What we may pay
        </h3>
        <div className="grid gap-2 sm:grid-cols-3">
          {config.money.roles.map((role) => (
            <div
              key={role.key}
              className="rounded border border-border bg-background p-2"
            >
              <p className="text-[11px] text-muted-foreground">
                {role.label} ceiling
              </p>
              <p className="text-lg font-semibold tabular-nums text-foreground">
                {money(
                  result.money.roleCeilings[role.key] ?? 0,
                  config.money.currency,
                )}
              </p>
            </div>
          ))}
        </div>
        {result.money.authorization ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {Object.entries(result.money.authorization).map(
              ([role, ceiling]) => (
                <Badge
                  key={role}
                  variant="outline"
                  className="text-[11px] font-normal"
                >
                  {role.replace(/_/g, " ")}:{" "}
                  {ceiling === "free"
                    ? "free"
                    : money(ceiling, config.money.currency)}
                </Badge>
              ),
            )}
          </div>
        ) : null}
      </section>

      {/* Buckets + terms */}
      {buckets.map((bucket) => {
        const bucketResult = result.buckets[bucket.key];
        const terms = result.terms.filter(
          (term) => term.bucket === bucket.key && term.status !== "disabled",
        );
        if (terms.length === 0) return null;

        return (
          <section
            key={bucket.key}
            className="rounded-md border border-border bg-card"
          >
            <header className="flex items-baseline justify-between gap-2 border-b border-border px-3 py-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {bucket.label}
              </h3>
              <p className="text-sm tabular-nums text-foreground">
                {(bucketResult?.score ?? 0).toFixed(config.scoreDecimals)}
                <span className="ml-1 text-[11px] text-muted-foreground">
                  × {bucket.weight} of total
                </span>
              </p>
            </header>

            <div className="divide-y divide-border">
              {terms.map((term) => (
                <div key={term.key} className="px-3 py-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-xs font-medium text-foreground">
                      {term.label}
                    </span>
                    <span
                      className={`shrink-0 text-xs tabular-nums ${
                        term.status === "missing"
                          ? "text-muted-foreground"
                          : term.points < 0
                            ? "text-destructive"
                            : "text-foreground"
                      }`}
                    >
                      {term.status === "missing"
                        ? "not supplied"
                        : `${term.points > 0 ? "+" : ""}${term.points.toFixed(1)}`}
                    </span>
                  </div>

                  {term.status === "measured" ? (
                    <div className="mt-1 flex items-center gap-2">
                      <Progress
                        value={Math.min(100, term.share * 100)}
                        className="h-1 flex-1"
                      />
                      <span className="w-16 shrink-0 text-right text-[10px] text-muted-foreground">
                        {Math.round(term.share * 100)}% of bucket
                      </span>
                    </div>
                  ) : null}

                  <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                    {term.explain}
                    {term.status === "measured" ? (
                      <>
                        {" "}
                        <span className="text-foreground/70">
                          Saw{" "}
                          {typeof term.rawInput === "number"
                            ? term.rawInput.toFixed(2).replace(/\.00$/, "")
                            : String(term.rawInput ?? "—")}
                          , weighted ×{term.weight} (
                          {provenanceLabel(term.provenance)}).
                        </span>
                      </>
                    ) : (
                      <span className="text-foreground/70">
                        {" "}
                        Excluded from the score rather than counted as zero.
                      </span>
                    )}
                  </p>
                </div>
              ))}
            </div>
          </section>
        );
      })}

      {/* Composites */}
      {result.groups.length > 0 ? (
        <section className="rounded-md border border-border bg-card p-3">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Composite signals
          </h3>
          <p className="mb-2 text-[11px] text-muted-foreground">
            Several sources answering one question. Adding a source raises
            confidence, not score — which is what stops correlated metrics from
            inflating a domain.
          </p>
          <div className="flex flex-col divide-y divide-border">
            {result.groups.map((group) => (
              <div
                key={group.key}
                className="flex items-center justify-between gap-2 py-1.5"
              >
                <span className="truncate text-xs text-foreground">
                  {group.label}
                </span>
                <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span>
                    {group.presentMembers}/{group.totalMembers} sources
                  </span>
                  <span className="w-14 text-right tabular-nums text-foreground">
                    {group.value === null ? "—" : group.value.toFixed(1)}
                  </span>
                  <span className="w-10 text-right tabular-nums">
                    {Math.round(group.confidence * 100)}%
                  </span>
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {result.warnings.length > 0 ? (
        <section className="flex flex-col gap-1.5">
          {result.warnings.map((warning) => (
            <div
              key={warning}
              className="flex items-start gap-2 rounded-md border border-border bg-muted p-2 text-[11px] text-muted-foreground"
            >
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              <span>{warning}</span>
            </div>
          ))}
        </section>
      ) : null}
    </div>
  );
}
