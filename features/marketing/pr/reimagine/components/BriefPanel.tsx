"use client";

/**
 * THE BRIEF — the right half of the desk.
 *
 * Whatever is selected in the queue is fully worked here: read it, judge it,
 * close its gaps, move it. Nothing on this panel is a summary that makes you
 * go somewhere else to act; the actions that change the record are on the
 * record.
 */

import { useState } from "react";
import {
  ArrowLeft,
  Clock,
  Copy,
  ExternalLink,
  Gavel,
  Inbox,
  Lightbulb,
  Link2,
  Newspaper,
  Quote,
  PenLine,
  Radar,
  Send,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import {
  formatCompactDate,
  formatDateOnly,
} from "@/features/marketing/components/shared/MarketingUi";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

import {
  ACTION_LABEL,
  ANGLE_TYPE_LABEL,
  angleReadiness,
  countdownTo,
  ENDOWMENT_LABEL,
  humanise,
  OUTLET_KIND_LABEL,
  PLATFORM_LABEL,
  scoreTone,
} from "../lib/desk";
import {
  allowedAngleActions,
  allowedRequestActions,
  ANGLE_ACTION_LABEL,
  REQUEST_ACTION_LABEL,
  type AngleAction,
  type RequestAction,
} from "../lib/actions";
import { buildProofLedger, readProofItems } from "../lib/proof";
import type {
  CoverageMentionRow,
  DeskItem,
  DeskSite,
  SourceRequestRow,
  StoryAngleRow,
} from "../types";
import { CoverageRef, JournalistRef, OutletRef, SiteRef } from "./Doors";
import { FactsAndInferences, ProofLedger } from "./ProofLedger";
import { MatchMeter } from "./ReadinessMeter";
import { angleLane, requestLane, StoryLane } from "./StoryLane";

export interface BriefHandlers {
  onAngleAction: (angle: StoryAngleRow, action: AngleAction) => void;
  onAttachEvidence: (
    angle: StoryAngleRow,
    input: { label: string; note: string },
  ) => void;
  onRequestAction: (request: SourceRequestRow, action: RequestAction) => void;
  onSaveDraft: (request: SourceRequestRow, draft: string) => void;
  onSelect: (id: string) => void;
  onBack: () => void;
}

export function BriefPanel({
  item,
  site,
  now,
  relatedRequests,
  relatedCoverage,
  relatedAngle,
  handlers,
  showBack,
}: {
  item: DeskItem | null;
  site: DeskSite | null;
  now: number;
  relatedRequests: SourceRequestRow[];
  relatedCoverage: CoverageMentionRow[];
  relatedAngle: StoryAngleRow | null;
  handlers: BriefHandlers;
  showBack: boolean;
}) {
  if (!item) return <BriefIntro />;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {showBack ? (
        <div className="shrink-0 border-b border-border/70 px-3 py-2 lg:hidden">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={handlers.onBack}
          >
            <ArrowLeft className="mr-1 h-3.5 w-3.5" />
            Back to the desk
          </Button>
        </div>
      ) : null}
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
        {item.kind === "angle" ? (
          <AngleBrief
            angle={item.row}
            site={site}
            now={now}
            relatedRequests={relatedRequests}
            relatedCoverage={relatedCoverage}
            handlers={handlers}
          />
        ) : item.kind === "request" ? (
          <RequestBrief
            request={item.row}
            site={site}
            now={now}
            relatedAngle={relatedAngle}
            handlers={handlers}
          />
        ) : (
          <CoverageBrief
            mention={item.row}
            site={site}
            relatedAngle={relatedAngle}
            handlers={handlers}
          />
        )}
      </div>
    </div>
  );
}

/* ── the calm first screen ─────────────────────────────────────────────── */

/**
 * Nothing selected is the state a brand-new operator sees first, so it is not
 * a shrug — it is the whole product explained in six lines. The desk has to
 * carry a user who has never pitched a journalist and does not know what
 * "newsworthy" means in practice.
 */
