"use client";

// features/crm/components/campaigns/CallQueuePage.tsx
//
// /crm/campaigns/[campaignId]/dial — the power dialer. One member at a time:
// claim (the conditional-update lock keeps two reps off the same person),
// show the record, dial, log, disposition, next. Suppression is enforced
// BEFORE a number is offered — a blocked number renders greyed WITH its
// reason, and a member with no legal number is auto-marked `suppressed`,
// visibly tallied, never dialed.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Building2,
  CalendarCheck2,
  CheckCircle2,
  Contact,
  History,
  Megaphone,
  Phone,
  PhoneCall,
  PhoneMissed,
  PhoneOff,
  SkipForward,
  Voicemail,
  XCircle,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/utils/datetime";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import {
  buildQueueEntry,
  claimNextMember,
  dispositionCall,
  fetchCampaign,
  fetchMemberStatusCounts,
  markMemberSuppressed,
  releaseClaim,
  skipMember,
} from "../../campaigns/service";
import type {
  CallDisposition,
  CampaignRow,
  DialBlockReason,
  DialSessionStats,
  MemberStatusCounts,
  QueueEntry,
} from "../../campaigns/types";
import {
  CALL_DISPOSITIONS,
  EMPTY_SESSION_STATS,
} from "../../campaigns/types";
import { CampaignStatusBadge } from "./badges";

const BLOCK_LABELS: Record<DialBlockReason, string> = {
  party_dnc: "Record is do-not-contact",
  medium_suppressed: "Number is suppressed",
  medium_dnc_listed: "On a DNC list",
  point_opted_out: "Opted out",
  medium_invalid: "Number invalid",
};

const DISPOSITION_ICONS: Record<string, typeof Phone> = {
  connected: CheckCircle2,
  meeting_booked: CalendarCheck2,
  voicemail: Voicemail,
  no_answer: PhoneMissed,
  not_interested: XCircle,
  do_not_call: PhoneOff,
};

/** Hard cap on consecutive auto-suppressions in one advance, so a queue of
 *  undialable members can never spin the client in a silent loop. */
const MAX_AUTO_SUPPRESS_PER_ADVANCE = 25;

type Phase = "claiming" | "working" | "drained" | "error";

