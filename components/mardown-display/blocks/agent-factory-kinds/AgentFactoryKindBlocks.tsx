"use client";

/**
 * The five Agent Factory step kinds — one component each (R8 of the Agent
 * Factory pipeline REGISTER: the kinds stay inactive until these exist).
 *
 *   agent_factory_contract       inputs · output choice · one-agent-or-workflow fit
 *   agent_factory_tool_choice    model profile class · the tools with reasons
 *   agent_factory_instructions   the system message · the user message template
 *   agent_factory_proof_review   gates · blind A/B verdict per case and criterion
 *   agent_factory_build          the whole build: outcome + every step answer
 *
 * Python-owned models: aidream/aidream/kinds/agent_factory.py. Each `*View`
 * renders a value; each `*Block` is the same view reached by the dispatch from
 * that kind's bundled `kind_component` row (key = slug). The build view nests
 * the step views directly — one component per shape, never a second renderer.
 *
 * Defensive readers: a half-arrived value is normal, so every field is optional.
 */

import React from "react";
import {
  ArrowRight,
  Check,
  CircleSlash,
  Equal,
  Undo2,
  Wrench,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import KindInstanceRender from "@/features/content-ir/studio/components/KindInstanceRender";
import {
  ChipRow,
  RawRegion,
  StateChip,
  StillArriving,
  isRecord,
  readBool,
  readKindValue,
  readNumber,
  readText,
  type ChipTone,
  type ResultKindBlockProps,
} from "@/components/mardown-display/blocks/result-kinds/result-kind-shared";
import { RichContent } from "@ai-matrx/rich-content/levels/RichContent";

type ViewProps = { value: unknown; className?: string };

const SECTION = "flex min-w-0 flex-col gap-1.5";
const HEADING = "text-[11px] font-medium uppercase tracking-wide text-muted-foreground";

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

const Section: React.FC<{ title: string; children: React.ReactNode; className?: string }> = ({
  title,
  children,
  className,
}) => (
  <div className={cn(SECTION, className)}>
    <div className={HEADING}>{title}</div>
    {children}
  </div>
);

const Missing: React.FC<{ label?: string }> = ({ label = "—" }) => (
  <span className="text-xs text-muted-foreground">{label}</span>
);

/** Long text — a model message, an output — scrollable, never truncated. */
export const LongText: React.FC<{ text: string | null; className?: string; maxHeight?: string }> = ({
  text,
  className,
  maxHeight = "max-h-80",
}) =>
  text ? (
    <div
      className={cn(
        "overflow-auto break-words rounded-md border border-border bg-muted/30 p-2.5 text-xs leading-relaxed text-foreground",
        maxHeight,
        className,
      )}
    >
      <RichContent source={text} level="standard" />
    </div>
  ) : (
    <Missing />
  );

/* ------------------------------------------------------------- contract */

const FIT_TONE: Record<string, ChipTone> = { one_agent: "good", workflow: "warn" };

export const AgentFactoryContractView: React.FC<ViewProps> = ({ value, className }) => {
  if (!isRecord(value)) return <Missing />;
  const inputs = records(value.inputs);
  const output = isRecord(value.output) ? value.output : {};
  const fit = isRecord(value.fit) ? value.fit : {};
  const verdict = readText(fit.verdict);
  const proposal = isRecord(output.proposal) ? output.proposal : null;
  const accepts = readBool(value.accepts_user_input);
  return (
    <div className={cn("flex min-w-0 flex-col gap-3", className)}>
      <ChipRow>
        {verdict ? (
          <StateChip
            label={verdict === "one_agent" ? "One agent" : "Workflow-sized"}
            tone={FIT_TONE[verdict] ?? "neutral"}
          />
        ) : null}
        <StateChip
          label={readText(output.kind) ?? (proposal ? "New kind proposed" : "No output kind")}
          tone={output.choice === "active_kind" ? "accent" : "warn"}
        />
        {accepts !== null ? (
          <StateChip label={accepts ? "Takes typed text" : "Inputs only"} />
        ) : null}
      </ChipRow>
      {readText(fit.reason) ? (
        <p className="text-xs text-muted-foreground">{readText(fit.reason)}</p>
      ) : null}
      <Section title={`Inputs (${inputs.length})`}>
        {inputs.length === 0 ? (
          <Missing label="None" />
        ) : (
          <div className="divide-y divide-border rounded-md border border-border">
            {inputs.map((input, i) => (
              <div key={readText(input.name) ?? i} className="flex min-w-0 flex-col gap-0.5 px-2.5 py-1.5">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-medium text-foreground">
                    {readText(input.name) ?? "(unnamed)"}
                  </span>
                  <span className="text-xs text-muted-foreground">{readText(input.kind) ?? "—"}</span>
                  <StateChip
                    label={input.required === true ? "Required" : `Optional · ${readText(input.when_absent) ?? "skip"}`}
                    tone={input.required === true ? "accent" : "neutral"}
                  />
                </div>
                {readText(input.description) ? (
                  <span className="text-xs text-muted-foreground">{readText(input.description)}</span>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Section>
      {readText(output.reason) ? (
        <Section title="Output">
          <span className="text-xs text-foreground">{readText(output.reason)}</span>
        </Section>
      ) : null}
      {proposal ? (
        <Section title="Proposed kind">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-mono font-medium">{readText(proposal.slug) ?? "—"}</span>
            <span className="text-muted-foreground">{readText(proposal.purpose)}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {records(proposal.fields).map((f, i) => (
              <StateChip key={i} label={`${readText(f.name) ?? "?"}: ${readText(f.type) ?? "?"}`} />
            ))}
          </div>
        </Section>
      ) : null}
      {verdict === "workflow" && strings(fit.proposed_steps).length > 0 ? (
        <Section title="Proposed steps">
          <ol className="list-decimal space-y-0.5 pl-5 text-xs">
            {strings(fit.proposed_steps).map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </Section>
      ) : null}
    </div>
  );
};

/* ---------------------------------------------------------- tool choice */

const TIER_TONE: Record<string, ChipTone> = { fast: "neutral", standard: "accent", deep: "warn" };

export const AgentFactoryToolChoiceView: React.FC<ViewProps> = ({ value, className }) => {
  if (!isRecord(value)) return <Missing />;
  const tools = records(value.tools);
  const profile = isRecord(value.profile) ? value.profile : {};
  const tier = readText(profile.tier);
  const modalities = strings(profile.input_modalities);
  return (
    <div className={cn("flex min-w-0 flex-col gap-3", className)}>
      <ChipRow>
        {tier ? <StateChip label={`${tier[0]?.toUpperCase()}${tier.slice(1)} tier`} tone={TIER_TONE[tier] ?? "neutral"} /> : null}
        {profile.needs_tools === true ? <StateChip label="Tools" icon={<Wrench className="size-3" />} /> : null}
        {profile.needs_structured_output === true ? <StateChip label="Structured output" /> : null}
        {profile.needs_long_context === true ? <StateChip label="Long context" /> : null}
        {modalities.filter((m) => m !== "text").map((m) => (
          <StateChip key={m} label={m} />
        ))}
      </ChipRow>
      {readText(profile.reason) ? (
        <p className="text-xs text-muted-foreground">{readText(profile.reason)}</p>
      ) : null}
      <Section title={`Tools (${tools.length})`}>
        {tools.length === 0 ? (
          <span className="text-xs text-muted-foreground">
            {readText(value.no_tools_reason) ?? "None"}
          </span>
        ) : (
          <div className="divide-y divide-border rounded-md border border-border">
            {tools.map((t, i) => (
              <div key={readText(t.name) ?? i} className="flex min-w-0 flex-wrap items-baseline gap-x-2 px-2.5 py-1.5">
                <span className="font-mono text-xs font-medium">{readText(t.name) ?? "(unnamed)"}</span>
                <span className="text-xs text-muted-foreground">{readText(t.reason)}</span>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
};

/* --------------------------------------------------------- instructions */

/** A template with each {{variable}} marked, so placement reads at a glance. */
const Template: React.FC<{ text: string | null }> = ({ text }) => {
  if (!text) return <Missing />;
  const parts = text.split(/(\{\{\s*[a-zA-Z0-9_]+\s*\}\})/g);
  return (
    <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-muted/30 p-2.5 font-mono text-xs leading-relaxed">
      {parts.map((p, i) =>
        /^\{\{/.test(p) ? (
          <span key={i} className="rounded bg-primary/10 px-0.5 text-primary-ink">
            {p}
          </span>
        ) : (
          <React.Fragment key={i}>{p}</React.Fragment>
        ),
      )}
    </pre>
  );
};

export const AgentFactoryInstructionsView: React.FC<ViewProps> = ({ value, className }) => {
  if (!isRecord(value)) return <Missing />;
  const placed = strings(value.placed_variables);
  return (
    <div className={cn("flex min-w-0 flex-col gap-3", className)}>
      <Section title="System message">
        <LongText text={readText(value.system_message)} />
      </Section>
      <Section title="User message">
        <Template text={readText(value.user_message)} />
      </Section>
      <Section title={`Placed variables (${placed.length})`}>
        {placed.length === 0 ? (
          <Missing label="None" />
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {placed.map((v) => (
              <StateChip key={v} label={v} tone="accent" />
            ))}
          </div>
        )}
      </Section>
    </div>
  );
};

/* --------------------------------------------------------- proof review */

const VERDICT_TONE: Record<string, ChipTone> = { pass: "good", send_back: "warn", fail: "bad" };
const VERDICT_LABEL: Record<string, string> = { pass: "Pass", send_back: "Send back", fail: "Fail" };

export function verdictChip(verdict: string | null) {
  if (!verdict) return null;
  return <StateChip label={VERDICT_LABEL[verdict] ?? verdict} tone={VERDICT_TONE[verdict] ?? "neutral"} />;
}

/** Who a blind preference names. `labels` un-blinds A/B when the caller knows. */
export function preferenceLabel(
  preferred: string | null,
  labels?: { a: string; b: string },
): { label: string; tone: ChipTone; icon: React.ReactNode } {
  switch (preferred) {
    case "a":
      return { label: labels?.a ?? "A", tone: labels?.a === "Candidate" ? "good" : "accent", icon: null };
    case "b":
      return { label: labels?.b ?? "B", tone: labels?.b === "Candidate" ? "good" : "accent", icon: null };
    case "tie":
      return { label: "Tie", tone: "neutral", icon: <Equal className="size-3" /> };
    case "both_fail":
      return { label: "Both fail", tone: "bad", icon: <CircleSlash className="size-3" /> };
    default:
      return { label: preferred ?? "—", tone: "neutral", icon: null };
  }
}

/** One case's per-criterion verdict rows. Shared by the kind view and the build page. */
export const CriterionVerdicts: React.FC<{
  criteria: Record<string, unknown>[];
  labels?: { a: string; b: string };
}> = ({ criteria, labels }) => (
  <div className="divide-y divide-border rounded-md border border-border">
    {criteria.map((c, i) => {
      const pref = preferenceLabel(readText(c.preferred), labels);
      return (
        <div key={i} className="grid min-w-0 grid-cols-[minmax(8rem,14rem)_6.5rem_1fr] items-start gap-2 px-2.5 py-1.5 text-xs">
          <span className="font-medium text-foreground">{readText(c.criterion) ?? "—"}</span>
          <span>
            <StateChip label={pref.label} tone={pref.tone} icon={pref.icon} />
          </span>
          <span className="text-muted-foreground">{readText(c.evidence)}</span>
        </div>
      );
    })}
  </div>
);

export const AgentFactoryProofReviewView: React.FC<ViewProps> = ({ value, className }) => {
  if (!isRecord(value)) return <Missing />;
  const gates = records(value.gates);
  const cases = records(value.cases);
  const sendBack = isRecord(value.send_back) ? value.send_back : null;
  return (
    <div className={cn("flex min-w-0 flex-col gap-3", className)}>
      <ChipRow>
        {verdictChip(readText(value.verdict))}
        <StateChip
          label={`${gates.filter((g) => g.passed === true).length}/${gates.length} gates`}
          tone={gates.every((g) => g.passed === true) ? "good" : "bad"}
        />
        <StateChip label={`${cases.length} cases`} />
      </ChipRow>
      {readText(value.summary) ? (
        <p className="text-xs leading-relaxed text-foreground">{readText(value.summary)}</p>
      ) : null}
      {sendBack ? (
        <Section title={`Send back to ${readText(sendBack.step) ?? "?"}`}>
          <ul className="list-disc space-y-0.5 pl-5 text-xs">
            {strings(sendBack.findings).map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        </Section>
      ) : null}
      <Section title="Gates">
        <div className="divide-y divide-border rounded-md border border-border">
          {gates.map((g, i) => (
            <div key={i} className="flex min-w-0 items-start gap-2 px-2.5 py-1.5 text-xs">
              {g.passed === true ? (
                <Check className="mt-0.5 size-3.5 shrink-0 text-success" />
              ) : (
                <X className="mt-0.5 size-3.5 shrink-0 text-destructive" />
              )}
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="font-medium">{readText(g.criterion) ?? "—"}</span>
                <span className="text-muted-foreground">{readText(g.evidence)}</span>
              </div>
            </div>
          ))}
        </div>
      </Section>
      {cases.map((c, i) => {
        const pref = preferenceLabel(readText(c.preferred));
        return (
          <Section key={readText(c.case_id) ?? i} title={readText(c.case_id) ?? `Case ${i + 1}`}>
            <ChipRow>
              <span className="text-xs text-muted-foreground">Preferred</span>
              <StateChip label={pref.label} tone={pref.tone} icon={pref.icon} />
            </ChipRow>
            <CriterionVerdicts criteria={records(c.criteria)} />
          </Section>
        );
      })}
    </div>
  );
};

/* ---------------------------------------------------------------- build */

const OUTCOME_TONE: Record<string, ChipTone> = {
  passed: "good",
  failed: "bad",
  send_backs_exhausted: "warn",
  workflow_sized: "warn",
  saved_unproven: "warn",
  judge_not_blind: "warn",
  no_proof_inputs: "warn",
  needs_new_kind: "warn",
  unproven: "warn",
  worker_lost: "warn",
};
const OUTCOME_LABEL: Record<string, string> = {
  passed: "Passed",
  failed: "Failed",
  send_backs_exhausted: "Send-backs used up",
  workflow_sized: "Workflow-sized",
  saved_unproven: "Saved unproven",
  judge_not_blind: "Not judged blind",
  no_proof_inputs: "Needs examples",
  needs_new_kind: "Needs new shape",
  unproven: "Too few real cases",
  worker_lost: "Stopped mid-build",
};

export function outcomeChip(outcome: string | null) {
  if (!outcome) return null;
  return <StateChip label={OUTCOME_LABEL[outcome] ?? outcome} tone={OUTCOME_TONE[outcome] ?? "neutral"} />;
}

const BuildPart: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <details className="group rounded-md border border-border">
    <summary className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium">
      <ArrowRight className="size-3 transition-transform group-open:rotate-90" />
      {title}
    </summary>
    <div className="border-t border-border p-2.5">{children}</div>
  </details>
);

export const AgentFactoryBuildView: React.FC<ViewProps> = ({ value, className }) => {
  if (!isRecord(value)) return <Missing />;
  const agent = isRecord(value.agent) ? value.agent : null;
  const sendBacks = readNumber(value.send_backs) ?? 0;
  const assumptions = strings(value.assumptions);
  const goal = isRecord(value.goal_spec) && Object.keys(value.goal_spec).length > 0 ? value.goal_spec : null;
  return (
    <div className={cn("flex min-w-0 flex-col gap-2", className)}>
      <ChipRow>
        {outcomeChip(readText(value.outcome))}
        {agent && readText(agent.name) ? <StateChip label={readText(agent.name) ?? ""} tone="accent" /> : null}
        <StateChip
          label={`${sendBacks} send-back${sendBacks === 1 ? "" : "s"}`}
          tone={sendBacks > 0 ? "warn" : "neutral"}
          icon={<Undo2 className="size-3" />}
        />
        {assumptions.length > 0 ? <StateChip label={`${assumptions.length} assumptions`} /> : null}
      </ChipRow>
      {goal ? (
        <BuildPart title="Goal">
          <KindInstanceRender kind="agent_mandate_specification" value={goal} variant="bare" />
        </BuildPart>
      ) : null}
      {isRecord(value.contract) ? (
        <BuildPart title="Contract">
          <AgentFactoryContractView value={value.contract} />
        </BuildPart>
      ) : null}
      {isRecord(value.tool_choice) ? (
        <BuildPart title="Tools">
          <AgentFactoryToolChoiceView value={value.tool_choice} />
        </BuildPart>
      ) : null}
      {isRecord(value.instructions) ? (
        <BuildPart title="Instructions">
          <AgentFactoryInstructionsView value={value.instructions} />
        </BuildPart>
      ) : null}
      {isRecord(value.proof_review) ? (
        <BuildPart title="Judge">
          <AgentFactoryProofReviewView value={value.proof_review} />
        </BuildPart>
      ) : null}
      {assumptions.length > 0 ? (
        <BuildPart title="Assumptions">
          <ul className="list-disc space-y-1 pl-5 text-xs">
            {assumptions.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </BuildPart>
      ) : null}
    </div>
  );
};

/* --------------------------------------------------------------- blocks */

const VIEWS = {
  agent_factory_contract: AgentFactoryContractView,
  agent_factory_tool_choice: AgentFactoryToolChoiceView,
  agent_factory_instructions: AgentFactoryInstructionsView,
  agent_factory_proof_review: AgentFactoryProofReviewView,
  agent_factory_build: AgentFactoryBuildView,
} as const;

const AgentFactoryKindBlock: React.FC<ResultKindBlockProps & { kind: keyof typeof VIEWS }> = ({
  kind,
  content,
  metadata,
  className,
}) => {
  const View = VIEWS[kind];
  const { value, recovered, streaming } = readKindValue(content, metadata);
  if (!recovered || !isRecord(value)) return <RawRegion content={content} className={className} />;
  return (
    <div className={cn("my-2 flex min-w-0 flex-col gap-2", className)}>
      {streaming ? <StillArriving /> : null}
      <View value={value} />
    </div>
  );
};

export function AgentFactoryContractBlock(props: ResultKindBlockProps) {
  return <AgentFactoryKindBlock kind="agent_factory_contract" {...props} />;
}
export function AgentFactoryToolChoiceBlock(props: ResultKindBlockProps) {
  return <AgentFactoryKindBlock kind="agent_factory_tool_choice" {...props} />;
}
export function AgentFactoryInstructionsBlock(props: ResultKindBlockProps) {
  return <AgentFactoryKindBlock kind="agent_factory_instructions" {...props} />;
}
export function AgentFactoryProofReviewBlock(props: ResultKindBlockProps) {
  return <AgentFactoryKindBlock kind="agent_factory_proof_review" {...props} />;
}
export function AgentFactoryBuildBlock(props: ResultKindBlockProps) {
  return <AgentFactoryKindBlock kind="agent_factory_build" {...props} />;
}
