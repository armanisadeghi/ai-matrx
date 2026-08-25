/**
 * node-presentation — everything the live run surface knows about a step
 * BEFORE it runs, derived purely from the workflow DEFINITION.
 *
 * THIS IS THE ANSWER TO "tell me what to look forward to". The definition
 * already carries, per node: a human `label`, a lucide `icon` name (kebab, as
 * lucide.dev lists them), a `category` (io / data / llm / agent), a
 * `spec_type`, and — on the nodes that matter — a declared `output_kind`. A
 * run surface that waits for `node_started` to learn a step exists can only
 * ever show a void; reading the definition means the whole journey and every
 * deliverable is on screen from second zero.
 *
 * Pure module — no React, no Redux. The run's live phases are joined onto
 * these rows by the components that render them.
 */

import { kebabCaseToLucidePascalCase } from "@/utils/icons/lucide-name-normalize";

import type { WorkflowDefinitionLike } from "../../trigger-points";

/** The five families a step can belong to — drives icon + colour. */
export type NodeFamily = "input" | "prepare" | "think" | "agent" | "deliver";

export interface RunStepPresentation {
  nodeId: string;
  /** The author's human name for the step. Never a graph-local id. */
  label: string;
  family: NodeFamily;
  /** Lucide PascalCase name for IconResolver; null → the family default. */
  iconName: string | null;
  /** The declared shape this step produces, when it declares one. */
  outputKind: string | null;
  /** The engine's spec type — diagnostic detail, never the headline. */
  specType: string | null;
  /** True for a step that collects input from the person, not from the AI. */
  collectsInput: boolean;
}

/** Family → the tint the whole surface uses for that kind of work. Semantic
 * tokens where one exists; the accent hues are deliberate and identical in
 * light and dark (both are `-500`, which is the crossover shade). */
export const FAMILY_STYLE: Record<
  NodeFamily,
  { text: string; bg: string; ring: string; dot: string }
> = {
  input: {
    text: "text-sky-600 dark:text-sky-400",
    bg: "bg-sky-500/10",
    ring: "border-sky-500/40",
    dot: "bg-sky-500",
  },
  prepare: {
    text: "text-teal-600 dark:text-teal-400",
    bg: "bg-teal-500/10",
    ring: "border-teal-500/40",
    dot: "bg-teal-500",
  },
  think: {
    text: "text-violet-600 dark:text-violet-400",
    bg: "bg-violet-500/10",
    ring: "border-violet-500/40",
    dot: "bg-violet-500",
  },
  agent: {
    text: "text-primary",
    bg: "bg-primary/10",
    ring: "border-primary/40",
    dot: "bg-primary",
  },
  deliver: {
    text: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-500/10",
    ring: "border-emerald-500/40",
    dot: "bg-emerald-500",
  },
};

/** Family → fallback lucide icon when the author declared none. */
export const FAMILY_ICON: Record<NodeFamily, string> = {
  input: "ClipboardPen",
  prepare: "Layers",
  think: "BrainCircuit",
  agent: "Bot",
  deliver: "PackageCheck",
};

const FAMILY_NOUN: Record<NodeFamily, string> = {
  input: "Your input",
  prepare: "Preparation",
  think: "Analysis",
  agent: "AI specialist",
  deliver: "Deliverable",
};

export function familyNoun(family: NodeFamily): string {
  return FAMILY_NOUN[family];
}

function familyOf(
  category: string | null,
  specType: string | null,
): NodeFamily {
  if (specType === "output.to_frontend" || specType?.startsWith("output.")) {
    return "deliver";
  }
  if (specType === "io.user_input") return "input";
  switch (category) {
    case "agent":
      return "agent";
    case "llm":
      return "think";
    case "io":
      return "prepare";
    case "data":
      return "prepare";
    default:
      return "prepare";
  }
}

