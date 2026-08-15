"use client";

/**
 * HealthPanel — what this mailbox's last seven days actually look like.
 *
 * THE DOOR LAW's third corollary: *state the verdict, not the timestamp.* So
 * each tile says whether the number is fine or dangerous, in the terms a person
 * cares about ("this is what gets a domain blocked"), instead of printing a
 * percentage and leaving them to know the industry threshold.
 *
 * The honest caveat is on the panel, not hidden in a doc: until inbound webhooks
 * land (outreach Phase 5), only sends and failures are recorded here, so bounce
 * and complaint counts read zero because nothing reports them yet — NOT because
 * the mailbox is proven clean. Showing a confident green "0% bounces" without
 * that sentence would be the surface lying.
 */

import { Activity, Info, MessageSquareReply, ShieldAlert, TriangleAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { IdentityHealth } from "@/features/crm/sending-identities/types";

/** Mirrors caps.py — kept in sync deliberately, and only used for LABELS here;
 *  the server is the only thing that decides a breach. */
const HARD_BOUNCE_LIMIT = 0.03;
const COMPLAINT_LIMIT = 0.001;

function Tile({
  label,
  value,
  verdict,
  tone,
  icon: Icon,
}: {
  label: string;
  value: string;
  verdict: string;
  tone: "good" | "warn" | "bad" | "neutral";
  icon: typeof Activity;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <p className="mt-1.5 text-xl font-semibold tabular-nums text-foreground">{value}</p>
      <p
        className={cn(
          "mt-0.5 text-xs",
          tone === "bad" && "text-destructive",
          tone === "warn" && "text-amber-600 dark:text-amber-400",
          tone === "good" && "text-emerald-600 dark:text-emerald-400",
          tone === "neutral" && "text-muted-foreground",
        )}
      >
        {verdict}
      </p>
    </div>
  );
}

export function HealthPanel({ health }: { health: IdentityHealth | null | undefined }) {
  const sent = health?.sent ?? 0;
  const noOutcomeData = sent === 0;
  const pct = (value: number) => `${(value * 100).toFixed(value < 0.01 ? 2 : 1)}%`;

  const bounceRate = health?.hard_bounce_rate ?? 0;
  const complaintRate = health?.complaint_rate ?? 0;
  const replyRate = health?.reply_rate ?? 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold">
          Deliverability — last {health?.window_days ?? 7} days
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Tile
            label="Messages sent"
            value={String(sent)}
            verdict={noOutcomeData ? "Nothing sent yet" : "From this mailbox"}
            tone="neutral"
            icon={Activity}
          />
          <Tile
            label="Hard bounces"
            value={noOutcomeData ? "—" : pct(bounceRate)}
            verdict={
              noOutcomeData
                ? "No data yet"
                : bounceRate > HARD_BOUNCE_LIMIT
                  ? "Too high — this is what burns a domain"
                  : `Healthy (limit ${pct(HARD_BOUNCE_LIMIT)})`
            }
            tone={noOutcomeData ? "neutral" : bounceRate > HARD_BOUNCE_LIMIT ? "bad" : "good"}
            icon={TriangleAlert}
          />
          <Tile
            label="Spam complaints"
            value={noOutcomeData ? "—" : pct(complaintRate)}
            verdict={
              noOutcomeData
                ? "No data yet"
                : complaintRate > COMPLAINT_LIMIT
                  ? "Too high — sending will be paused"
                  : `Healthy (limit ${pct(COMPLAINT_LIMIT)})`
            }
            tone={noOutcomeData ? "neutral" : complaintRate > COMPLAINT_LIMIT ? "bad" : "good"}
            icon={ShieldAlert}
          />
          <Tile
            label="Replies"
            value={noOutcomeData ? "—" : pct(replyRate)}
            verdict={noOutcomeData ? "No data yet" : "The only number worth chasing"}
            tone={noOutcomeData ? "neutral" : replyRate > 0 ? "good" : "neutral"}
            icon={MessageSquareReply}
          />
        </div>

        <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-2.5">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">
            Bounces, complaints and replies are reported by the mail provider.
            That reporting is not connected yet, so these read zero because
            nothing has told us otherwise — not because the mailbox is proven
            clean. The automatic pause is armed and will act the moment real
            numbers arrive.
          </p>
        </div>

        {health?.breaches?.length ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2.5">
            <p className="text-xs font-medium text-destructive">
              Thresholds breached
            </p>
            <ul className="mt-1 space-y-0.5">
              {health.breaches.map((breach) => (
                <li key={breach} className="text-xs text-foreground">
                  {breach}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
