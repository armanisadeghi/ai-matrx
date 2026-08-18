"use client";

/**
 * The detail pane — level 2 of the console's progressive disclosure.
 *
 * Four tabs, never more, because NN/G's two-level rule applies to this pane
 * exactly as it applies to the workspace: sidebar → list → detail is already
 * the budget, and the tabs are how the detail stays one level rather than
 * becoming a nested tree.
 *
 * The Proof tab is the reason this product exists. It is written as a
 * checklist that is partly done — "3 of 5 proofs in hand", the satisfied ones
 * struck through in the affirmative, the outstanding ones rendered as tasks
 * with an owner, an effort and a stated method. Nothing here is red. The
 * honest state of an unproven angle is "here is the work", not "here is a
 * fault", and the visual grammar has to agree with that or the operator will
 * quietly stop opening the tab.
 */

import * as React from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  BookOpen,
  Check,
  Clipboard,
  ExternalLink,
  Flame,
  Gauge,
  Link2,
  Quote,
  Send,
  BrainCircuit,
  Target,
  Trophy,
  UserRound,
  Zap,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { toast } from "@/lib/toast";
import {
  formatDate,
  formatDateOnly,
} from "@/features/marketing/components/shared/MarketingUi";
import {
  ACTION_IMPERATIVE,
  ACTION_LABEL,
  ANGLE_TYPE_LABEL,
  buildEvidenceLedger,
  coverageAngleId,
  ENDOWMENT_LABEL,
  OUTLET_KIND_LABEL,
  PLATFORM_LABEL,
  readAnalysisNote,
  readContradictions,
  readEvidenceRefs,
  readFacts,
  readInferences,
  readRequirements,
  titleCase,
  urgencyOf,
  type CoverageMentionRow,
  type MissingItem,
  type SourceRequestRow,
  type StoryAngleRow,
} from "../types";
import { angleHref, MEDIA_LISTS_HREF, requestHref } from "../routes";
import {
  Chip,
  DeadlinePip,
  EmptyPanel,
  EvidenceMeter,
  KeyValue,
  PanelHeader,
  PriorityMark,
  ScoreMeters,
  TONE_CHIP,
  type Tone,
} from "./chrome";
import { ACTION_TONE, ANGLE_STATUS_TONE, REQUEST_STATUS_TONE } from "./lists";

