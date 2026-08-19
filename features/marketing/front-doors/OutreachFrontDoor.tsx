"use client";

/**
 * /marketing/outreach — the Marketing pillar's FRONT DOOR to outreach.
 *
 * The whole outreach product already ships: campaigns and sequences at
 * `/crm/outreach-lists`, the unified inbox at `/crm/inbox`, the action queue at
 * `/crm/chasebox`, the right to send at `/crm/sending-identities`, and
 * prospecting on each website's backlinks workspace. Until now the Marketing
 * pillar told a user exploring it that outreach did not exist.
 *
 * So this page is doors, not a console. `docs/handoffs/outreach-system.md` §7
 * names "a separate outreach console" as a trap: outreach belongs beside the
 * records, in `/crm/*`. Every number here is a live count and every number is a
 * door (no-dead-ends, corollary 5).
 *
 * SCOPE HONESTY: the queue counts use the SAME default scope the Chasebox
 * itself opens on (`mine`), so the number a user reads here is the number they
 * see after the click. A different default would make this page lie by
 * arithmetic.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Inbox,
  ListChecks,
  MailCheck,
  Send,
  Target,
  Trophy,
} from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { InlineQueryError } from "@/features/marketing/components/shared/MarketingUi";
import { useCrmContext } from "@/features/crm/hooks/useCrmContext";
import { fetchOutreachLists } from "@/features/crm/outreach-lists/service";
import { fetchChaseboxCounts } from "@/features/crm/chasebox/service";
import {
  CHASEBOX_QUEUES,
  CHASEBOX_QUEUE_META,
  EMPTY_CHASEBOX_COUNTS,
  type ChaseboxCounts,
} from "@/features/crm/chasebox/types";
import { listSendingIdentities } from "@/features/crm/sending-identities/service";
import { listRecentWins } from "@/features/crm/outcomes/service";
import { outcomeVerdict, type OutcomeEventRow } from "@/features/crm/outcomes/lib";
import { makeScope } from "@/lib/list-scope/types";
import { formatCompactDate } from "@/features/marketing/components/shared/MarketingUi";
import {
  MarketingDoorBoard,
  MarketingFrontDoorPage,
  type MarketingDoor,
} from "./MarketingDoorBoard";
import {
  FrontDoorSiteSelect,
  frontDoorSitePath,
  useFrontDoorSite,
} from "./FrontDoorSiteSelect";

const RECENT_WIN_LIMIT = 5;

/** The Chasebox's own default scope — see the scope-honesty note above. */
const QUEUE_SCOPE = makeScope("mine");

interface OutreachSummary {
  campaigns: number;
  queues: ChaseboxCounts;
  mailboxes: number | null;
  wins: OutcomeEventRow[];
}