export function CallQueuePage({ campaignId }: { campaignId: string }) {
  const userId = useAppSelector(selectUserId);
  const [campaign, setCampaign] = useState<CampaignRow | null>(null);
  const [counts, setCounts] = useState<MemberStatusCounts | null>(null);
  const [phase, setPhase] = useState<Phase>("claiming");
  const [entry, setEntry] = useState<QueueEntry | null>(null);
  const [notes, setNotes] = useState("");
  const [stats, setStats] = useState<DialSessionStats>(EMPTY_SESSION_STATS);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [autoSuppressed, setAutoSuppressed] = useState<string[]>([]);

  // The held member id, for release-on-leave (cleanup can't read state).
  const heldRef = useRef<{ memberId: string; userId: string } | null>(null);

  const refreshCounts = useCallback(async () => {
    try {
      setCounts(await fetchMemberStatusCounts(campaignId));
    } catch {
      // Counts are decoration on this surface; the claim path screams instead.
    }
  }, [campaignId]);

  /** Claim → load → (auto-suppress undialables) → present. */
  const advance = useCallback(async () => {
    if (!userId) return;
    setPhase("claiming");
    setEntry(null);
    setNotes("");
    try {
      for (let i = 0; i <= MAX_AUTO_SUPPRESS_PER_ADVANCE; i++) {
        const member = await claimNextMember({ campaignId, userId });
        if (!member) {
          heldRef.current = null;
          setPhase("drained");
          void refreshCounts();
          return;
        }
        heldRef.current = { memberId: member.id, userId };
        const next = await buildQueueEntry(member);
        if (next.undialable) {
          // Rule 3: never offer this member. Mark, tally, take the next one.
          const reason = next.detail.party.do_not_contact
            ? "Auto-suppressed by the dialer: record is do-not-contact"
            : "Auto-suppressed by the dialer: no dialable phone number";
          await markMemberSuppressed({
            memberId: member.id,
            userId,
            reason,
          });
          heldRef.current = null;
          setStats((s) => ({ ...s, suppressed: s.suppressed + 1 }));
          setAutoSuppressed((prev) => [
            ...prev.slice(-4),
            next.detail.party.display_name,
          ]);
          continue;
        }
        setEntry(next);
        setPhase("working");
        void refreshCounts();
        return;
      }
      throw new Error(
        `Stopped after auto-suppressing ${MAX_AUTO_SUPPRESS_PER_ADVANCE} undialable members in a row — review this campaign's roster before continuing.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  }, [campaignId, userId, refreshCounts]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const c = await fetchCampaign(campaignId);
        if (!cancelled) setCampaign(c);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setPhase("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [campaignId]);

  useEffect(() => {
    if (userId) void advance();
  }, [userId, advance]);

  // Leaving the dialer releases the held claim so colleagues get the member
  // back immediately instead of waiting out the lease.
  useEffect(() => {
    return () => {
      const held = heldRef.current;
      if (held) {
        heldRef.current = null;
        void releaseClaim(held).catch(() => {
          // Lease expiry is the backstop; a failed release only delays reuse.
        });
      }
    };
  }, []);

  const disposition = async (d: CallDisposition) => {
    if (!entry || !campaign || !userId || busy) return;
    if (d.suppresses) {
      // "Do not call" writes tenant-level suppression — say so before doing it.
      const target = entry.targets.find((t) => !t.blocked) ?? null;
      toast.info(
        target
          ? `${target.display} is now suppressed for this organization`
          : "Record flagged do-not-contact",
      );
    }
    setBusy(true);
    try {
      const target = entry.targets.find((t) => !t.blocked) ?? null;
      await dispositionCall({
        campaign,
        member: entry.member,
        disposition: d,
        userId,
        target,
        notes,
      });
      heldRef.current = null;
      setStats((s) => ({
        ...s,
        dialed: s.dialed + 1,
        connected:
          s.connected + (d.id === "connected" || d.id === "meeting_booked" ? 1 : 0),
        meetings: s.meetings + (d.id === "meeting_booked" ? 1 : 0),
        suppressed: s.suppressed + (d.suppresses ? 1 : 0),
      }));
      await advance();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Disposition failed");
      // The claim may be lost (expired + retaken) — advance rather than strand.
      await advance();
    } finally {
      setBusy(false);
    }
  };

  const skip = async () => {
    if (!entry || !userId || busy) return;
    setBusy(true);
    try {
      await skipMember({ memberId: entry.member.id, userId });
      heldRef.current = null;
      setStats((s) => ({ ...s, skipped: s.skipped + 1 }));
      await advance();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Skip failed");
    } finally {
      setBusy(false);
    }
  };

  const party = entry?.detail.party ?? null;
  const currentAffiliation =
    entry?.detail.affiliations.find((a) => a.is_current) ?? null;

  const statChip = (label: string, value: number, emphasize = false) => (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-none",
        emphasize && value > 0
          ? "border-emerald-500/20 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
          : "border-border bg-muted/40 text-muted-foreground",
      )}
    >
      {label}
      <span className="tabular-nums text-foreground">{value}</span>
    </span>
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* ── Session strip ──────────────────────────────────────────────── */}
      <div className="shrink-0 px-3 pt-[calc(var(--shell-header-h)+0.375rem)]">
        <div className="flex flex-wrap items-center gap-2">
          {campaign && (
            <>
              <span className="truncate text-sm font-semibold text-foreground">
                {campaign.name}
              </span>
              <CampaignStatusBadge status={campaign.status} />
            </>
          )}
          {counts && (
            <span className="text-xs tabular-nums text-muted-foreground">
              {counts.dialable.toLocaleString()} in queue
            </span>
          )}
          <div className="ml-auto flex flex-wrap items-center gap-1">
            {statChip("Dialed", stats.dialed)}
            {statChip("Connected", stats.connected, true)}
            {statChip("Meetings", stats.meetings, true)}
            {statChip("Skipped", stats.skipped)}
            {statChip("Suppressed", stats.suppressed)}
          </div>
        </div>
        {autoSuppressed.length > 0 && (
          <div className="mt-1.5 rounded-md border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-[11px] text-amber-600 dark:text-amber-400">
            Auto-suppressed (DNC / no dialable number):{" "}
            {autoSuppressed.join(", ")}
          </div>
        )}
      </div>

      {/* ── Body ───────────────────────────────────────────────────────── */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3 pt-2">
        {phase === "error" ? (
          <div className="mx-auto mt-8 max-w-lg rounded-md border border-destructive/20 bg-destructive/10 px-4 py-3">
            <div className="text-sm font-medium text-destructive">
              The dialer hit a problem
            </div>
            <div className="mt-1 text-xs text-destructive/90">{error}</div>
            <div className="mt-2 flex gap-2">
              <Button size="sm" variant="outline" onClick={() => void advance()}>
                Try again
              </Button>
              <Button size="sm" variant="ghost" asChild>
                <Link href={`/crm/campaigns/${campaignId}`}>
                  Back to campaign
                </Link>
              </Button>
            </div>
          </div>
        ) : phase === "drained" ? (
          <div className="mx-auto mt-8 flex max-w-lg flex-col items-center rounded-md border border-border bg-card px-6 py-8 text-center">
            <CheckCircle2 className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
            <div className="mt-2 text-sm font-semibold text-foreground">
              Queue drained
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              No claimable members right now — retries surface when their
              windows pass{stats.dialed > 0 && (
                <>
                  {" "}
                  · this session: {stats.dialed} dialed, {stats.connected}{" "}
                  connected, {stats.meetings} meetings
                </>
              )}
              .
            </div>
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="outline" onClick={() => void advance()}>
                Check again
              </Button>
              <Button size="sm" asChild>
                <Link href={`/crm/campaigns/${campaignId}`}>
                  <Megaphone className="mr-1 h-3.5 w-3.5" />
                  Campaign overview
                </Link>
              </Button>
            </div>
          </div>
        ) : phase === "claiming" || !entry || !party ? (
          <div className="mx-auto mt-8 max-w-lg rounded-md border border-border bg-card px-6 py-8 text-center">
            <PhoneCall className="mx-auto h-6 w-6 animate-pulse text-muted-foreground" />
            <div className="mt-2 text-xs text-muted-foreground">
              Claiming the next member…
            </div>
          </div>
        ) : (
          <div className="mx-auto grid max-w-5xl gap-3 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            {/* ── The person ─────────────────────────────────────────── */}
            <div className="rounded-md border border-border bg-card p-3">
              <div className="flex flex-wrap items-center gap-2">
                {party.party_kind === "person" ? (
                  <Contact className="h-4 w-4 shrink-0 text-muted-foreground" />
                ) : (
                  <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <Link
                  href={`/crm/${party.id}`}
                  target="_blank"
                  className="truncate text-base font-semibold text-foreground underline-offset-2 hover:underline"
                >
                  {party.display_name}
                </Link>
                <span className="text-xs text-muted-foreground">
                  Attempt {entry.member.attempt_count + 1}
                  {entry.member.last_attempt_at &&
                    ` · last ${formatRelativeTime(entry.member.last_attempt_at)}`}
                </span>
              </div>
              {(party.job_title || currentAffiliation || party.employer) && (
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {party.job_title ?? currentAffiliation?.title ?? ""}
                  {(party.employer || currentAffiliation?.employer) && (
                    <>
                      {(party.job_title || currentAffiliation?.title) && " @ "}
                      {party.employer?.display_name ??
                        currentAffiliation?.employer?.display_name}
                    </>
                  )}
                </div>
              )}
              {party.headline && (
                <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                  {party.headline}
                </div>
              )}

              {/* Dial targets — blocked numbers stay visible WITH the reason */}
              <div className="mt-3 space-y-1">
                {entry.targets.map((t) => (
                  <div
                    key={t.point.id}
                    className={cn(
                      "flex items-center gap-2 rounded-md border px-2.5 py-1.5",
                      t.blocked
                        ? "border-border bg-muted/30 opacity-60"
                        : "border-border bg-background",
                    )}
                  >
                    <Phone
                      className={cn(
                        "h-3.5 w-3.5 shrink-0",
                        t.blocked
                          ? "text-muted-foreground"
                          : "text-emerald-600 dark:text-emerald-400",
                      )}
                    />
                    <span className="font-mono text-sm text-foreground">
                      {t.display}
                    </span>
                    {t.point.label && (
                      <span className="text-[11px] text-muted-foreground">
                        {t.point.label}
                      </span>
                    )}
                    {t.point.is_primary && !t.blocked && (
                      <span className="rounded-full border border-border bg-muted/50 px-1.5 py-0.5 text-[10px] font-medium leading-none text-muted-foreground">
                        primary
                      </span>
                    )}
                    <span className="ml-auto">
                      {t.blocked ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-destructive">
                          <PhoneOff className="h-3 w-3" />
                          {BLOCK_LABELS[t.blocked]}
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 gap-1 px-2 text-xs"
                          asChild
                        >
                          <a href={`tel:${t.medium.value_key}`}>
                            <PhoneCall className="h-3 w-3" />
                            Call
                          </a>
                        </Button>
                      )}
                    </span>
                  </div>
                ))}
                {entry.targets.length === 0 && (
                  <div className="rounded-md border border-border bg-muted/30 px-2.5 py-2 text-xs text-muted-foreground">
                    No phone numbers on this record.
                  </div>
                )}
              </div>

              {/* Dispositions */}
              <div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                {CALL_DISPOSITIONS.map((d) => {
                  const Icon = DISPOSITION_ICONS[d.id] ?? Phone;
                  const destructive = d.id === "do_not_call";
                  return (
                    <Button
                      key={d.id}
                      size="sm"
                      variant={
                        d.id === "connected" || d.id === "meeting_booked"
                          ? "default"
                          : "outline"
                      }
                      disabled={busy}
                      className={cn(
                        "h-8 justify-start gap-1.5 px-2 text-xs",
                        destructive &&
                          "border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive",
                      )}
                      onClick={() => void disposition(d)}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {d.label}
                      {d.retryAfterHours != null && (
                        <span className="ml-auto text-[10px] text-muted-foreground">
                          retry {d.retryAfterHours}h
                        </span>
                      )}
                    </Button>
                  );
                })}
              </div>
              <div className="mt-1.5 flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">
                  Every disposition logs the call to the record's activity.
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  className="h-7 gap-1 px-2 text-xs text-muted-foreground"
                  onClick={() => void skip()}
                >
                  <SkipForward className="h-3.5 w-3.5" />
                  Skip
                  <ArrowRight className="h-3 w-3" />
                </Button>
              </div>
            </div>

            {/* ── Notes + history ────────────────────────────────────── */}
            <div className="flex flex-col gap-3">
              <div className="rounded-md border border-border bg-card p-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Call notes
                </div>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={4}
                  placeholder="What happened on this call — saved with the disposition"
                  className="mt-1.5 min-h-0 text-sm"
                />
                {entry.member.notes && (
                  <div className="mt-1.5 text-[11px] text-muted-foreground">
                    Previous note: {entry.member.notes}
                  </div>
                )}
              </div>

              <div className="min-h-0 rounded-md border border-border bg-card p-3">
                <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <History className="h-3.5 w-3.5" />
                  Recent activity
                </div>
                <div className="mt-1.5 space-y-1.5">
                  {entry.detail.interactions.slice(0, 4).map((i) => (
                    <div key={i.id} className="text-xs">
                      <span className="text-foreground">
                        {i.subject ?? i.channel_code}
                      </span>
                      <span className="text-muted-foreground">
                        {" "}
                        · {i.direction} ·{" "}
                        {i.occurred_at
                          ? formatRelativeTime(i.occurred_at)
                          : formatRelativeTime(i.created_at)}
                      </span>
                      {i.body && (
                        <div className="line-clamp-2 text-[11px] text-muted-foreground">
                          {i.body}
                        </div>
                      )}
                    </div>
                  ))}
                  {entry.detail.interactions.length === 0 && (
                    <div className="text-xs text-muted-foreground">
                      First touch — no logged activity yet.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