/* ── small shared bits ────────────────────────────────────────────────────── */

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copied`);
  } catch {
    toast.error(
      "Your browser blocked the clipboard. Select the text and copy it manually.",
    );
  }
}

function CopyButton({ text, what }: { text: string; what: string }) {
  return (
    <Button
      variant="outline"
      size="sm"
      className="h-6 gap-1 px-1.5 text-[11px]"
      onClick={() => void copy(text, what)}
    >
      <Clipboard className="h-3 w-3" />
      Copy
    </Button>
  );
}

function DetailTabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { key: T; label: string; badge?: number }[];
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <div
      role="tablist"
      className="flex shrink-0 items-center gap-0 border-b border-border px-1"
    >
      {tabs.map((tab) => {
        const active = tab.key === value;
        return (
          <button
            key={tab.key}
            role="tab"
            aria-selected={active}
            type="button"
            onClick={() => onChange(tab.key)}
            className={cn(
              "flex shrink-0 items-center gap-1 border-b-2 px-2.5 py-1.5 text-xs transition-colors",
              active
                ? "border-primary font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:bg-accent/50 hover:text-foreground",
            )}
          >
            {tab.label}
            {typeof tab.badge === "number" ? (
              <span className="tabular-nums text-[11px] text-muted-foreground">
                {tab.badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function Block({
  title,
  icon,
  action,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-border px-2.5 py-2 last:border-b-0">
      <div className="mb-1 flex items-center gap-1.5">
        {icon}
        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </h4>
        <div className="ml-auto">{action}</div>
      </div>
      {children}
    </section>
  );
}

const EFFORT_TONE: Record<MissingItem["effort"], Tone> = {
  quick: "good",
  medium: "cool",
  deep: "warn",
};

const EFFORT_LABEL: Record<MissingItem["effort"], string> = {
  quick: "Quick",
  medium: "Some work",
  deep: "Real project",
};

/* ── angle detail ─────────────────────────────────────────────────────────── */

type AngleTab = "brief" | "proof" | "pitches" | "record";

export function AngleDetail({
  angle,
  requests,
  coverage,
  now,
  onFocusRequest,
  onFocusCoverage,
  onRule,
  locallyRuled,
}: {
  angle: StoryAngleRow;
  requests: SourceRequestRow[];
  coverage: CoverageMentionRow[];
  now: number;
  onFocusRequest: (id: string) => void;
  onFocusCoverage: (id: string) => void;
  onRule: (angleId: string, status: string) => void;
  locallyRuled: boolean;
}) {
  const [tab, setTab] = React.useState<AngleTab>("brief");
  const ledger = buildEvidenceLedger(angle);
  const linkedRequests = requests.filter(
    (row) => row.story_angle_id === angle.id,
  );
  const linkedCoverage = coverage.filter(
    (row) => coverageAngleId(row) === angle.id,
  );

  const brief = [
    `# ${angle.headline}`,
    "",
    angle.summary,
    angle.why_now ? `\nWhy now: ${angle.why_now}` : "",
    "",
    `Proof in hand: ${ledger.have} of ${ledger.total}`,
    ...ledger.missing.map((item) => `- STILL NEEDED: ${item.need}`),
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PanelHeader>
        <PriorityMark value={angle.priority} />
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
          {ANGLE_TYPE_LABEL[angle.angle_type] ?? angle.angle_type}
        </span>
        <Chip tone={ANGLE_STATUS_TONE[angle.status] ?? "muted"}>
          {titleCase(angle.status)}
        </Chip>
        {locallyRuled ? <Chip tone="warn">Unsaved ruling</Chip> : null}
        <a
          href={angleHref(angle.id)}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          title="Open this angle in a new tab"
        >
          <ArrowUpRight className="h-3.5 w-3.5" />
        </a>
      </PanelHeader>

      <div className="shrink-0 border-b border-border px-2.5 py-2">
        <h2 className="text-sm font-semibold leading-5 text-foreground">
          {angle.headline}
        </h2>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <Chip tone={ACTION_TONE[angle.recommended_action] ?? "muted"}>
            {ACTION_LABEL[angle.recommended_action] ??
              titleCase(angle.recommended_action)}
          </Chip>
          <Chip tone="muted">
            {ENDOWMENT_LABEL[angle.endowment] ?? angle.endowment}
          </Chip>
          {angle.target_outlet_kind ? (
            <Chip tone="muted">
              {OUTLET_KIND_LABEL[angle.target_outlet_kind] ??
                angle.target_outlet_kind}
            </Chip>
          ) : null}
          {angle.target_beat ? <Chip tone="muted">{angle.target_beat}</Chip> : null}
          {angle.requires_human_review ? (
            <Chip tone="warn">Needs your ruling</Chip>
          ) : null}
        </div>
        <p className="mt-1.5 text-xs leading-5 text-foreground">
          {ACTION_IMPERATIVE[angle.recommended_action] ?? ""}
          {angle.action_reason ? (
            <span className="text-muted-foreground"> {angle.action_reason}</span>
          ) : null}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Button
            size="sm"
            className="h-6 gap-1 px-2 text-[11px]"
            disabled={angle.status === "accepted" || angle.status === "landed"}
            onClick={() => onRule(angle.id, "accepted")}
          >
            <Check className="h-3 w-3" />
            Accept
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-6 gap-1 px-2 text-[11px]"
            disabled={angle.status === "pitched" || angle.status === "landed"}
            onClick={() => onRule(angle.id, "pitched")}
          >
            <Send className="h-3 w-3" />
            Mark pitched
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-6 gap-1 px-2 text-[11px]"
            disabled={angle.status === "dismissed"}
            onClick={() => onRule(angle.id, "dismissed")}
          >
            Dismiss
          </Button>
          <CopyButton text={brief} what="Angle brief" />
          <a
            href={MEDIA_LISTS_HREF}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-6 items-center gap-1 rounded border border-border px-2 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
            title="Media lists live in the CRM as outreach lists"
          >
            <UserRound className="h-3 w-3" />
            Media lists
            <ExternalLink className="h-2.5 w-2.5" />
          </a>
        </div>
      </div>

      <DetailTabs<AngleTab>
        value={tab}
        onChange={setTab}
        tabs={[
          { key: "brief", label: "Brief" },
          { key: "proof", label: "Proof", badge: ledger.total },
          {
            key: "pitches",
            label: "Pitches",
            badge: linkedRequests.length + linkedCoverage.length,
          },
          { key: "record", label: "Record" },
        ]}
      />

      <ScrollArea className="min-h-0 flex-1">
        {tab === "brief" ? (
          <AngleBrief angle={angle} />
        ) : tab === "proof" ? (
          <AngleProof angle={angle} />
        ) : tab === "pitches" ? (
          <AnglePitches
            requests={linkedRequests}
            coverage={linkedCoverage}
            now={now}
            onFocusRequest={onFocusRequest}
            onFocusCoverage={onFocusCoverage}
          />
        ) : (
          <AngleRecord angle={angle} />
        )}
      </ScrollArea>
    </div>
  );
}