export function OutreachFrontDoor() {
  const ctx = useCrmContext();
  const siteState = useFrontDoorSite();
  const [summary, setSummary] = useState<OutreachSummary | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!ctx) return;
    let cancelled = false;
    void (async () => {
      try {
        setError(null);
        const [lists, queues] = await Promise.all([
          fetchOutreachLists(ctx),
          fetchChaseboxCounts(QUEUE_SCOPE),
        ]);
        if (cancelled) return;
        // Wins depend on the campaigns we just resolved, so this second hop is
        // sequential by necessity, not by accident.
        const wins = await listRecentWins({
          campaignIds: lists.map((list) => list.id),
          limit: RECENT_WIN_LIMIT,
        });
        // The mailbox count comes from aidream, the one part of this page that
        // is not a Supabase read. A server that is down must not blank the
        // whole front door — the door still opens, it just carries no number.
        const mailboxes = await listSendingIdentities()
          .then((rows) => rows.length)
          .catch(() => null);
        if (cancelled) return;
        setSummary({ campaigns: lists.length, queues, mailboxes, wins });
      } catch (err) {
        if (!cancelled) setError(err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ctx, reloadToken]);

  const queues = summary?.queues ?? EMPTY_CHASEBOX_COUNTS;
  const needsYou = CHASEBOX_QUEUES.reduce((sum, q) => sum + queues[q], 0);
  const loading = summary === null;

  const doors: MarketingDoor[] = [
    {
      label: "Campaigns & sequences",
      href: "/crm/outreach-lists",
      description:
        "Every outreach campaign: who is enrolled, which step they are on, and what the sequence sends next.",
      Icon: Send,
      count: loading ? null : summary.campaigns,
      countLabel: summary?.campaigns === 1 ? "campaign" : "campaigns",
    },
    {
      label: "Needs you now",
      href: "/crm/chasebox",
      description:
        "The Chasebox: fresh replies, drafts awaiting approval, stalled sequences, blocked members and people worth escalating.",
      Icon: ListChecks,
      count: loading ? null : needsYou,
      countLabel: needsYou === 1 ? "item waiting" : "items waiting",
      tone: "attention",
    },
    {
      label: "Replies",
      href: "/crm/inbox",
      description:
        "Every reply to your outreach in one inbox, with the campaign, the step it answers and the record that motivated the message.",
      Icon: Inbox,
    },
    {
      label: "Sending mailboxes",
      href: "/crm/sending-identities",
      description:
        "The right to send: your own verified mailboxes, their domain proof, warmup and delivery health — plus the bring-up checklist.",
      Icon: MailCheck,
      count: loading || summary.mailboxes === null ? undefined : summary.mailboxes,
      countLabel: summary?.mailboxes === 1 ? "mailbox" : "mailboxes",
    },
  ];

  if (siteState.site) {
    doors.push({
      label: "Find prospects",
      href: `${frontDoorSitePath(siteState.site)}/backlinks?view=prospects`,
      description:
        "Where campaigns come from: competitor link gaps and SERP prospects for this website, each with a Start outreach door.",
      Icon: Target,
    });
  }

  return (
    <MarketingFrontDoorPage
      title="Outreach"
      lede="Link and PR prospecting, sequenced contact, and earned placements — the pipeline lives beside the records in your CRM. This is the way in."
      toolbar={
        <FrontDoorSiteSelect
          state={siteState}
          basePath="/marketing/outreach"
          label="Website for prospecting"
        />
      }
    >
      {error ? (
        <InlineQueryError
          what="outreach summary"
          error={error}
          onRetry={() => setReloadToken((n) => n + 1)}
        />
      ) : null}

      <MarketingDoorBoard
        title="The pipeline"
        description="Counts are live and scoped to what you own — the same scope each surface opens on."
        doors={doors}
      />

      <section className="rounded-lg border border-border bg-background/60 p-3">
        <header className="mb-2.5 min-w-0">
          <h2 className="text-sm font-semibold text-foreground">
            What needs you, queue by queue
          </h2>
          <p className="text-xs leading-snug text-muted-foreground">
            Each count opens that queue in the Chasebox.
          </p>
        </header>
        <div className="flex flex-wrap gap-2">
          {CHASEBOX_QUEUES.map((queue) => {
            const meta = CHASEBOX_QUEUE_META[queue];
            const value = queues[queue];
            return (
              <Link
                key={queue}
                href={`/crm/chasebox?queue=${queue}`}
                title={meta.description}
                className="group inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs transition-colors hover:border-primary/50 hover:bg-accent"
              >
                <meta.Icon
                  className="size-3.5 shrink-0 text-muted-foreground group-hover:text-primary"
                  aria-hidden
                />
                <span className="font-medium text-foreground">{meta.label}</span>
                {loading ? (
                  <Skeleton className="h-3.5 w-5" />
                ) : (
                  <span className="font-semibold tabular-nums text-foreground">
                    {value.toLocaleString()}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </section>

      <section className="rounded-lg border border-border bg-background/60 p-3">
        <header className="mb-2.5 min-w-0">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <Trophy className="size-4 text-primary" aria-hidden />
            Recent wins
          </h2>
          <p className="text-xs leading-snug text-muted-foreground">
            Placements our own crawl found after a pitch and credited to the
            campaign that earned them.
          </p>
        </header>
        {loading ? (
          <Skeleton className="h-12 w-full" />
        ) : summary.wins.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No confirmed placements yet. Wins appear here on their own — a
            campaign pitches, our backlink crawl later sees the link, and the
            attribution pass credits it.
          </p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-md border border-border bg-card">
            {summary.wins.map((win) => {
              const verdict = outcomeVerdict(win);
              return (
                <li key={win.id}>
                  <Link
                    href={`/crm/outreach-lists/${win.campaign_id}?view=outcomes`}
                    className="flex items-baseline justify-between gap-3 px-2.5 py-2 transition-colors hover:bg-accent"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-medium text-foreground">
                        {verdict.headline}
                      </span>
                      <span className="block truncate text-[11px] leading-snug text-muted-foreground">
                        {verdict.detail}
                      </span>
                    </span>
                    <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                      {formatCompactDate(win.matched_at)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </MarketingFrontDoorPage>
  );
}
