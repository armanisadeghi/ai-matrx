/**
 * Plain language for the Run Surface builder — THE TRANSLATION LAYER.
 *
 * The stored document (surface/config.ts) speaks the platform's vocabulary:
 * readouts, sources, trigger point ids, 24-column positions. The person using
 * the builder is a world-class expert in something else who does not code and
 * never will (USER.md), so NONE of that vocabulary may reach the screen.
 *
 * This module is the ONE place that turns the document into sentences and the
 * sentences back into the document. Nothing here renders; nothing here writes.
 * If a word shows up in the builder UI, it is derived here.
 */

import type { ReadoutSource } from "../surface/config";
import type { WorkflowDefinitionLike } from "../trigger-points";

// ── Steps: the workflow's own nodes, described the way a person sees them ───

export interface StepInfo {
  id: string;
  /** The author's own label for this step. Never a graph id, never a spec. */
  label: string;
  /** One plain sentence: what this step does. */
  role: string;
  /** True when a person would plausibly want to watch this on screen. */
  worthWatching: boolean;
  /** This step runs a whole other workflow. */
  isSubWorkflow: boolean;
  /** This step asks the person for something before the run can go on. */
  asksThePerson: boolean;
}

interface RoleRule {
  match: RegExp;
  role: string;
  worthWatching: boolean;
}

/** Ordered — first match wins. Prefixes come from the graph's spec types. */
const ROLE_RULES: readonly RoleRule[] = [
  { match: /^ai\.agent\./, role: "An AI writes this, live", worthWatching: true },
  { match: /^ai\.util\./, role: "Tidies up what the AI wrote", worthWatching: false },
  { match: /^ai\./, role: "AI does the thinking here", worthWatching: true },
  { match: /^subgraph\./, role: "Runs another workflow", worthWatching: true },
  { match: /^io\.user_input/, role: "Asks the person for something", worthWatching: false },
  { match: /^io\./, role: "Moves information in or out", worthWatching: false },
  { match: /^docproc\./, role: "Reads and understands documents", worthWatching: true },
  { match: /^media\./, role: "Finds pictures, audio or video", worthWatching: true },
  { match: /^output\./, role: "Hands over the finished result", worthWatching: true },
  { match: /^data\./, role: "Behind-the-scenes data work", worthWatching: false },
  { match: /^http\.|^web\.|^scrape/, role: "Fetches something from the web", worthWatching: true },
  { match: /^tool\./, role: "Uses a tool", worthWatching: true },
];

function roleFor(specType: string): RoleRule {
  for (const rule of ROLE_RULES) {
    if (rule.match.test(specType)) return rule;
  }
  return { match: /./, role: "A step in the workflow", worthWatching: false };
}

/** Every step of a workflow, in graph order, described in plain language. */
export function describeSteps(definition: WorkflowDefinitionLike): StepInfo[] {
  return definition.nodes.map((node) => {
    const specType =
      typeof node.data?.spec_type === "string" ? node.data.spec_type : "";
    const label = node.data?.label;
    const rule = roleFor(specType);
    const producesSomething =
      typeof node.data?.output_kind === "string" && node.data.output_kind.length > 0;
    return {
      id: node.id,
      label: typeof label === "string" && label ? label : node.id,
      role: rule.role,
      worthWatching: rule.worthWatching || producesSomething,
      isSubWorkflow: specType === "subgraph.call",
      asksThePerson: specType.startsWith("io.user_input"),
    };
  });
}

/** Step lookup by id, with an honest fallback for a step that has been deleted. */
export function stepLabel(steps: readonly StepInfo[], nodeId: string): string {
  return steps.find((s) => s.id === nodeId)?.label ?? "A step that no longer exists";
}

// ── Panels: what one box on the run page is, in plain language ──────────────

export interface PanelDescription {
  /** Fallback title when the author has not written one. */
  title: string;
  /** The sub-line under the title: where this content comes from. */
  detail: string;
}