function AngleBrief({ angle }: { angle: StoryAngleRow }) {
  const facts = readFacts(angle.facts);
  const inferences = readInferences(angle.inferences);
  const contradictions = readContradictions(angle.contradictions);
  const journalistRead = readAnalysisNote(angle.analysis, "journalist_read");
  const risk = readAnalysisNote(angle.analysis, "risk");

  return (
    <div>
      <Block title="The story" icon={<BookOpen className="h-3 w-3 text-muted-foreground" />}>
        <p className="text-xs leading-5 text-foreground">{angle.summary}</p>
        {angle.why_now ? (
          <p className="mt-1.5 flex gap-1.5 text-xs leading-5 text-foreground">
            <Zap className="mt-0.5 h-3 w-3 shrink-0 text-amber-600 dark:text-amber-400" />
            <span>
              <span className="font-medium">Why now — </span>
              {angle.why_now}
            </span>
          </p>
        ) : (
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            No timeliness hook recorded. Without one this is an evergreen angle,
            which is harder to place.
          </p>
        )}
      </Block>

      <Block title="Scores" icon={<Gauge className="h-3 w-3 text-muted-foreground" />}>
        <ScoreMeters angle={angle} />
      </Block>

      <Block title={`Facts (${facts.length})`}>
        {facts.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">
            No facts recorded. An angle with no facts is a hunch.
          </p>
        ) : (
          <ul className="space-y-1">
            {facts.map((fact, index) => (
              <li key={index} className="flex gap-1.5">
                <Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span className="min-w-0 text-xs leading-5 text-foreground">
                  {fact.statement}
                  {fact.source ? (
                    <span className="text-muted-foreground"> — {fact.source}</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Block>

      {inferences.length > 0 ? (
        <Block title={`Inferences (${inferences.length})`}>
          <p className="mb-1 text-[11px] text-muted-foreground">
            Reasoned, not verified. A journalist will treat these as your opinion.
          </p>
          <ul className="space-y-1">
            {inferences.map((item, index) => (
              <li key={index} className="flex gap-1.5">
                <BrainCircuit className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                <span className="min-w-0 text-xs leading-5 text-foreground">
                  {item.statement}
                  {item.source ? (
                    <span className="text-muted-foreground"> — {item.source}</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </Block>
      ) : null}

      {contradictions.length > 0 ? (
        <Block
          title={`Contradictions (${contradictions.length})`}
          icon={<AlertTriangle className="h-3 w-3 text-amber-600 dark:text-amber-400" />}
        >
          <p className="mb-1 text-[11px] text-muted-foreground">
            Your own data disagrees with itself here. Reconcile it before a
            reporter does.
          </p>
          <ul className="space-y-1.5">
            {contradictions.map((item, index) => (
              <li
                key={index}
                className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1.5"
              >
                <p className="text-xs leading-5 text-foreground">
                  {item.statement}
                </p>
                {item.note ? (
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {item.note}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </Block>
      ) : null}

      {journalistRead || risk ? (
        <Block title="How a journalist will read this">
          {journalistRead ? (
            <p className="text-xs leading-5 text-foreground">{journalistRead}</p>
          ) : null}
          {risk ? (
            <p className="mt-1 flex gap-1.5 text-xs leading-5 text-foreground">
              <Flame className="mt-0.5 h-3 w-3 shrink-0 text-amber-600 dark:text-amber-400" />
              <span>
                <span className="font-medium">Risk — </span>
                {risk}
              </span>
            </p>
          ) : null}
        </Block>
      ) : null}
    </div>
  );
}

function AngleProof({ angle }: { angle: StoryAngleRow }) {
  const ledger = buildEvidenceLedger(angle);
  const refs = readEvidenceRefs(angle.evidence_refs);
  const outstanding = [...ledger.missing];

  return (
    <div>
      <Block
        title="Evidence ledger"
        icon={<Target className="h-3 w-3 text-primary" />}
      >
        <div className="flex items-center gap-2">
          <EvidenceMeter have={ledger.have} total={ledger.total} size="md" />
          <span className="text-xs font-medium text-foreground">
            {ledger.total === 0
              ? "This angle needs no proof to stand up."
              : ledger.provable
                ? `All ${ledger.total} proofs in hand — a journalist can be sent this today.`
                : `${ledger.have} of ${ledger.total} proofs in hand.`}
          </span>
        </div>
        {!ledger.provable ? (
          <p className="mt-1 text-[11px] text-muted-foreground">
            {outstanding.length} thing{outstanding.length === 1 ? "" : "s"} left
            to gather
            {ledger.quickWins.length > 0
              ? `, ${ledger.quickWins.length} of them quick.`
              : "."}{" "}
            None of this is a failure — it is the to-do list that turns this
            angle into a pitch.
          </p>
        ) : null}
      </Block>

      {outstanding.length > 0 ? (
        <Block title={`Still to gather (${outstanding.length})`}>
          <ul className="space-y-1.5">
            {outstanding.map((item) => {
              const proof = ledger.required.find(
                (entry) => entry.key === item.key,
              );
              return (
                <li
                  key={item.key}
                  className="rounded border border-primary/40 bg-primary/5 px-2 py-1.5"
                >
                  <div className="flex items-start gap-1.5">
                    <span
                      aria-hidden
                      className="mt-1 h-3 w-3 shrink-0 rounded-sm border border-primary/60 bg-background"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium leading-5 text-foreground">
                        {item.need}
                      </p>
                      {item.how ? (
                        <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
                          {item.how}
                        </p>
                      ) : null}
                      {proof?.why ? (
                        <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
                          Needed because: {proof.why}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-0.5">
                      <Chip tone={EFFORT_TONE[item.effort]}>
                        {EFFORT_LABEL[item.effort]}
                      </Chip>
                      <span className="text-[11px] text-muted-foreground">
                        {item.owner ?? "Unassigned"}
                      </span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </Block>
      ) : null}

      <Block title={`Proof already in hand (${ledger.satisfied.length})`}>
        {ledger.satisfied.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">
            Nothing on the proof list is satisfied yet.
          </p>
        ) : (
          <ul className="space-y-1">
            {ledger.satisfied.map((item) => (
              <li key={item.key} className="flex items-start gap-1.5">
                <Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span className="min-w-0 text-xs leading-5 text-foreground">
                  {item.claim}
                  {item.kind ? (
                    <span className="text-muted-foreground"> · {item.kind}</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Block>

      <Block title={`Sources on file (${refs.length})`}>
        {refs.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">
            No evidence references recorded — the analysis should never produce
            an angle without at least one, so this row is worth questioning.
          </p>
        ) : (
          <ul className="space-y-0.5">
            {refs.map((ref, index) => (
              <li key={index} className="flex items-center gap-1.5">
                <Link2 className="h-3 w-3 shrink-0 text-muted-foreground" />
                {ref.url ? (
                  <a
                    href={ref.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-w-0 truncate text-xs text-primary hover:underline"
                    title={ref.url}
                  >
                    {ref.label}
                  </a>
                ) : (
                  <span
                    className="min-w-0 truncate text-xs text-foreground"
                    title="Held internally — no link recorded"
                  >
                    {ref.label}
                  </span>
                )}
                {ref.kind ? (
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {ref.kind}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Block>
    </div>
  );
}

function AnglePitches({
  requests,
  coverage,
  now,
  onFocusRequest,
  onFocusCoverage,
}: {
  requests: SourceRequestRow[];
  coverage: CoverageMentionRow[];
  now: number;
  onFocusRequest: (id: string) => void;
  onFocusCoverage: (id: string) => void;
}) {
  if (requests.length === 0 && coverage.length === 0) {
    return (
      <EmptyPanel
        icon={<Send className="h-5 w-5" />}
        title="Nothing has been pitched from this angle"
        hint="When a journalist query matches it, the match appears here with the draft response."
      />
    );
  }

  return (
    <div>
      <Block title={`Matched journalist queries (${requests.length})`}>
        {requests.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">
            No source request has matched this angle yet.
          </p>
        ) : (
          <ul className="space-y-1">
            {requests.map((request) => {
              const urgency = urgencyOf(request.deadline_at, now);
              return (
                <li key={request.id}>
                  <button
                    type="button"
                    onClick={() => onFocusRequest(request.id)}
                    className="flex w-full items-center gap-1.5 rounded px-1 py-1 text-left hover:bg-accent/50"
                  >
                    <Chip tone="muted">
                      {PLATFORM_LABEL[request.platform] ?? request.platform}
                    </Chip>
                    <span className="min-w-0 flex-1 truncate text-xs text-foreground">
                      {request.query_title}
                    </span>
                    <Chip tone={REQUEST_STATUS_TONE[request.status] ?? "muted"}>
                      {titleCase(request.status)}
                    </Chip>
                    <DeadlinePip urgency={urgency} showLabel={false} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Block>

      <Block title={`Coverage from this angle (${coverage.length})`}>
        {coverage.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">
            Nothing has landed from this angle yet.
          </p>
        ) : (
          <ul className="space-y-1">
            {coverage.map((mention) => (
              <li key={mention.id}>
                <button
                  type="button"
                  onClick={() => onFocusCoverage(mention.id)}
                  className="flex w-full items-center gap-1.5 rounded px-1 py-1 text-left hover:bg-accent/50"
                >
                  <Trophy className="h-3 w-3 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <span className="min-w-0 flex-1 truncate text-xs text-foreground">
                    {mention.title ?? mention.url}
                  </span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {mention.domain}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Block>
    </div>
  );
}

function AngleRecord({ angle }: { angle: StoryAngleRow }) {
  const ruling = readAnalysisNote(angle.human_ruling, "note");
  const rulingBy = readAnalysisNote(angle.human_ruling, "by");
  return (
    <div>
      <Block title="Identity">
        <KeyValue label="Angle key">
          <span className="break-all font-mono text-[11px]">
            {angle.angle_key}
          </span>
        </KeyValue>
        <KeyValue label="Row id">
          <span className="break-all font-mono text-[11px]">{angle.id}</span>
        </KeyValue>
        <KeyValue label="Site">
          <EntityRef
            token="web_site"
            id={angle.site_id}
            name="This site"
            openInNewTab
            className="text-xs"
          />
        </KeyValue>
        <KeyValue label="Analysis">
          {angle.analysis_version ?? "unversioned"}
        </KeyValue>
        <KeyValue label="Fingerprint">
          <span className="break-all font-mono text-[11px]">
            {angle.evidence_fingerprint ?? "—"}
          </span>
        </KeyValue>
        <KeyValue label="Version">{angle.version}</KeyValue>
      </Block>

      <Block title="Timeline">
        {(
          [
            ["Found", angle.analyzed_at],
            ["Reviewed", angle.human_reviewed_at],
            ["Accepted", angle.accepted_at],
            ["Pitched", angle.pitched_at],
            ["Landed", angle.landed_at],
            ["Dismissed", angle.dismissed_at],
            ["Expires", angle.expires_at],
            ["Updated", angle.updated_at],
          ] as [string, string | null][]
        ).map(([label, value]) => (
          <KeyValue key={label} label={label}>
            <span className="tabular-nums">
              {value ? formatDate(value) : "—"}
            </span>
          </KeyValue>
        ))}
      </Block>

      {ruling ? (
        <Block title="Your ruling" icon={<Quote className="h-3 w-3 text-muted-foreground" />}>
          <p className="text-xs leading-5 text-foreground">{ruling}</p>
          {rulingBy ? (
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              — {rulingBy}
            </p>
          ) : null}
        </Block>
      ) : null}
    </div>
  );
}

/* ── request detail ───────────────────────────────────────────────────────── */

export function RequestDetail({
  request,
  angle,
  now,
  onFocusAngle,
}: {
  request: SourceRequestRow;
  angle: StoryAngleRow | undefined;
  now: number;
  onFocusAngle: (id: string) => void;
}) {
  const urgency = urgencyOf(request.deadline_at, now);
  const requirements = readRequirements(request.requirements);
  const expired = urgency.bucket === "expired";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PanelHeader>
        <Chip tone="muted">
          {PLATFORM_LABEL[request.platform] ?? request.platform}
        </Chip>
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
          {request.outlet ?? "Outlet not stated"}
        </span>
        <Chip tone={REQUEST_STATUS_TONE[request.status] ?? "muted"}>
          {titleCase(request.status)}
        </Chip>
        <a
          href={requestHref(request.id)}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          title="Open this query in a new tab"
        >
          <ArrowUpRight className="h-3.5 w-3.5" />
        </a>
      </PanelHeader>

      <div
        className={cn(
          "flex shrink-0 items-center gap-2 border-b px-2.5 py-1.5",
          expired
            ? "border-destructive/30 bg-destructive/10"
            : urgency.bucket === "critical" || urgency.bucket === "today"
              ? "border-amber-500/30 bg-amber-500/10"
              : "border-border bg-muted/30",
        )}
      >
        <DeadlinePip urgency={urgency} />
        <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
          {request.deadline_at
            ? `Closes ${formatDate(request.deadline_at)}`
            : "No deadline given by the journalist"}
        </span>
        <span
          className={cn(
            "shrink-0 rounded border px-1.5 py-px text-[11px] font-medium tabular-nums",
            TONE_CHIP[request.match_score >= 70 ? "good" : "muted"],
          )}
        >
          Match {request.match_score}
        </span>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <Block title="What they asked for">
          <h2 className="text-sm font-semibold leading-5 text-foreground">
            {request.query_title}
          </h2>
          {request.query_body ? (
            <p className="mt-1 whitespace-pre-line text-xs leading-5 text-foreground">
              {request.query_body}
            </p>
          ) : null}
          {requirements.length > 0 ? (
            <ul className="mt-1.5 space-y-0.5">
              {requirements.map((requirement, index) => (
                <li
                  key={index}
                  className="flex items-start gap-1.5 text-xs leading-5 text-foreground"
                >
                  <span
                    aria-hidden
                    className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground"
                  />
                  {requirement}
                </li>
              ))}
            </ul>
          ) : null}
        </Block>

        <Block title="Who is asking">
          <KeyValue label="Journalist">
            {request.party_id && request.journalist_name ? (
              <EntityRef
                token="party"
                id={request.party_id}
                name={request.journalist_name}
                openInNewTab
                className="text-xs"
              />
            ) : request.journalist_name ? (
              <span
                className="text-muted-foreground"
                title="Not in the CRM yet — there is no crm.party record to open."
              >
                {request.journalist_name} · not in your CRM
              </span>
            ) : (
              <span className="text-muted-foreground">
                Anonymous on this platform
              </span>
            )}
          </KeyValue>
          <KeyValue label="Outlet">{request.outlet ?? "—"}</KeyValue>
          <KeyValue label="Beat">{request.beat ?? "—"}</KeyValue>
          <KeyValue label="Query">
            {request.external_url ? (
              <a
                href={request.external_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                Open on{" "}
                {PLATFORM_LABEL[request.platform] ?? request.platform}
                <ExternalLink className="h-3 w-3" />
              </a>
            ) : (
              <span className="text-muted-foreground">
                No link recorded for this query
              </span>
            )}
          </KeyValue>
          <KeyValue label="Media lists">
            <a
              href={MEDIA_LISTS_HREF}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              Outreach lists
              <ExternalLink className="h-3 w-3" />
            </a>
          </KeyValue>
        </Block>

        <Block title="Why this was matched">
          <p className="text-xs leading-5 text-foreground">
            {request.match_reason ?? "No match reason was recorded."}
          </p>
          <div className="mt-1.5">
            <KeyValue label="From angle">
              {angle ? (
                <button
                  type="button"
                  onClick={() => onFocusAngle(angle.id)}
                  className="text-left text-xs text-primary hover:underline"
                >
                  {angle.headline}
                </button>
              ) : request.story_angle_id ? (
                <span
                  className="text-muted-foreground"
                  title={request.story_angle_id}
                >
                  Angle {request.story_angle_id.slice(0, 8)}… is not in the
                  loaded set
                </span>
              ) : (
                <span className="text-muted-foreground">
                  Not tied to an angle — this one was matched on the business
                  profile alone.
                </span>
              )}
            </KeyValue>
          </div>
        </Block>

        <Block
          title="Drafted response"
          action={
            request.draft_response ? (
              <CopyButton text={request.draft_response} what="Draft response" />
            ) : null
          }
        >
          {request.draft_response ? (
            <>
              <p className="mb-1 text-[11px] text-muted-foreground">
                Drafted{" "}
                {request.draft_generated_at
                  ? formatDate(request.draft_generated_at)
                  : "at an unrecorded time"}
                . Read it before it goes anywhere — your name is on it.
              </p>
              <pre className="scrollbar-thin whitespace-pre-wrap rounded border border-border bg-muted/40 p-2 text-xs leading-5 text-foreground">
                {request.draft_response}
              </pre>
            </>
          ) : (
            <EmptyPanel
              title="No draft yet"
              hint={
                expired
                  ? "This query closed before a draft was written."
                  : "A draft is written once the query is matched to an angle."
              }
            />
          )}
        </Block>

        <Block title="Record">
          <KeyValue label="Row id">
            <span className="break-all font-mono text-[11px]">{request.id}</span>
          </KeyValue>
          <KeyValue label="External id">
            <span className="break-all font-mono text-[11px]">
              {request.external_id ?? "—"}
            </span>
          </KeyValue>
          <KeyValue label="Submitted">
            {request.submitted_at ? formatDate(request.submitted_at) : "—"}
          </KeyValue>
          <KeyValue label="Won">
            {request.won_at ? formatDate(request.won_at) : "—"}
          </KeyValue>
        </Block>
      </ScrollArea>
    </div>
  );
}

/* ── coverage detail ──────────────────────────────────────────────────────── */

export function CoverageDetail({
  mention,
  angle,
  onFocusAngle,
}: {
  mention: CoverageMentionRow;
  angle: StoryAngleRow | undefined;
  onFocusAngle: (id: string) => void;
}) {
  const angleId = coverageAngleId(mention);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PanelHeader>
        <Trophy className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
          {mention.domain}
        </span>
        {mention.is_competitor ? <Chip tone="warn">Competitor</Chip> : null}
        <a
          href={mention.url}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          title="Open the article in a new tab"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </PanelHeader>

      <ScrollArea className="min-h-0 flex-1">
        <Block title="The piece">
          <h2 className="text-sm font-semibold leading-5 text-foreground">
            {mention.title ?? mention.url}
          </h2>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {formatDateOnly(mention.published_at)} · {titleCase(mention.medium)}{" "}
            · discovered {formatDateOnly(mention.discovered_at)}
          </p>
          {mention.key_quote ? (
            <blockquote className="mt-1.5 border-l-2 border-primary/50 pl-2 text-xs italic leading-5 text-foreground">
              {mention.key_quote}
            </blockquote>
          ) : null}
        </Block>

        <Block title="How good a hit was it">
          <KeyValue label="Hit score">
            <span className="tabular-nums">{mention.hit_score ?? "—"}</span>
            {mention.hit_reason ? (
              <span className="text-muted-foreground"> — {mention.hit_reason}</span>
            ) : null}
          </KeyValue>
          <KeyValue label="Prominence">
            {mention.prominence
              ? `${titleCase(mention.prominence)}${
                  mention.prominence_score !== null
                    ? ` (${mention.prominence_score})`
                    : ""
                }`
              : "Not assessed"}
          </KeyValue>
          <KeyValue label="Sentiment">
            {mention.sentiment
              ? `${titleCase(mention.sentiment)}${
                  mention.sentiment_score !== null
                    ? ` (${mention.sentiment_score.toFixed(2)})`
                    : ""
                }`
              : "Not assessed"}
          </KeyValue>
          <KeyValue label="Links to you" align="center">
            <span className="inline-flex items-center gap-1.5">
              <span
                aria-hidden
                className={cn(
                  "h-2 w-2 rounded-full",
                  mention.links_to_site
                    ? "bg-emerald-500"
                    : "bg-muted-foreground/40",
                )}
              />
              {mention.links_to_site ? "Yes" : "No link"}
            </span>
          </KeyValue>
          {mention.link_urls.length > 0 ? (
            <KeyValue label="Linked pages">
              <ul className="space-y-0.5">
                {mention.link_urls.map((url) => (
                  <li key={url}>
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="break-all text-primary hover:underline"
                    >
                      {url}
                    </a>
                  </li>
                ))}
              </ul>
            </KeyValue>
          ) : null}
        </Block>

        <Block title="Attribution">
          <KeyValue label="Author">
            {mention.author_party_id && mention.author_name ? (
              <EntityRef
                token="party"
                id={mention.author_party_id}
                name={mention.author_name}
                openInNewTab
                className="text-xs"
              />
            ) : mention.author_name ? (
              <span
                className="text-muted-foreground"
                title="No crm.party record for this author yet."
              >
                {mention.author_name} · not in your CRM
              </span>
            ) : (
              <span className="text-muted-foreground">No byline recorded</span>
            )}
          </KeyValue>
          <KeyValue label="From angle">
            {angle ? (
              <button
                type="button"
                onClick={() => onFocusAngle(angle.id)}
                className="text-left text-xs text-primary hover:underline"
              >
                {angle.headline}
              </button>
            ) : angleId ? (
              <span className="text-muted-foreground" title={angleId}>
                Angle {angleId.slice(0, 8)}… is not in the loaded set
              </span>
            ) : (
              <span className="text-muted-foreground">
                Not attributed. `coverage_mention` has no foreign key to
                `story_angle`; this console reads
                <span className="font-mono text-[11px]">
                  {" "}
                  metadata.story_angle_id
                </span>
                , and this row carries none.
              </span>
            )}
          </KeyValue>
          <KeyValue label="URL">
            <a
              href={mention.url}
              target="_blank"
              rel="noopener noreferrer"
              className="break-all text-primary hover:underline"
            >
              {mention.url}
            </a>
          </KeyValue>
        </Block>
      </ScrollArea>
    </div>
  );
}