function BriefIntro() {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="max-w-md">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Radar className="h-4 w-4" />
        </span>
        <h2 className="mt-3 text-base font-semibold text-foreground">
          You are not short of a press channel. You are short of a story.
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          The desk on the left is every story that is genuinely newsworthy
          about your businesses, ranked by what to do next. Pick one and this
          panel shows the headline a journalist needs to hear, why it matters
          this week, and — the part nobody else shows you — the exact evidence
          a newsroom will demand before they believe it.
        </p>
        <dl className="mt-4 space-y-2 text-sm">
          <IntroLine icon={<Lightbulb className="h-3.5 w-3.5" />}>
            <strong className="font-medium text-foreground">Angles</strong> are
            what is newsworthy about you. Gaps in their proof are a to-do list,
            not a failure.
          </IntroLine>
          <IntroLine icon={<Inbox className="h-3.5 w-3.5" />}>
            <strong className="font-medium text-foreground">Requests</strong> are
            journalists actively asking, on a clock. They sit in the rail above
            because they expire.
          </IntroLine>
          <IntroLine icon={<Newspaper className="h-3.5 w-3.5" />}>
            <strong className="font-medium text-foreground">Coverage</strong> is
            what landed, tied back to the story that produced it.
          </IntroLine>
        </dl>
        <p className="mt-4 text-xs text-muted-foreground">
          Start at the top of the queue. It is ranked for you, and every rank
          will tell you why if you hover it.
        </p>
      </div>
    </div>
  );
}

function IntroLine({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground">
        {icon}
      </span>
      <span className="text-[13px] leading-snug text-muted-foreground">
        {children}
      </span>
    </div>
  );
}

/* ── angle ─────────────────────────────────────────────────────────────── */