export function describePanel(
  source: ReadoutSource,
  steps: readonly StepInfo[],
): PanelDescription {
  switch (source.kind) {
    case "node": {
      const step = steps.find((s) => s.id === source.nodeId);
      return {
        title: step?.label ?? stepLabel(steps, source.nodeId),
        detail: step ? "Step output" : "Step removed",
      };
    }
    case "childRun":
      return {
        title: stepLabel(steps, source.nodeId),
        detail: "Nested run",
      };
    case "group":
      return {
        title: source.label,
        detail: `${source.nodeIds.length} steps`,
      };
    case "progressRail":
      return {
        title: "Progress",
        detail: source.nodeIds?.length ? `${source.nodeIds.length} steps, live` : "All steps, live",
      };
    case "static":
      return {
        title: "A note for the reader",
        detail: source.markdown.trim().split("\n")[0]?.slice(0, 40) || "Custom note",
      };
    case "action":
      return {
        title: source.label,
        detail:
          source.mode === "auto" ? "Runs automatically" : "Run button",
      };
  }
}

// ── Moments: trigger points, asked as a question a person can answer ────────

export type MomentChoice =
  | { kind: "always" }
  | { kind: "stepStarts"; nodeId: string }
  | { kind: "stepFinishes"; nodeId: string }
  | { kind: "runFinishes" }
  | { kind: "deliverable" }
  /** A moment authored elsewhere (an edge, a mark) — kept, never mangled. */
  | { kind: "custom"; id: string };

export type MomentKind = MomentChoice["kind"];

/** The five moments the builder offers, in the order a person thinks of them. */
export const MOMENT_KINDS: readonly {
  kind: MomentKind;
  label: string;
  needsStep: boolean;
}[] = [
  { kind: "always", label: "Right away", needsStep: false },
  { kind: "stepStarts", label: "When a step starts", needsStep: true },
  { kind: "stepFinishes", label: "When a step finishes", needsStep: true },
  { kind: "deliverable", label: "When the result is ready", needsStep: false },
  { kind: "runFinishes", label: "When everything is done", needsStep: false },
];

export function momentFromTrigger(triggerId: string | undefined): MomentChoice {
  if (!triggerId) return { kind: "always" };
  if (triggerId === "deliverable:ready") return { kind: "deliverable" };
  if (triggerId === "run:completed") return { kind: "runFinishes" };
  if (triggerId.startsWith("node:")) {
    const rest = triggerId.slice("node:".length);
    const lastColon = rest.lastIndexOf(":");
    if (lastColon > 0) {
      const nodeId = rest.slice(0, lastColon);
      const event = rest.slice(lastColon + 1);
      if (event === "started") return { kind: "stepStarts", nodeId };
      if (event === "completed") return { kind: "stepFinishes", nodeId };
    }
  }
  return { kind: "custom", id: triggerId };
}

export function triggerFromMoment(moment: MomentChoice): string | undefined {
  switch (moment.kind) {
    case "always":
      return undefined;
    case "stepStarts":
      return `node:${moment.nodeId}:started`;
    case "stepFinishes":
      return `node:${moment.nodeId}:completed`;
    case "runFinishes":
      return "run:completed";
    case "deliverable":
      return "deliverable:ready";
    case "custom":
      return moment.id;
  }
}

/** A whole sentence describing when something happens. */
export function describeMoment(
  moment: MomentChoice,
  steps: readonly StepInfo[],
): string {
  switch (moment.kind) {
    case "always":
      return "Right away";
    case "stepStarts":
      return `When "${stepLabel(steps, moment.nodeId)}" starts`;
    case "stepFinishes":
      return `When "${stepLabel(steps, moment.nodeId)}" finishes`;
    case "runFinishes":
      return "When everything is done";
    case "deliverable":
      return "When the result is ready";
    case "custom":
      return "At a moment set up elsewhere";
  }
}
