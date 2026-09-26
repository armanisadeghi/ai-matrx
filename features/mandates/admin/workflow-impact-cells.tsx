"use client";

/**
 * The admin list's WORKFLOW impact cells (workflow parity, round 2) — the
 * twin of ./impact-cells.tsx for rungs a workflow holds. Every sentence is the
 * server's (`POST /mandates/impact/workflows`, via ./workflow-impact); these
 * components only lay it out.
 */

import { ArrowRight, CircleHelp, AppWindow } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { useOpenMandateWindow } from "@/features/overlays/openers/mandateWindow";
import { GRADE_META } from "./impact";
import {
  BREAK_WAY_LABEL,
  WORKFLOW_BLOCKER_META,
  isWorkflowDrift,
  leadWorkflowVerdict,
  workflowNewestLabel,
  workflowPinLabel,
  type WorkflowBreakWay,
  type WorkflowImpactVerdict,
} from "./workflow-impact";

const RUNG_WORDS: Record<WorkflowImpactVerdict["principal_kind"], string> = {
  system: "mandate default",
  org: "organization binding",
  user: "personal binding",
};

const DOT: Record<string, string> = {
  red: "bg-rose-500",
  orange: "bg-amber-500",
  green: "bg-emerald-500",
  identical: "bg-muted-foreground/40",
};

export function WorkflowVerdictDetail({ verdict }: { verdict: WorkflowImpactVerdict }) {
  const ways = (Object.keys(BREAK_WAY_LABEL) as WorkflowBreakWay[]).map((way) => ({
    way,
    grade: verdict.breaks[way] ?? "identical",
  }));
  return (
    <div className="space-y-1.5 text-xs">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="outline" className={GRADE_META[verdict.grade].toneClassName}>
          {GRADE_META[verdict.grade].label}
        </Badge>
        <EntityRef
          token="workflow"
          id={verdict.workflow_id}
          name={verdict.workflow_name}
          showIcon={false}
        />
        <span className="text-[11px] text-muted-foreground">
          {RUNG_WORDS[verdict.principal_kind]}
        </span>
        <span className="inline-flex items-center gap-1 tabular-nums">
          {workflowPinLabel(verdict)}
          <ArrowRight className="h-3 w-3 text-muted-foreground" />
          {workflowNewestLabel(verdict)}
        </span>
      </div>
      <div className="flex flex-wrap gap-1">
        {ways.map(({ way, grade }) => (
          <span
            key={way}
            className="inline-flex items-center gap-1 rounded border border-border px-1 text-[10px]"
            title={`${BREAK_WAY_LABEL[way]}: ${GRADE_META[grade].label}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${DOT[grade]}`} />
            {BREAK_WAY_LABEL[way]}
          </span>
        ))}
      </div>
      {verdict.findings.length > 0 ? (
        <ul className="space-y-0.5">
          {verdict.findings.map((finding, index) => (
            <li
              key={`${finding.rule_id}-${index}`}
              className="flex items-start gap-1.5 leading-snug"
            >
              <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${DOT[finding.grade]}`} />
              <span>{finding.message}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground">
          No change between these versions affects this job.
        </p>
      )}
      {verdict.blocker === "set_aside" && verdict.set_aside_reason ? (
        <p className="text-muted-foreground">Set aside: {verdict.set_aside_reason}</p>
      ) : null}
      {verdict.behind_latest ? (
        <p className="text-muted-foreground">
          To move this pin, open the mandate and pick the newer version in the Mandate
          Holder tab.
        </p>
      ) : null}
    </div>
  );
}

export function WorkflowImpactGradeCell({
  mandateKey,
  verdicts,
}: {
  mandateKey: string;
  verdicts: WorkflowImpactVerdict[];
}) {
  const lead = leadWorkflowVerdict(verdicts);
  if (!lead) return null;
  return (
    <HoverCard openDelay={150} closeDelay={80}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          onClick={(event) => event.stopPropagation()}
          aria-label={`What changed in the workflow for ${mandateKey}`}
          className="inline-flex flex-wrap items-center gap-1 rounded text-left focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <Badge variant="outline" className={GRADE_META[lead.grade].toneClassName}>
            {GRADE_META[lead.grade].label}
          </Badge>
          <span className="text-[10px] text-muted-foreground">
            workflow{verdicts.length > 1 ? ` ×${verdicts.length}` : ""}
          </span>
        </button>
      </HoverCardTrigger>
      <HoverCardContent align="start" className="w-[min(28rem,96vw)] space-y-2 p-3">
        <div className="text-xs font-medium">What changed in the workflow</div>
        {verdicts.map((verdict, index) => (
          <div
            key={`${verdict.holder_kind}:${verdict.row_id}`}
            className={index > 0 ? "border-t border-border pt-2" : undefined}
          >
            <WorkflowVerdictDetail verdict={verdict} />
          </div>
        ))}
      </HoverCardContent>
    </HoverCard>
  );
}

export function WorkflowImpactBlockerCell({
  verdicts,
}: {
  verdicts: WorkflowImpactVerdict[];
}) {
  const openMandateWindow = useOpenMandateWindow();
  const lead = leadWorkflowVerdict(verdicts);
  if (!lead) return null;
  const meta = lead.blocker ? WORKFLOW_BLOCKER_META[lead.blocker] : null;
  return (
    <div
      className="flex flex-wrap items-center gap-1"
      onClick={(event) => event.stopPropagation()}
    >
      <Badge
        variant="outline"
        className="border-border text-muted-foreground"
        title={
          meta
            ? `${meta.meaning} ${meta.remedy}`
            : lead.behind_latest
              ? "A newer published version exists. Move the pin in the mandate's Mandate Holder tab."
              : "This pin is on the newest published version."
        }
      >
        {meta ? meta.label : lead.behind_latest ? "Behind" : "None"}
      </Badge>
      {lead.behind_latest || lead.blocker === "unreachable" || lead.blocker === "set_aside" ? (
        <Button
          size="sm"
          variant="ghost"
          className="h-6 gap-1 px-1.5 text-[11px]"
          onClick={() =>
            openMandateWindow({
              initialMandateKey: lead.mandate_key,
              mandateKeys: [lead.mandate_key],
              initialView: "admin",
              surfaceName: "administration-mandates",
            })
          }
        >
          <AppWindow className="h-3 w-3" />
          Open
        </Button>
      ) : null}
    </div>
  );
}

/** The Health cell's workflow drift badge — absent when nothing has drifted. */
export function WorkflowDriftBadge({ verdicts }: { verdicts: WorkflowImpactVerdict[] }) {
  const drifted = verdicts.filter(isWorkflowDrift);
  if (drifted.length === 0) return null;
  const sentences = drifted.flatMap((verdict) =>
    verdict.findings
      .filter((finding) => finding.grade === "red" || finding.grade === "orange")
      .map((finding) => `${verdict.workflow_name}: ${finding.message}`),
  );
  return (
    <Badge
      variant="outline"
      className="gap-1 border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-400"
      title={sentences.join("\n")}
    >
      <CircleHelp className="h-3 w-3" />
      workflow drift
    </Badge>
  );
}