function AngleBrief({
  angle,
  site,
  now,
  relatedRequests,
  relatedCoverage,
  handlers,
}: {
  angle: StoryAngleRow;
  site: DeskSite | null;
  now: number;
  relatedRequests: SourceRequestRow[];
  relatedCoverage: CoverageMentionRow[];
  handlers: BriefHandlers;
}) {
  const ledger = buildProofLedger({
    id: angle.id,
    evidenceRefs: angle.evidence_refs,
    proofRequired: angle.proof_required,
    missingEvidence: angle.missing_evidence,
    contradictions: angle.contradictions,
  });
  const facts = readProofItems(angle.facts, `${angle.id}-fact`, true);
  const inferences = readProofItems(angle.inferences, `${angle.id}-inf`);
  const expiry = countdownTo(angle.expires_at, now);
  const actions = allowedAngleActions(angle);

  return (
    <div className="space-y-4 p-4">
      <header className="space-y-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="gap-1">
            <Lightbulb className="h-3 w-3" />
            Story angle
          </Badge>
          <SiteRef site={site} className="text-xs" />
          <Badge
            variant={
              angle.status === "landed"
                ? "success"
                : angle.status === "dismissed"
                  ? "neutral"
                  : "outline"
            }
            className="capitalize"
          >
            {angle.status}
          </Badge>
          {expiry && !expiry.expired ? (
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <Clock className="h-3 w-3" />
              angle goes stale in {expiry.label}
            </span>
          ) : null}
        </div>

        <h2 className="text-lg font-semibold leading-snug text-foreground">
          {angle.headline}
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {angle.summary}
        </p>

        <div className="rounded-lg border border-border/70 bg-muted/40 px-3 py-2">
          <StoryLane stops={angleLane(angle)} />
        </div>
      </header>

      {angle.why_now ? (
        <section className="rounded-xl border border-primary/30 bg-primary/[0.04] p-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-primary">
            Why now
          </h3>
          <p className="mt-1 text-[13px] leading-relaxed text-foreground">
            {angle.why_now}
          </p>
        </section>
      ) : (
        <section className="rounded-xl border border-dashed border-border p-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Why now
          </h3>
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
            No timeliness hook was found. A newsroom&apos;s first question is
            &ldquo;why this week?&rdquo; — without an answer this is a feature
            idea, not a news story.
          </p>
        </section>
      )}

      <ScoreBoard angle={angle} />

      {angle.action_reason ? (
        <section className="flex items-start gap-2 rounded-xl border border-border bg-card p-3">
          <Gavel className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Recommended: {ACTION_LABEL[angle.recommended_action] ?? humanise(angle.recommended_action)}
            </h3>
            <p className="mt-0.5 text-[13px] leading-relaxed text-foreground">
              {angle.action_reason}
            </p>
          </div>
        </section>
      ) : null}

      <ProofLedger
        angle={angle}
        ledger={ledger}
        onAttach={(input) => handlers.onAttachEvidence(angle, input)}
      />

      <FactsAndInferences facts={facts} inferences={inferences} />

      <section className="rounded-xl border border-border bg-card p-3">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Who this is for
        </h3>
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
          <Field label="Beat" value={angle.target_beat ?? "Not targeted yet"} />
          <Field
            label="Outlet kind"
            value={
              angle.target_outlet_kind
                ? (OUTLET_KIND_LABEL[angle.target_outlet_kind] ??
                  humanise(angle.target_outlet_kind))
                : "Any"
            }
          />
          <Field
            label="Endowment"
            value={ENDOWMENT_LABEL[angle.endowment] ?? humanise(angle.endowment)}
          />
          <Field
            label="Angle type"
            value={
              ANGLE_TYPE_LABEL[angle.angle_type] ?? humanise(angle.angle_type)
            }
          />
          <Field
            label="Analyzed"
            value={
              angle.analyzed_at
                ? `${formatCompactDate(angle.analyzed_at)}${angle.analysis_version ? ` · ${angle.analysis_version}` : ""}`
                : "Never analyzed"
            }
          />
          <Field
            label="Your ruling"
            value={
              angle.human_reviewed_at
                ? formatCompactDate(angle.human_reviewed_at)
                : "You have not ruled on this yet"
            }
          />
        </dl>
      </section>

      <RelatedRequests
        requests={relatedRequests}
        now={now}
        onSelect={handlers.onSelect}
      />
      <RelatedCoverage coverage={relatedCoverage} onSelect={handlers.onSelect} />

      <footer className="sticky bottom-0 -mx-4 -mb-4 flex flex-wrap items-center gap-2 border-t border-border bg-card/95 px-4 py-3 backdrop-blur">
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={() => copyPitch(angle)}
        >
          <Copy className="mr-1 h-3.5 w-3.5" />
          Copy the pitch
        </Button>
        {actions.length === 0 ? (
          <span className="text-xs text-muted-foreground">
            This angle has reached the end of its lane.
          </span>
        ) : (
          actions.map((action) => (
            <Button
              key={action}
              size="sm"
              variant={
                action === "dismiss"
                  ? "ghost"
                  : action === "pitch" || action === "accept"
                    ? "default"
                    : "outline"
              }
              className={cn(
                "h-7 text-xs",
                action === "dismiss" && "ml-auto text-muted-foreground",
              )}
              onClick={async () => {
                if (action === "dismiss") {
                  const ok = await confirm({
                    title: "Dismiss this angle?",
                    description:
                      "It stays on the desk under “show closed” so the analyzer does not propose it again — nothing is deleted.",
                    confirmLabel: "Dismiss",
                    variant: "destructive",
                  });
                  if (!ok) return;
                }
                handlers.onAngleAction(angle, action);
              }}
            >
              {ANGLE_ACTION_LABEL[action]}
            </Button>
          ))
        )}
      </footer>
    </div>
  );
}

/**
 * The five scores, in the one place a decision is made. In the QUEUE they are
 * a four-bar shape; here they are exact, labelled, and each says what a low
 * number would mean — a number without a consequence is decoration.
 */
function ScoreBoard({ angle }: { angle: StoryAngleRow }) {
  const segments = [
    ...angleReadiness(angle),
    {
      key: "priority",
      label: "Priority",
      value: angle.priority,
      meaning: "Where it sits in the queue.",
    },
  ];
  return (
    <section className="grid grid-cols-2 gap-2 sm:grid-cols-5">
      {segments.map((segment) => {
        const tone = scoreTone(segment.value);
        return (
          <div
            key={segment.key}
            className="rounded-lg border border-border/70 bg-card px-2.5 py-2"
          >
            <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {segment.label}
            </p>
            <p
              className={cn(
                "mt-0.5 text-lg font-semibold tabular-nums leading-none",
                tone === "strong" && "text-emerald-600 dark:text-emerald-400",
                tone === "fair" && "text-amber-600 dark:text-amber-400",
                tone === "weak" && "text-muted-foreground",
              )}
            >
              {segment.value}
            </p>
            <span className="mt-1.5 flex h-1 w-full overflow-hidden rounded-full bg-foreground/10">
              <span
                className={cn(
                  "rounded-full",
                  tone === "strong" && "bg-emerald-500 dark:bg-emerald-400",
                  tone === "fair" && "bg-amber-500 dark:bg-amber-400",
                  tone === "weak" && "bg-muted-foreground/45",
                )}
                style={{ width: `${Math.max(3, Math.min(100, segment.value))}%` }}
              />
            </span>
            <p className="mt-1 line-clamp-2 text-[10px] leading-snug text-muted-foreground">
              {segment.meaning}
            </p>
          </div>
        );
      })}
    </section>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 break-words text-xs font-medium text-foreground">
        {value}
      </dd>
    </div>
  );
}

