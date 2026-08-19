"use client";

/**
 * MasterworkCheckupFindingBlock — the ONE renderer for the
 * `masterwork_checkup_finding` kind.
 *
 * ## The order is the spec
 *
 * Arman, 2026-08-18: *"The order needs to be: You said this → They created this
 * → Here is what is missing or wrong → Here is the version recommended. Notice
 * how that actually flows."* The four steps below are that sentence, numbered
 * and labelled in his voice, and nothing else competes with them. An `add`
 * says, in step 2, that nothing was created — because the honest answer to
 * "they created this" is sometimes "they didn't".
 *
 * ## The four verbs, from the ONE primitive
 *
 * Approve · Improve · Reject · Edit come from
 * `features/masterwork/review/RuleDecisionActions` — the same component the
 * rule-review queue and the Improve dialog use. Arman's standing law, restated
 * the same day: *"whenever a change is made or an enhancement is made, that
 * enhancement or change needs to be made every single place that that code or
 * logic exists."* This block is one of those places; it does not declare its
 * own buttons and it does not own a second improve path.
 *
 * ## How it acts without knowing where it is
 *
 * Same two surface seams `EpisodeTitleOptionsBlock` proved:
 *
 *   READ  `useCurrentSurfaceUiState("masterwork_checkup_decisions")` — the
 *         decision the Expert has already made on this finding, and whether
 *         the mounted page is offering the verbs at all. Absent (a chat
 *         transcript, a share page) ⇒ the four steps render read-only, which
 *         is exactly right: the finding is still worth reading.
 *   WRITE `runAction("apply_surface_write", { target: "checkup_decision" })` —
 *         the Final Checkup's own handler decides what each verb MEANS.
 *
 * The block never receives a callback, never reaches the panel's state, and
 * therefore reads identically live, on reload, and months later in a
 * transcript.
 */

