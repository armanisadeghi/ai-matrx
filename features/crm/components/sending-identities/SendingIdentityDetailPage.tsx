"use client";

/**
 * /crm/sending-identities/[identityId] — one mailbox, its four gates, its health.
 *
 * The screen is ordered the way the gates actually run, because that is the
 * order a person can act in: prove the domain → pass authentication → warm up →
 * send within limits. Everything that is blocking appears at the top WITH its
 * fix (IssueList); everything that is merely a setting sits underneath.
 *
 * Two things this page must never do:
 *   - offer a way to skip a gate. There is no such button because there is no
 *     such server call (outreach-system.md §7 — an override that exists will be
 *     used).
 *   - report a green state it did not verify. A system pause is stated as a
 *     system pause, and resuming is explicitly the human's decision.
 */

import { useMemo, useRef, useState } from "react";
import {
  Activity,
  CircleCheck,
  Clock,
  Loader2,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  ShieldCheck,
  ShieldX,
  TriangleAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { GuidedChecklist } from "@/lib/guided-setup/components/GuidedChecklist";
import { useSendingIdentity } from "@/features/crm/sending-identities/hooks";
import { sendingIdentityChecklist } from "@/features/crm/sending-identities/sendingIdentityChecklist";
import { STATUS_COPY } from "@/features/crm/sending-identities/types";
import type {
  SendingEventRecord,
  SendingIdentityDetail,
} from "@/features/crm/sending-identities/types";
import { DnsRecordCard } from "./DnsRecordCard";
import { HealthPanel } from "./HealthPanel";
import { IssueList } from "./IssueList";

function AuthRow({
  name,
  pass,
  explanation,
}: {
  name: string;
  pass: boolean | null | undefined;
  explanation: string;
}) {
  return (
    <div className="flex items-start gap-2.5 py-1.5">
      {pass === true ? (
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
      ) : pass === false ? (
        <ShieldX className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
      ) : (
        <Clock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      )}
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">
          {name}{" "}
          <span
            className={cn(
              "text-xs font-normal",
              pass === true && "text-emerald-600 dark:text-emerald-400",
              pass === false && "text-destructive",
              pass == null && "text-muted-foreground",
            )}
          >
            {pass === true ? "passing" : pass === false ? "not passing" : "not checked yet"}
          </span>
        </p>
        <p className="text-xs text-muted-foreground">{explanation}</p>
      </div>
    </div>
  );
}

function EventRow({ event }: { event: SendingEventRecord }) {
  const bad = ["bounced", "complained", "failed", "unsubscribed"].includes(
    event.event_kind,
  );
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border/60 py-2 last:border-b-0">
      <div className="min-w-0">
        <p className="truncate text-sm text-foreground">
          {event.subject || "(no subject)"}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {event.to_address_key}
          {event.error_message ? ` — ${event.error_message}` : ""}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <Badge
          variant="outline"
          className={cn(
            "capitalize",
            bad && "border-destructive/40 text-destructive",
          )}
        >
          {event.event_kind}
        </Badge>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {new Date(event.occurred_at).toLocaleString()}
        </p>
      </div>
    </div>
  );
}