function RelatedRequests({
  requests,
  now,
  onSelect,
}: {
  requests: SourceRequestRow[];
  now: number;
  onSelect: (id: string) => void;
}) {
  if (requests.length === 0) return null;
  return (
    <section className="rounded-xl border border-border bg-card p-3">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Journalists already asking for this ({requests.length})
      </h3>
      <ul className="mt-2 space-y-1.5">
        {requests.map((request) => {
          const countdown = countdownTo(request.deadline_at, now);
          return (
            <li key={request.id}>
              <button
                type="button"
                onClick={() => onSelect(request.id)}
                className="flex w-full items-center gap-2 rounded-lg border border-border/70 px-2.5 py-1.5 text-left transition-colors hover:border-primary/50 hover:bg-accent/50"
              >
                <Inbox className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
                  {request.outlet ?? PLATFORM_LABEL[request.platform]} ·{" "}
                  {request.query_title}
                </span>
                {countdown ? (
                  <span
                    className={cn(
                      "shrink-0 text-[10px] font-semibold tabular-nums",
                      countdown.band === "critical"
                        ? "text-destructive"
                        : "text-muted-foreground",
                    )}
                  >
                    {countdown.expired ? "closed" : countdown.label}
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function RelatedCoverage({
  coverage,
  onSelect,
}: {
  coverage: CoverageMentionRow[];
  onSelect: (id: string) => void;
}) {
  if (coverage.length === 0) return null;
  return (
    <section className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.04] p-3">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
        This angle produced coverage ({coverage.length})
      </h3>
      <ul className="mt-2 space-y-1.5">
        {coverage.map((mention) => (
          <li key={mention.id} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onSelect(mention.id)}
              className="min-w-0 flex-1 truncate text-left text-xs font-medium text-foreground underline-offset-2 hover:text-primary hover:underline"
            >
              {mention.title ?? mention.normalized_url}
            </button>
            <a
              href={mention.url}
              target="_blank"
              rel="noreferrer noopener"
              className="shrink-0 text-muted-foreground hover:text-primary"
              aria-label="Open the published article"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </li>
        ))}
      </ul>
      <p className="mt-1.5 text-[10px] leading-snug text-muted-foreground">
        There is no foreign key from coverage back to an angle. This tie is
        read from <code className="font-mono">coverage_mention.metadata.story_angle_id</code>.
      </p>
    </section>
  );
}

async function copyPitch(angle: StoryAngleRow): Promise<void> {
  const text = [
    `Subject: ${angle.headline}`,
    "",
    angle.summary,
    "",
    angle.why_now ? `Why now: ${angle.why_now}` : "",
    "",
    "What we can put in front of you:",
    ...readProofItems(angle.evidence_refs, "copy", true).map(
      (item) => `  • ${item.label}${item.source ? ` (${item.source})` : ""}`,
    ),
  ]
    .filter(Boolean)
    .join("\n");
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Pitch copied", {
      description: "Headline, summary, timeliness hook and the evidence list.",
    });
  } catch {
    toast.error("Could not reach the clipboard", {
      description: "Your browser blocked clipboard access.",
    });
  }
}

/* ── request ───────────────────────────────────────────────────────────── */

function RequestBrief({
  request,
  site,
  now,
  relatedAngle,
  handlers,
}: {
  request: SourceRequestRow;
  site: DeskSite | null;
  now: number;
  relatedAngle: StoryAngleRow | null;
  handlers: BriefHandlers;
}) {
  const countdown = countdownTo(request.deadline_at, now);
  const requirements = readProofItems(request.requirements, `${request.id}-req`);
  const actions = allowedRequestActions(request);
  const [draft, setDraft] = useState(request.draft_response ?? "");
  const [editing, setEditing] = useState(Boolean(request.draft_response));

  return (
    <div className="space-y-4 p-4">
      <header className="space-y-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="warning" className="gap-1">
            <Inbox className="h-3 w-3" />
            {PLATFORM_LABEL[request.platform] ?? humanise(request.platform)}
          </Badge>
          <SiteRef site={site} className="text-xs" />
          <Badge variant="outline" className="capitalize">
            {humanise(request.status)}
          </Badge>
        </div>

        {countdown ? (
          <div
            className={cn(
              "flex items-center gap-2 rounded-xl border px-3 py-2",
              countdown.band === "critical" &&
                "border-destructive/50 bg-destructive/10",
              countdown.band === "urgent" &&
                "border-amber-500/50 bg-amber-500/10",
              (countdown.band === "soon" || countdown.band === "later") &&
                "border-border bg-muted/40",
              countdown.band === "expired" && "border-border bg-muted",
            )}
          >
            <Clock
              className={cn(
                "h-4 w-4 shrink-0",
                countdown.band === "critical"
                  ? "text-destructive"
                  : "text-muted-foreground",
              )}
            />
            <div className="min-w-0">
              <p
                className={cn(
                  "text-sm font-semibold tabular-nums",
                  countdown.band === "critical"
                    ? "text-destructive"
                    : "text-foreground",
                )}
              >
                {countdown.expired
                  ? `Window ${countdown.label}`
                  : `Closes in ${countdown.label}`}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {formatCompactDate(request.deadline_at)}
                {countdown.expired
                  ? " — kept on the desk because the journalist and outlet are still worth knowing."
                  : ""}
              </p>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
            No deadline was published with this request. Treat it as closing
            today — most platforms cut off within 24 hours.
          </div>
        )}

        <h2 className="text-base font-semibold leading-snug text-foreground">
          {request.query_title}
        </h2>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <OutletRef outlet={request.outlet} url={request.external_url} />
          <span className="text-border">·</span>
          <JournalistRef
            partyId={request.party_id}
            name={request.journalist_name}
          />
          {request.beat ? (
            <>
              <span className="text-border">·</span>
              <span className="text-xs text-muted-foreground">{request.beat}</span>
            </>
          ) : null}
        </div>

        <div className="rounded-lg border border-border/70 bg-muted/40 px-3 py-2">
          <StoryLane stops={requestLane(request)} />
        </div>
      </header>

      {request.query_body ? (
        <section className="rounded-xl border border-border bg-card p-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            What the journalist asked for
          </h3>
          <p className="mt-1 whitespace-pre-line text-[13px] leading-relaxed text-foreground">
            {request.query_body}
          </p>
          {request.external_url ? (
            <a
              href={request.external_url}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground underline-offset-2 hover:text-primary hover:underline"
            >
              Open the original request on{" "}
              {PLATFORM_LABEL[request.platform] ?? request.platform}
              <ExternalLink className="h-3 w-3" />
            </a>
          ) : null}
        </section>
      ) : null}

      <section className="rounded-xl border border-border bg-card p-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Why you were matched
          </h3>
          <MatchMeter value={request.match_score} reason={request.match_reason} />
        </div>
        <p className="mt-1 text-[13px] leading-relaxed text-foreground">
          {request.match_reason ??
            "No match reason was recorded — the score alone is not a reason to respond. Read the request and judge it yourself."}
        </p>
        {relatedAngle ? (
          <button
            type="button"
            onClick={() => handlers.onSelect(relatedAngle.id)}
            className="mt-2 flex w-full items-center gap-2 rounded-lg border border-border/70 px-2.5 py-1.5 text-left transition-colors hover:border-primary/50 hover:bg-accent/50"
          >
            <Link2 className="h-3.5 w-3.5 shrink-0 text-primary" />
            <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
              {relatedAngle.headline}
            </span>
            <span className="shrink-0 text-[10px] text-muted-foreground">
              open the angle
            </span>
          </button>
        ) : (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Not tied to any story angle. Responding is still fine — it just
            will not carry your evidence with it.
          </p>
        )}
      </section>

      {requirements.length > 0 ? (
        <section className="rounded-xl border border-border bg-card p-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Their rules ({requirements.length})
          </h3>
          <ul className="mt-1.5 space-y-1">
            {requirements.map((item) => (
              <li key={item.key} className="flex items-start gap-2">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground" />
                <span className="text-xs leading-snug text-foreground">
                  {item.label}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[10px] text-muted-foreground">
            Breaking one of these is the most common reason a good response is
            binned unread.
          </p>
        </section>
      ) : null}

      <section className="rounded-xl border border-border bg-card p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Your response
          </h3>
          {request.draft_generated_at ? (
            <span className="text-[10px] text-muted-foreground">
              drafted {formatCompactDate(request.draft_generated_at)}
            </span>
          ) : null}
        </div>

        {editing ? (
          <>
            <Textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              rows={9}
              className="mt-2 text-[13px] leading-relaxed"
              placeholder="Answer the question they asked, in their words, with one thing only you can say."
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                className="h-7 text-xs"
                disabled={draft.trim().length === 0}
                onClick={() => {
                  handlers.onSaveDraft(request, draft.trim());
                  toast.success("Draft saved to the request");
                }}
              >
                Save draft
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                disabled={draft.trim().length === 0}
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(draft);
                    toast.success("Response copied", {
                      description: "Paste it into the platform to submit.",
                    });
                  } catch {
                    toast.error("Could not reach the clipboard");
                  }
                }}
              >
                <Copy className="mr-1 h-3.5 w-3.5" />
                Copy
              </Button>
              <span className="ml-auto text-[10px] tabular-nums text-muted-foreground">
                {draft.trim().split(/\s+/).filter(Boolean).length} words
              </span>
            </div>
          </>
        ) : (
          <div className="mt-2 rounded-lg border border-dashed border-border p-3">
            <p className="text-xs leading-relaxed text-muted-foreground">
              Nothing drafted yet. Write it here and it is saved onto the
              request, or open the original on the platform and answer there.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                className="h-7 text-xs"
                onClick={() => setEditing(true)}
              >
                Write the response
              </Button>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      disabled
                    >
                      <PenLine className="mr-1 h-3.5 w-3.5" />
                      Draft with AI
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent className="max-w-72">
                  <p className="text-xs">
                    No drafting service is wired to{" "}
                    <code className="font-mono">seo.source_request</code> yet.
                    The button is disabled rather than hidden so you know the
                    capability is intended, and rather than enabled so it never
                    fails silently on you.
                  </p>
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        )}
      </section>

      <footer className="sticky bottom-0 -mx-4 -mb-4 flex flex-wrap items-center gap-2 border-t border-border bg-card/95 px-4 py-3 backdrop-blur">
        {actions.length === 0 ? (
          <span className="text-xs text-muted-foreground">
            {request.status === "won"
              ? "You won this one. It is in Landed."
              : "This window is closed — no action left."}
          </span>
        ) : (
          actions.map((action) => (
            <Button
              key={action}
              size="sm"
              variant={action === "pass" ? "ghost" : "default"}
              className={cn(
                "h-7 text-xs",
                action === "pass" && "ml-auto text-muted-foreground",
              )}
              onClick={async () => {
                if (action === "pass") {
                  const ok = await confirm({
                    title: "Pass on this request?",
                    description:
                      "It leaves the live rail and stays on the desk under “show closed”.",
                    confirmLabel: "Pass",
                  });
                  if (!ok) return;
                }
                if (action === "draft") {
                  setEditing(true);
                }
                handlers.onRequestAction(request, action);
              }}
            >
              {action === "submit" ? (
                <Send className="mr-1 h-3.5 w-3.5" />
              ) : null}
              {REQUEST_ACTION_LABEL[action]}
            </Button>
          ))
        )}
      </footer>
    </div>
  );
}

/* ── coverage ──────────────────────────────────────────────────────────── */

function CoverageBrief({
  mention,
  site,
  relatedAngle,
  handlers,
}: {
  mention: CoverageMentionRow;
  site: DeskSite | null;
  relatedAngle: StoryAngleRow | null;
  handlers: BriefHandlers;
}) {
  const topics = readProofItems(mention.topics, `${mention.id}-topic`, true);
  return (
    <div className="space-y-4 p-4">
      <header className="space-y-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="success" className="gap-1">
            <Newspaper className="h-3 w-3" />
            Coverage
          </Badge>
          <SiteRef site={site} className="text-xs" />
          <Badge variant="outline" className="capitalize">
            {humanise(mention.medium)}
          </Badge>
          {mention.published_at ? (
            <span className="text-[11px] text-muted-foreground">
              {formatDateOnly(mention.published_at)}
            </span>
          ) : null}
        </div>

        <CoverageRef
          title={mention.title ?? mention.normalized_url}
          url={mention.url}
          className="text-base leading-snug"
        />

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <OutletRef outlet={mention.domain} url={mention.url} />
          <span className="text-border">·</span>
          <JournalistRef
            partyId={mention.author_party_id}
            name={mention.author_name}
          />
        </div>
      </header>

      {mention.key_quote ? (
        <blockquote className="rounded-xl border-l-2 border-primary bg-muted/40 p-3">
          <Quote className="h-3.5 w-3.5 text-primary/70" />
          <p className="mt-1 text-sm italic leading-relaxed text-foreground">
            {mention.key_quote}
          </p>
        </blockquote>
      ) : null}

      <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Prominence" value={mention.prominence_score} suffix="/100" hint={mention.prominence} />
        <Stat label="Sentiment" value={mention.sentiment_score} suffix="" hint={mention.sentiment} />
        <Stat label="Hit score" value={mention.hit_score} suffix="/100" hint={mention.hit_reason} />
        <div className="rounded-lg border border-border/70 bg-card px-2.5 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Link
          </p>
          <p className="mt-0.5 text-sm font-semibold text-foreground">
            {mention.links_to_site ? "Yes" : "No"}
          </p>
          {mention.link_urls.length > 0 ? (
            <ul className="mt-1 space-y-0.5">
              {mention.link_urls.map((url) => (
                <li key={url} className="truncate">
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-[10px] text-muted-foreground underline-offset-2 hover:text-primary hover:underline"
                  >
                    {url.replace(/^https?:\/\//, "")}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-3">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Which story produced this
        </h3>
        {relatedAngle ? (
          <button
            type="button"
            onClick={() => handlers.onSelect(relatedAngle.id)}
            className="mt-1.5 flex w-full items-center gap-2 rounded-lg border border-border/70 px-2.5 py-1.5 text-left transition-colors hover:border-primary/50 hover:bg-accent/50"
          >
            <Lightbulb className="h-3.5 w-3.5 shrink-0 text-primary" />
            <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
              {relatedAngle.headline}
            </span>
            <span className="shrink-0 text-[10px] text-muted-foreground">
              open the angle
            </span>
          </button>
        ) : (
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            No angle tie recorded. This landed without a tracked pitch, or the
            tie was never written — there is no foreign key from
            <code className="mx-1 font-mono">coverage_mention</code> to
            <code className="ml-1 font-mono">story_angle</code>, so the desk
            reads it from{" "}
            <code className="font-mono">metadata.story_angle_id</code>.
          </p>
        )}
      </section>

      {mention.matched_terms.length > 0 || topics.length > 0 ? (
        <section className="flex flex-wrap gap-1.5">
          {mention.matched_terms.map((term) => (
            <Badge key={term} variant="secondary">
              {term}
            </Badge>
          ))}
          {topics.map((topic) => (
            <Badge key={topic.key} variant="outline">
              {topic.label}
            </Badge>
          ))}
        </section>
      ) : null}
    </div>
  );
}

function Stat({
  label,
  value,
  suffix,
  hint,
}: {
  label: string;
  value: number | null;
  suffix: string;
  hint: string | null;
}) {
  return (
    <div className="rounded-lg border border-border/70 bg-card px-2.5 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">
        {value === null ? "not scored" : `${value}${suffix}`}
      </p>
      {hint ? (
        <p className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-muted-foreground">
          {humanise(hint)}
        </p>
      ) : null}
    </div>
  );
}