function readString(
  data: Record<string, unknown> | undefined,
  key: string,
): string | null {
  const value = data?.[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * `data.category` for a node that does not carry one.
 *
 * 🚨 THE DEFECT THIS CLOSES: `data.spec_type` and `data.category` are written
 * by the STUDIO BUILDER and by nothing else. Every definition the platform
 * creates for itself — compiled Orchestra plans, agent-authored plans, node
 * probes, anything POSTed to `/workflows` — carries `type` on the node and
 * NULL for both of those. Reading only `data` therefore classified every step
 * of every programmatic workflow as plumbing: no readout, no deliverable, and
 * a run page that showed a completed agent's work as an empty column
 * (measured on live definitions, 2026-08-22). `node.type` is the field the
 * ENGINE runs on and is always present, so it is what this reads.
 *
 * Deliberately partial: it names only the families the run surface changes
 * behaviour on, and returns null for everything else so an unknown type keeps
 * exactly today's treatment. Values match the live registry
 * (`GET /workflow/node-types`). The durable fix is the definition write path
 * stamping the registry's own category — filed, not done here.
 */
function categoryFromSpecType(specType: string | null): string | null {
  if (!specType) return null;
  if (specType.startsWith("ai.agent.")) return "agent";
  if (specType.startsWith("ai.util.")) return "data";
  if (specType.startsWith("ai.")) return "llm";
  if (specType.startsWith("docproc.content.")) return "llm";
  return null;
}

/**
 * THE one reader of a node's engine identity, for every run-surface decision.
 * `data.spec_type` when the builder wrote it, `node.type` otherwise — and the
 * category the same way. Both callers (`describeWorkflowSteps` and
 * `deriveDefaultSurfaceConfig`) go through this so they can never disagree
 * about what a step IS.
 */
export function resolveNodeIdentity(node: {
  type?: string | null;
  data?: Record<string, unknown> | undefined;
}): { specType: string | null; category: string | null } {
  const data = node.data;
  const specType =
    readString(data, "spec_type") ??
    (typeof node.type === "string" && node.type ? node.type : null);
  const category = readString(data, "category") ?? categoryFromSpecType(specType);
  return { specType, category };
}

/**
 * Every step of a workflow, in definition order, as the run surface shows it.
 * Tolerant by contract — a node missing a label/icon/category still produces a
 * renderable row, because a run page must render.
 */
export function describeWorkflowSteps(
  definition: WorkflowDefinitionLike,
): RunStepPresentation[] {
  return definition.nodes.map((node) => {
    const data = node.data as Record<string, unknown> | undefined;
    const { specType, category } = resolveNodeIdentity(node);
    const family = familyOf(category, specType);
    const rawIcon = readString(data, "icon");
    return {
      nodeId: node.id,
      label: readString(data, "label") ?? humanizeIdentifier(node.id),
      family,
      iconName: rawIcon ? kebabCaseToLucidePascalCase(rawIcon) : null,
      outputKind: readString(data, "output_kind"),
      specType,
      collectsInput: specType === "io.user_input",
    };
  });
}

/**
 * The kind ONE node declares it will produce, straight from the definition —
 * so a surface can reserve that kind's shape before the run has produced
 * anything at all. Null when the definition is absent, the node is unknown,
 * or it declares no `output_kind` (a programmatic node often does not).
 *
 * THE ONE lookup for "what shape is coming" — both the authored surface
 * (`RunSurfaceView`) and the per-step readouts (`ReadoutView`) call this
 * rather than each walking the graph their own way.
 */
export function nodeOutputKind(
  definition: WorkflowDefinitionLike | undefined,
  nodeId: string,
): string | null {
  if (!definition) return null;
  for (const node of definition.nodes) {
    if (node.id !== nodeId) continue;
    return readString(node.data as Record<string, unknown> | undefined, "output_kind");
  }
  return null;
}

/** nodeId → its presentation, for the joins the live components do per row. */
export function stepsByNodeId(
  steps: RunStepPresentation[],
): Record<string, RunStepPresentation> {
  const map: Record<string, RunStepPresentation> = {};
  for (const step of steps) map[step.nodeId] = step;
  return map;
}

/**
 * `study_pack_set` → "Study pack", `flashcard_set` → "Flashcards",
 * `quiz_set` → "Quiz". A declared kind is a promise to the reader, so it is
 * spoken in their words — never as a registry identifier.
 *
 * Pluralisation is deliberately conservative: a bare "+s" is only correct for
 * words that do not end in a sibilant, so "quiz" stays "Quiz" rather than
 * becoming the nonsense "Quizs". A wrong plural in the first thing the reader
 * sees is worse than a singular.
 */
const NO_BARE_S = /(?:s|x|z|ch|sh)$/i;

export function humanizeKind(kind: string): string {
  const base = kind
    .replace(/[._]/g, " ")
    .replace(/\bset\b/gi, "")
    .trim();
  if (!base) return humanizeIdentifier(kind);
  const words = base.split(/\s+/);
  const head = words[0];
  const spoken =
    words.length > 1 || NO_BARE_S.test(head) ? words.join(" ") : `${head}s`;
  return spoken.charAt(0).toUpperCase() + spoken.slice(1);
}

/** `lesson_scripts` → "Lesson scripts". The last-resort human name. */
export function humanizeIdentifier(raw: string): string {
  const words = raw.replace(/[._-]+/g, " ").trim();
  if (!words) return raw;
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * The steps that PRODUCE something the reader gets to keep: every node with a
 * declared `output_kind`, in definition order. This is the deliverables strip
 * — visible as "coming up" from the first frame, filling in as they land.
 */
export function deliverableSteps(
  steps: RunStepPresentation[],
): RunStepPresentation[] {
  return steps.filter((step) => step.outputKind !== null);
}
