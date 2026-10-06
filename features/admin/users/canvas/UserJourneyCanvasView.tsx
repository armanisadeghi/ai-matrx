"use client";

/**
 * The body of a `user-journey` canvas tab: one person's acquisition journey —
 * the verdict, the work they reached, the features they used and every
 * recorded event. The pane header is the chrome (the tab carries the name).
 */

import { useEffect, useState } from "react";
import { AlertTriangle, Route } from "lucide-react";
import type { CanvasKindProps } from "@ai-matrx/canvas/react";
import { Badge } from "@/components/ui/badge";
import SuspenseLoader from "@/components/loaders/SuspenseLoader";
import { useAdminCost } from "@/components/cost/useAdminCost";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { AcquisitionJourneySchema, type AcquisitionJourney } from "../types";
import { fmtAcquisitionDate as fmtDate } from "../lib/acquisitionFormat";
import { readUserJourneyData } from "./userJourneyKind";

const VERDICT = {
  no_activity: [
    "No activity after arrival",
    "text-slate-700 bg-slate-500/10 dark:text-slate-300",
  ],
  blocked: [
    "Likely blocked by a problem",
    "text-rose-700 bg-rose-500/10 dark:text-rose-300",
  ],
  exploring: [
    "Exploring the product",
    "text-amber-700 bg-amber-500/10 dark:text-amber-300",
  ],
  engaged: [
    "Reached runtime-powered work",
    "text-emerald-700 bg-emerald-500/10 dark:text-emerald-300",
  ],
  converted: [
    "Converted",
    "text-emerald-700 bg-emerald-500/10 dark:text-emerald-300",
  ],
} as const;

type JourneyRead =
  | { rowId: string; journey: AcquisitionJourney; error: null }
  | { rowId: string; journey: null; error: string };

async function readJourney(rowId: string): Promise<AcquisitionJourney> {
  const response = await fetch(
    `/api/admin/users/acquisition/${encodeURIComponent(rowId)}`,
    { cache: "no-store" },
  );
  const body: unknown = await response.json();
  if (!response.ok) {
    const message =
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof body.error === "string"
        ? body.error
        : "Failed to load this user journey";
    throw new Error(message);
  }
  if (typeof body !== "object" || body === null || !("journey" in body)) {
    throw new Error("Journey response was incomplete");
  }
  const parsed = AcquisitionJourneySchema.safeParse(body.journey);
  if (!parsed.success) throw new Error("Journey response was invalid");
  return parsed.data;
}

export default function UserJourneyCanvasView({ data }: CanvasKindProps) {
  const fmtCost = useAdminCost();
  const rowId = readUserJourneyData(data)?.rowId ?? null;
  const [read, setRead] = useState<JourneyRead | null>(null);

  useEffect(() => {
    if (!rowId) return;
    let live = true;
    readJourney(rowId).then(
      (journey) => {
        if (live) setRead({ rowId, journey, error: null });
      },
      (caught: unknown) => {
        if (live)
          setRead({
            rowId,
            journey: null,
            error:
              caught instanceof Error
                ? caught.message
                : "Failed to load journey",
          });
      },
    );
    return () => {
      live = false;
    };
  }, [rowId]);

  if (!rowId) {
    return (
      <p className="p-5 text-sm text-muted-foreground">
        This tab names no person.
      </p>
    );
  }
  const current = read?.rowId === rowId ? read : null;
  const journey = current?.journey ?? null;
  const journeyError = current?.error ?? null;

  return (
    <div className="@container h-full min-h-0 overflow-y-auto p-4">
      {!current ? <SuspenseLoader message="Loading the journey" /> : null}
      {journeyError ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive-ink">
          {journeyError}
          <ErrorAlchemyMenu error={journeyError} />
        </div>
      ) : null}
      {!journeyError && journey ? (
        <div className="space-y-5">
          {journey.source_warnings.length ? (
            <div className="space-y-2">
              {journey.source_warnings.map((warning) => (
                <div
                  key={warning}
                  className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300"
                >
                  {warning}
                </div>
              ))}
            </div>
          ) : null}
          <div className={`rounded-lg p-4 ${VERDICT[journey.verdict][1]}`}>
            <div className="text-sm font-semibold">
              {VERDICT[journey.verdict][0]}
            </div>
            <div className="mt-1 text-xs opacity-80">
              Last observed {fmtDate(journey.last_activity)}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 @xl:grid-cols-4">
            {[
              ["API requests", journey.api_requests],
              ["Failed", journey.failed_requests],
              ["Runtime work", journey.runtime_executions],
              ["Runtime cost", fmtCost(journey.runtime_cost)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-md border p-3">
                <div className="text-[11px] text-muted-foreground">{label}</div>
                <div className="font-semibold tabular-nums">{value}</div>
              </div>
            ))}
          </div>
          <section>
            <h3 className="mb-2 text-sm font-semibold">Features used</h3>
            {journey.feature_usage.length ? (
              <div className="space-y-1.5">
                {journey.feature_usage.map((item) => (
                  <div
                    key={item.feature}
                    className="flex items-center rounded-md border px-3 py-2 text-sm"
                  >
                    <span>{item.feature}</span>
                    <span className="ml-auto tabular-nums text-muted-foreground">
                      {item.requests} requests
                    </span>
                    {item.failures ? (
                      <Badge variant="destructive" className="ml-2">
                        {item.failures} failed
                        <ErrorAlchemyMenu error={item.failures} />
                      </Badge>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No feature requests were captured.
              </p>
            )}
          </section>
          <section>
            <h3 className="mb-2 text-sm font-semibold">Activity timeline</h3>
            <div className="space-y-2">
              {journey.events.map((event) => (
                <details
                  key={event.id}
                  className={`rounded-md border p-3 ${event.is_problem ? "border-rose-500/30 bg-rose-500/5" : ""}`}
                >
                  <summary className="cursor-pointer list-none">
                    <div className="flex items-start gap-2">
                      {event.is_problem ? (
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
                      ) : (
                        <Route className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">
                          {event.title}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {fmtDate(event.occurred_at)} · {event.kind}
                          {event.status ? ` · ${event.status}` : ""}
                        </div>
                      </div>
                      {event.cost ? (
                        <span className="text-xs font-medium tabular-nums">
                          {fmtCost(event.cost)}
                        </span>
                      ) : null}
                    </div>
                  </summary>
                  <div className="mt-3 space-y-1 border-t pt-3 font-mono text-xs text-muted-foreground">
                    {event.request_id ? (
                      <div>request {event.request_id}</div>
                    ) : null}
                    {event.route ? <div>route {event.route}</div> : null}
                    {event.detail ? (
                      <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words">
                        {event.detail}
                      </pre>
                    ) : null}
                  </div>
                </details>
              ))}
              {!journey.events.length ? (
                <p className="text-sm text-muted-foreground">
                  No owned activity records were found.
                </p>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
