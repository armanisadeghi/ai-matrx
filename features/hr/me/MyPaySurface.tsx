// features/hr/me/MyPaySurface.tsx
//
// ROUTE 3 — `/hr/me/pay` · My compensation (SPEC-EMPLOYEES §2.1).
//
// The surface that makes "what changed and when" answerable without asking HR.
//
// 🚨 SELF ONLY. THIS ROUTE NEVER ACCEPTS AN `employeeId`. A manager or HR admin
// reads someone else's pay at route 14's Compensation tab, which is audited.
// Accepting an id here would be an unaudited pay read wearing a self URL.
//
// 🚨 READ-ONLY. No edit, no request-a-raise, no download. A pay-history PDF is
// NOT in v1 — the verification letter (§4.9) is the sanctioned artifact, and it
// is an assertion the organization is held to, which a self-serve PDF is not.
//
// 🚨 EVERY CONCURRENT COMPONENT KEEPS ITS OWN WINDOW AND NOTHING IS EVER
// SUMMED. A person on a base plus a shift differential plus a bilingual
// allowance has THREE rates. Adding them produces a number that is not true on
// any day and that somebody will quote in a wage claim.
//
// 🚨 NO COMPENSATION ROW → THE NAV ITEM IS **ABSENT** (a volunteer, §1.4). This
// page is the second lock: it renders the no-access state, which reads the same
// whether the record is unreachable or does not exist.

"use client";

import { useCallback, useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { fetchHrMyCompensation } from "@/features/hr/service";
import { HrPageState } from "@/features/hr/shared/HrStates";
import { useHrContext } from "@/features/hr/shared/useHrContext";
import type { HrDenied, HrFailed } from "@/features/hr/types";

type CompensationRow = Record<string, unknown>;

type MyCompensation = {
  as_of: string;
  current: CompensationRow[];
  history: CompensationRow[];
  currency: string | null;
};

function text(row: CompensationRow, key: string): string | null {
  const value = row[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function num(row: CompensationRow, key: string): number | null {
  const value = row[key];
  return typeof value === "number" ? value : null;
}

function formatDay(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
}

/**
 * One component's own amount, in its own unit. Deliberately renders the
 * per-unit alongside the figure so a reader cannot mistake an hourly rate for a
 * salary — and deliberately has no "total" variant.
 */
function formatAmount(
  row: CompensationRow,
  fallbackCurrency: string | null,
): string {
  const amount = num(row, "amount");
  if (amount === null) return "";
  const currency = text(row, "currency") ?? fallbackCurrency ?? "USD";
  const perUnit = text(row, "per_unit");
  let rendered: string;
  try {
    rendered = new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
    }).format(amount);
  } catch {
    rendered = `${amount} ${currency}`;
  }
  return perUnit ? `${rendered} per ${perUnit}` : rendered;
}

function componentLabel(row: CompensationRow): string {
  const kind = text(row, "component_kind") ?? "base";
  return kind.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

function isFuture(row: CompensationRow, asOf: string): boolean {
  const from = text(row, "effective_from");
  return Boolean(from && from > asOf);
}

export function MyPaySurface() {
  const { active, isLoading: contextLoading } = useHrContext();
  const employmentId = active?.employment_id ?? null;

  const [data, setData] = useState<MyCompensation | null>(null);
  const [error, setError] = useState<HrDenied | HrFailed | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);

  const refresh = useCallback(() => setReloadToken((n) => n + 1), []);

  useEffect(() => {
    if (!employmentId) {
      // No active spell today → nothing to resolve. The nav item is already
      // absent; this is the typed-URL case.
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);

    (async () => {
      const result = await fetchHrMyCompensation({ employmentId });
      if (cancelled) return;
      if (result.ok) {
        setData(result.data as MyCompensation);
        setError(null);
      } else {
        setData(null);
        setError(result);
      }
      setIsLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [employmentId, reloadToken]);

  const asOf = data?.as_of ?? new Date().toISOString().slice(0, 10);
  const pending = (data?.history ?? []).filter((row) => isFuture(row, asOf));

  return (
    <HrPageState
      loading={contextLoading || isLoading}
      error={error && error.kind === "failed" ? error : null}
      granted={error?.kind === "denied" || !employmentId ? false : undefined}
      operation="Your pay record"
      variant="cards"
      onRetry={refresh}
      noAccessSentence="There is no pay record here for you."
    >
      <div className="mx-auto w-full max-w-3xl space-y-6 p-4 sm:p-6">
        {pending.length > 0 ? (
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-foreground">
              Already approved, starting later
            </h2>
            <ul className="space-y-2">
              {pending.map((row, index) => (
                <li
                  key={`pending-${index}`}
                  className="rounded-lg border border-dashed border-border bg-muted/40 p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-medium text-foreground">
                      {componentLabel(row)}
                    </span>
                    <Badge variant="outline" className="text-xs">
                      Effective {formatDay(text(row, "effective_from"))}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-sm text-foreground">
                    {formatAmount(row, data?.currency ?? null)}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-foreground">
            What you are paid today
          </h2>
          {/* ONE CARD PER CONCURRENT COMPONENT. Never a combined figure. */}
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {(data?.current ?? []).map((row, index) => (
              <li
                key={`current-${index}`}
                className="rounded-lg border border-border bg-card p-4"
              >
                <p className="text-xs text-muted-foreground">
                  {componentLabel(row)}
                </p>
                <p className="mt-0.5 text-lg font-semibold text-foreground">
                  {formatAmount(row, data?.currency ?? null)}
                </p>
                {text(row, "effective_from") ? (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Since {formatDay(text(row, "effective_from"))}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
          {(data?.current ?? []).length > 1 ? (
            <p className="text-xs text-muted-foreground">
              These are separate parts of your pay, each on its own terms. They
              are shown separately on purpose.
            </p>
          ) : null}
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-foreground">
            What changed, and when
          </h2>
          {(data?.history ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing has changed yet.
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border bg-card">
              {(data?.history ?? []).map((row, index) => (
                <li key={`history-${index}`} className="p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-sm font-medium text-foreground">
                      {componentLabel(row)} —{" "}
                      {formatAmount(row, data?.currency ?? null)}
                    </span>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      From {formatDay(text(row, "effective_from"))}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {[
                      text(row, "change_reason"),
                      text(row, "approved_at")
                        ? `Approved ${formatDay(text(row, "approved_at"))}`
                        : null,
                      // The approver's TITLE, not their name, where they are
                      // outside this person's chain (§2.1 route 3).
                      text(row, "approver_title"),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="text-xs text-muted-foreground">
          Need this in writing for a lender or an agency? Ask HR for a
          verification letter — that is the document this organization stands
          behind.
        </p>
      </div>
    </HrPageState>
  );
}