import { useCallback, useState } from "react";
import Link from "next/link";
import {
  CircleSlash,
  FileText,
  Loader2,
  MessageSquare,
  Quote,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { useKindActionRunner } from "@/features/content-ir/react/actions/useKindActionRunner";
import { useCurrentSurfaceUiState } from "@/features/surfaces/runtime/surface-ui-state";
import {
  CHECKUP_DECISION_UI_STATE_KEY,
  CHECKUP_DECISION_WRITE_TARGET,
  type CheckupChange,
  type CheckupFindingData,
  type CheckupRuleData,
} from "@/features/content-ir/kinds/masterwork-checkup-finding";
import {
  RuleDecisionActions,
  type RuleDecisionVerb,
} from "@/features/masterwork/review/RuleDecisionActions";

export interface MasterworkCheckupFindingBlockProps {
  serverData?: unknown;
}

/**
 * What the Final Checkup publishes so these cards become interactive.
 * Publishing nothing leaves every card read-only — never a dead button.
 */
export interface CheckupDecisionsUiState {
  /** findingId → the verb the Expert already landed on. */
  decided?: Record<string, "approved" | "rejected">;
  /**
   * findingId → the wording the EXPERT now owns, after Improve rewrote it or
   * Edit changed it by hand. Step 4 shows this instead of ours, because the
   * thing a person is about to approve must be the thing they will get — a
   * card still showing our original after they asked for a rewrite is a lie
   * about what Apply will write.
   */
  yourVersion?: Record<string, CheckupRuleData>;
  /** The finding currently being worked (an agent rewrite, a save). */
  busyFindingId?: string | null;
}

/** The value `apply_surface_write` carries for the `checkup_decision` target. */
export interface CheckupDecisionWriteValue {
  finding_id: string;
  verb: RuleDecisionVerb;
  /** Which alternative wording the Expert picked, for the `edit` verb. */
  alternative_index?: number;
}

const CHANGE_LABEL: Record<CheckupChange, string> = {
  add: "Add this rule",
  modify: "Change this rule",
  retire: "Retire this rule",
};

const SEVERITY_LABEL: Record<CheckupRuleData["severity"], string> = {
  critical: "Critical",
  major: "Major",
  minor: "Minor",
};

function Step({
  n,
  label,
  children,
}: {
  n: number;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-1">
      <h4 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground">
          {n}
        </span>
        {label}
      </h4>
      {children}
    </section>
  );
}

function RuleCard({
  rule,
  tone,
}: {
  rule: CheckupRuleData;
  tone: "current" | "recommended";
}) {
  const emphasised = tone === "recommended";
  return (
    <div
      className={
        emphasised
          ? "rounded-md border border-primary/40 bg-primary/5 p-2.5"
          : "rounded-md border border-border bg-muted/30 p-2.5"
      }
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-sm font-semibold text-foreground">{rule.name}</span>
        <Badge variant="outline" className="px-1 py-0 text-[10px]">
          {SEVERITY_LABEL[rule.severity]}
        </Badge>
      </div>
      <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
        {rule.statement}
      </p>
      {rule.rationale ? (
        <p className="mt-1.5 text-xs text-muted-foreground">
          <span className="font-medium">Why it matters: </span>
          {rule.rationale}
        </p>
      ) : null}
      {rule.detection ? (
        <p className="mt-0.5 text-xs text-muted-foreground">
          <span className="font-medium">How to spot it: </span>
          {rule.detection}
        </p>
      ) : null}
      {/*
        THE ANTI-MISLEADING LAW, at the moment of decision. A rule that refines,
        depends on, overrides or pulls against another one must never be
        approved as if it stood alone — so the connection is shown HERE, before
        the Expert presses Approve, not only after it lands in the Rulebook.
      */}
      {rule.connectsTo?.length ? (
        <div className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
          <span className="font-medium">
            How this connects to your other rules
          </span>
          {rule.connectsTo.map((link) => (
            <p key={`${link.ruleId}-${link.kind}`}>
              {link.relation}{" "}
              <span className="font-medium text-foreground">
                {link.ruleName ?? link.ruleId}
              </span>
              {link.note ? ` — ${link.note}` : ""}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function readData(serverData: unknown): CheckupFindingData | null {
  if (typeof serverData !== "object" || serverData === null) return null;
  const candidate = serverData as Partial<CheckupFindingData>;
  if (typeof candidate.findingId !== "string" || !candidate.findingId) return null;
  if (typeof candidate.youSaid !== "string") return null;
  return candidate as CheckupFindingData;
}

export function MasterworkCheckupFindingBlock({
  serverData,
}: MasterworkCheckupFindingBlockProps) {
  const finding = readData(serverData);
  const ui = useCurrentSurfaceUiState<CheckupDecisionsUiState>(
    CHECKUP_DECISION_UI_STATE_KEY,
  );
  const runAction = useKindActionRunner();
  const [sending, setSending] = useState<RuleDecisionVerb | null>(null);

  const decide = useCallback(
    async (verb: RuleDecisionVerb, alternativeIndex?: number) => {
      if (!finding || sending) return;
      setSending(verb);
      // The runner owns error handling (toast + capture) and never throws.
      await runAction("apply_surface_write", {
        target: CHECKUP_DECISION_WRITE_TARGET,
        value: {
          finding_id: finding.findingId,
          verb,
          ...(alternativeIndex === undefined
            ? {}
            : { alternative_index: alternativeIndex }),
        } satisfies CheckupDecisionWriteValue,
        // A real click by the viewer — the click IS the consent.
        origin: "user",
      });
      setSending(null);
    },
    [finding, runAction, sending],
  );

  if (!finding) return null;

  const decided = ui?.decided?.[finding.findingId];
  // The Expert's own wording wins over ours the moment it exists.
  const yourVersion = ui?.yourVersion?.[finding.findingId] ?? null;
  const shown = yourVersion ?? finding.recommendedRule;
  const interactive = Boolean(ui);
  const busy = sending !== null || ui?.busyFindingId === finding.findingId;

  const where = finding.saidWhere;
  const conversationHref = where?.conversationId
    ? `/chat/${where.conversationId}`
    : null;
  const fileHref = where?.fileId ? `/files/f/${where.fileId}` : null;

  return (
    <article
      className={`space-y-3 rounded-lg border bg-card p-3 ${
        decided ? "border-border opacity-60" : "border-border"
      }`}
    >
      <header className="flex flex-wrap items-center gap-2">
        <Badge
          variant="outline"
          className={
            finding.change === "retire"
              ? "border-destructive/50 px-1.5 py-0 text-[10px] text-destructive"
              : "border-primary/40 px-1.5 py-0 text-[10px] text-primary"
          }
        >
          {CHANGE_LABEL[finding.change]}
        </Badge>
        {finding.belongsIn ? (
          <span className="text-[11px] text-muted-foreground">
            in {finding.belongsIn}
          </span>
        ) : null}
        {finding.confidence > 0 && finding.confidence < 0.55 ? (
          <Badge
            variant="outline"
            className="border-amber-500/50 px-1 py-0 text-[10px] text-amber-600 dark:text-amber-500"
          >
            We're not sure — check this one
          </Badge>
        ) : null}
        {decided ? (
          <span className="ml-auto text-[11px] font-medium text-muted-foreground">
            {decided === "approved" ? "Approved" : "Set aside"}
          </span>
        ) : null}
      </header>

      <Step n={1} label="You said this">
        <blockquote className="border-l-2 border-primary/40 pl-2 text-sm italic text-foreground">
          &ldquo;{finding.youSaid}&rdquo;
        </blockquote>
        {conversationHref || fileHref ? (
          <div className="flex flex-wrap items-center gap-3 pt-0.5 text-xs">
            {conversationHref ? (
              <Link
                href={conversationHref}
                target="_blank"
                className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
              >
                <MessageSquare className="h-3 w-3" />
                See where you said it
              </Link>
            ) : null}
            {fileHref ? (
              <Link
                href={fileHref}
                target="_blank"
                className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
              >
                <FileText className="h-3 w-3" />
                Open the source
              </Link>
            ) : null}
          </div>
        ) : null}
      </Step>

      <Step n={2} label="They created this">
        {finding.currentRule ? (
          <RuleCard rule={finding.currentRule} tone="current" />
        ) : (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <CircleSlash className="h-3.5 w-3.5" />
            Nothing was created for this.
          </p>
        )}
      </Step>

      <Step n={3} label="What&rsquo;s missing or wrong">
        <p className="whitespace-pre-wrap text-sm text-foreground">{finding.gap}</p>
      </Step>

      {shown ? (
        <Step n={4} label={yourVersion ? "Your version" : "The recommended version"}>
          <RuleCard rule={shown} tone="recommended" />
          {yourVersion ? (
            <p className="pt-0.5 text-[11px] text-muted-foreground">
              This is what Apply will write — your wording, not ours.
            </p>
          ) : null}
          {finding.alternatives.length > 0 ? (
            <div className="space-y-1 pt-1">
              <p className="text-[11px] text-muted-foreground">
                Other wordings we saw — pick one to edit it instead:
              </p>
              {finding.alternatives.map((alternative, index) => (
                <button
                  key={`${alternative.name}-${index}`}
                  type="button"
                  disabled={!interactive || busy}
                  onClick={() => void decide("edit", index)}
                  className="w-full rounded-md border border-border bg-card px-2 py-1 text-left text-xs text-muted-foreground transition-colors hover:text-foreground disabled:cursor-default disabled:hover:text-muted-foreground"
                >
                  {alternative.statement}
                </button>
              ))}
            </div>
          ) : null}
        </Step>
      ) : (
        <Step n={4} label="The recommended version">
          <p className="text-sm text-foreground">
            Retire the rule. It stays in your Rulebook for history — audits that
            cited it still work — but it stops being enforced.
          </p>
        </Step>
      )}

      {interactive ? (
        <footer className="flex items-center gap-2 border-t border-border pt-2">
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          ) : null}
          <RuleDecisionActions
            size="sm"
            disabled={busy}
            labels={
              decided
                ? { approve: "Approve again", reject: "Set aside again" }
                : finding.change === "retire"
                  ? { approve: "Yes, retire it", reject: "No, keep it" }
                  : undefined
            }
            onApprove={() => void decide("approve")}
            onImprove={() => void decide("improve")}
            onReject={() => void decide("reject")}
            onEdit={() => void decide("edit")}
          />
        </footer>
      ) : (
        <footer className="flex items-center gap-1.5 border-t border-border pt-2 text-[11px] text-muted-foreground">
          <Quote className="h-3 w-3" />
          Found by your Final Checkup
          {finding.foundBy ? ` · ${finding.foundBy.replace(/_/g, " ")}` : ""}
        </footer>
      )}
    </article>
  );
}

export default MasterworkCheckupFindingBlock;