export function SendingIdentityDetailPage({ identityId }: { identityId: string }) {
  const {
    identity,
    events,
    loading,
    error,
    busy,
    notice,
    checkDomain,
    checkAuthentication,
    startWarmup,
    pause,
    resume,
    refreshHealth,
  } = useSendingIdentity(identityId);
  const dnsRef = useRef<HTMLDivElement | null>(null);
  const [showAllEvents, setShowAllEvents] = useState(false);

  /**
   * Context for the `outreach.sending_identity` checklist. The DNS card and the
   * warm-up bar are passed in as nodes so the checklist hosts the existing
   * components rather than a second copy of them.
   */
  const checklistContext = useMemo(
    () => ({
      identity: identity as SendingIdentityDetail,
      checkDomain: async () => void (await checkDomain()),
      checkAuthentication: async () => void (await checkAuthentication()),
      startWarmup: async () => void (await startWarmup()),
      dnsCard: identity ? (
        <div ref={dnsRef}>
          <DnsRecordCard
            record={identity.dns_record}
            domain={identity.sending_domain}
            verified={identity.domain_verified}
            lastCheckedAt={identity.domain_checked_at}
            checking={busy === "check_domain"}
            onCheck={() => void checkDomain()}
          />
        </div>
      ) : null,
      warmupPanel:
        identity?.warmup != null ? (
          <div className="space-y-2">
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  identity.warmup.completed_at
                    ? "bg-emerald-500"
                    : "bg-amber-500",
                )}
                style={{ width: `${identity.warmup.percent_complete}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                Today&apos;s limit: {identity.effective_daily_cap} messages
                {identity.sends_today > 0
                  ? ` · ${identity.remaining_today} left`
                  : ""}
              </span>
              <span>{identity.warmup.percent_complete}%</span>
            </div>
          </div>
        ) : null,
    }),
    [identity, busy, checkDomain, checkAuthentication, startWarmup],
  );

  const runFix = useMemo(
    () => (fixAction: string) => {
      if (fixAction === "check_domain") return void checkDomain();
      if (fixAction === "check_authentication") return void checkAuthentication();
      if (fixAction === "start_warmup") return void startWarmup();
      if (fixAction === "review_and_resume") return void resume();
      if (fixAction === "enable_org_outreach") return void refreshHealth();
      return undefined;
    },
    [checkAuthentication, checkDomain, refreshHealth, resume, startWarmup],
  );

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl space-y-3 px-4 pt-[calc(var(--shell-header-h)+1rem)]">
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-40 w-full rounded-lg" />
        <Skeleton className="h-40 w-full rounded-lg" />
      </div>
    );
  }

  if (error && !identity) {
    return (
      <div className="mx-auto max-w-4xl px-4 pt-[calc(var(--shell-header-h)+1rem)]">
        <Card className="border-destructive/40">
          <CardContent className="p-4">
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!identity) return null;

  const statusCopy = STATUS_COPY[identity.status];
  const systemPaused =
    identity.status === "paused" && identity.paused_by_kind === "system";
  const visibleEvents = showAllEvents ? events ?? [] : (events ?? []).slice(0, 12);

  /**
   * Runtime refusals only — the SETUP gates now belong to the checklist below.
   *
   * Live render, 2026-08-14: with both on screen, every setup gate appeared
   * twice — once as a red issue up here and once as its step in the checklist,
   * each with its own copy and its own button. Two descriptions of one problem
   * is worse than either alone, because the reader cannot tell whether they are
   * two problems. The checklist owns anything a person does once during setup;
   * this list keeps what only happens while sending (pacing, quiet hours, the
   * org switch, a bad recipient) and has no home in a setup checklist.
   */
  const SETUP_FIXES = new Set([
    "publish_dns_record",
    "check_domain",
    "check_authentication",
    "start_warmup",
    "wait_for_warmup",
  ]);
  const issues = (identity.issues ?? []).filter(
    (issue) => !SETUP_FIXES.has(issue.fix_action),
  );

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl space-y-4 px-4 pb-16 pt-[calc(var(--shell-header-h)+1rem)]">
        {/* Status */}
        <Card
          className={cn(
            statusCopy.tone === "good" && "border-emerald-500/30",
            statusCopy.tone === "bad" && "border-destructive/40",
          )}
        >
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              {statusCopy.tone === "good" ? (
                <CircleCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
              ) : statusCopy.tone === "bad" ? (
                <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
              ) : (
                <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
              )}
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">
                  {statusCopy.label}
                </p>
                <p className="text-xs text-muted-foreground">{statusCopy.help}</p>
                {systemPaused ? (
                  <p className="mt-1.5 text-xs text-destructive">
                    Paused automatically because {identity.pause_reason}. Nothing
                    will resume it on its own — read the numbers below, fix the
                    cause, then resume it yourself.
                  </p>
                ) : null}
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              {identity.status === "paused" ? (
                <Button size="sm" disabled={busy !== null} onClick={() => void resume()}>
                  {busy === "review_and_resume" ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <PlayCircle className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Resume sending
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy !== null}
                  onClick={() => void pause("Paused from the mailbox screen.")}
                >
                  <PauseCircle className="mr-1.5 h-3.5 w-3.5" />
                  Pause
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {notice ? (
          <p className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2.5 text-sm text-emerald-700 dark:text-emerald-400">
            {notice}
          </p>
        ) : null}
        {error ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/5 p-2.5 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        {/* Everything blocking, each with its fix */}
        {issues.length > 0 ? (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">
                Stopping this mailbox from sending right now
              </CardTitle>
            </CardHeader>
            <CardContent>
              <IssueList
                issues={issues}
                busy={busy}
                onRunFix={runFix}
                onShowGuide={() =>
                  dnsRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })
                }
              />
            </CardContent>
          </Card>
        ) : null}

        {/*
          THE THREE GATES — domain → authentication → warm-up.

          These were three hand-coded "Gate" cards in gate order. They are now
          the declared `outreach.sending_identity` checklist on the ONE guided-
          setup primitive (`lib/guided-setup/`), which adds what hand-rolling
          could not: it remembers that the customer said they published the DNS
          record, it re-verifies every gate when they come back days later, it
          shows how far along they are, and it splits "not passing" from "not
          checked yet" so a resolver timeout never reads as a broken domain.

          The copy, the DNS card and the warm-up bar are unchanged — they are
          hosted inside their steps rather than replaced.
        */}
        <GuidedChecklist
          definition={sendingIdentityChecklist}
          context={checklistContext}
          scope={
            identity.organization_id
              ? {
                  organizationId: identity.organization_id,
                  targetKey: identity.id,
                }
              : null
          }
        />

        {/* Health */}
        <HealthPanel health={identity.health} />

        {/* Limits */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Sending limits</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <p className="text-xs text-muted-foreground">Messages per day</p>
              <p className="font-medium text-foreground">
                {identity.daily_cap}
                {identity.effective_daily_cap < identity.daily_cap
                  ? ` (${identity.effective_daily_cap} while warming up)`
                  : ""}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Messages per hour</p>
              <p className="font-medium text-foreground">{identity.hourly_cap}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Gap between messages</p>
              <p className="font-medium text-foreground">
                {Math.round(identity.min_interval_seconds / 60)}–
                {Math.round(identity.max_interval_seconds / 60)} minutes, varied
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">
                Quiet hours, where the recipient is
              </p>
              <p className="font-medium text-foreground">
                {String(identity.quiet_hours_start).padStart(2, "0")}:00 to{" "}
                {String(identity.quiet_hours_end).padStart(2, "0")}:00
                {identity.send_weekends ? "" : " · no weekends"}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Audit trail */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-sm font-semibold">
              Everything sent from this mailbox
            </CardTitle>
            <Button
              size="sm"
              variant="outline"
              disabled={busy !== null}
              onClick={() => void refreshHealth()}
            >
              {busy === "refresh_health" ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Activity className="mr-1.5 h-3.5 w-3.5" />
              )}
              Refresh
            </Button>
          </CardHeader>
          <CardContent>
            {visibleEvents.length === 0 ? (
              <p className="py-2 text-sm text-muted-foreground">
                Nothing has been sent from this mailbox yet. Every message,
                bounce and complaint will be listed here.
              </p>
            ) : (
              <>
                <div>
                  {visibleEvents.map((event) => (
                    <EventRow key={event.id} event={event} />
                  ))}
                </div>
                {(events?.length ?? 0) > visibleEvents.length ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-3"
                    onClick={() => setShowAllEvents(true)}
                  >
                    Show all {events?.length} entries
                  </Button>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
