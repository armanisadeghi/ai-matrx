/**
 * The vocabulary of the "create a Shape" page — the questions we actually ask
 * a person before an agent builds their Shape, and the brief those answers
 * compose into.
 *
 * WHO IS ANSWERING: a brilliant, completely non-technical Subject Matter
 * Expert (common-docs USER.md). They do not know what a schema, a kind, or a
 * discriminator is, and they never will. Every label and description here is
 * written in their words — "what does one of these hold", not "define the
 * properties" — and every option maps to something the Shape System really
 * does with it.
 *
 * Pure and importable: no React, no DB, no agent. The page owns the widgets,
 * this file owns the meaning, and `composeNewShapeBrief` owns the hand-off.
 */

import type { LucideIcon } from "lucide-react";
import {
  BrainCircuit,
  FileText,
  Gauge,
  LayoutPanelTop,
  ListOrdered,
  Table,
} from "lucide-react";

export interface NewShapeChoice<T extends string> {
  id: T;
  label: string;
  description: string;
  icon?: LucideIcon;
}

// --------------------------------------------------------------- look & feel

export type NewShapeRenderStyle =
  | "card"
  | "list"
  | "steps"
  | "document"
  | "metrics"
  | "auto";

/** How the finished Shape should DRAW. Steers the component the agent builds. */
export const NEW_SHAPE_RENDER_STYLES: ReadonlyArray<
  NewShapeChoice<NewShapeRenderStyle>
> = [
  {
    id: "card",
    label: "A card",
    description: "One self-contained block with a headline and its details.",
    icon: LayoutPanelTop,
  },
  {
    id: "list",
    label: "A list or table",
    description: "Rows of the same thing, laid out to scan quickly.",
    icon: Table,
  },
  {
    id: "steps",
    label: "Steps or a timeline",
    description: "Ordered stages, events, or instructions.",
    icon: ListOrdered,
  },
  {
    id: "document",
    label: "A written piece",
    description: "Long-form, with headings and paragraphs.",
    icon: FileText,
  },
  {
    id: "metrics",
    label: "Numbers up front",
    description: "Figures and measures first, the detail underneath.",
    icon: Gauge,
  },
  {
    id: "auto",
    label: "You choose",
    description: "Read what I wrote and pick the layout that fits it best.",
    icon: BrainCircuit,
  },
];

const RENDER_STYLE_BRIEF: Record<NewShapeRenderStyle, string> = {
  card: "Render it as a single self-contained CARD — a clear headline with its details grouped beneath.",
  list: "Render it as a LIST OR TABLE — repeated rows of the same thing, optimized for scanning and comparison.",
  steps:
    "Render it as ORDERED STEPS OR A TIMELINE — sequence is the point, so make the order and progression visually obvious.",
  document:
    "Render it as a WRITTEN DOCUMENT — headings and prose, tuned for reading rather than scanning.",
  metrics:
    "Render it as a METRICS PANEL — the key figures large and first, supporting detail secondary.",
  auto: "The user did not pick a layout — choose the one their description actually calls for, and say which you chose and why.",
};

// -------------------------------------------------------------- cardinality

export type NewShapeCardinality = "single" | "collection";

export const NEW_SHAPE_CARDINALITIES: ReadonlyArray<
  NewShapeChoice<NewShapeCardinality>
> = [
  {
    id: "single",
    label: "One at a time",
    description: "Each one stands on its own.",
  },
  {
    id: "collection",
    label: "A set of them",
    description: "Each one holds a group of items together.",
  },
];

const CARDINALITY_BRIEF: Record<NewShapeCardinality, string> = {
  single:
    "Each instance is ONE item — model the shape around a single subject, not a wrapper around a list.",
  collection:
    "Each instance is a COLLECTION — the shape carries a titled group and an array of the repeated items inside it.",
};

// --------------------------------------------------------------- visibility

/** Mirrors `content_ir.kind_definition.visibility`. `personal` does not exist
 *  for shapes — the DB check `kind_definition_no_personal_visibility` refuses
 *  it, because a personal shape is stranded the moment its author is away. */
export type NewShapeVisibility = "internal" | "public";

export const NEW_SHAPE_VISIBILITIES: ReadonlyArray<
  NewShapeChoice<NewShapeVisibility>
> = [
  {
    id: "internal",
    label: "My organization",
    description: "Everyone who has access through your organization.",
  },
  {
    id: "public",
    label: "Everyone",
    description: "Published into the shared Shapes library.",
  },
];

// ------------------------------------------------------------------- assets

/** The real assets a kind can have, in the words of the person asking for
 *  them. Each one is work the builder agent does after the shape itself. */
export type NewShapeAsset = "component" | "teaching_block" | "sample";

export const NEW_SHAPE_ASSETS: ReadonlyArray<NewShapeChoice<NewShapeAsset>> = [
  {
    id: "component",
    label: "Build it a custom look",
    description:
      "Design a component for it, so it renders beautifully instead of as raw data.",
  },
  {
    id: "teaching_block",
    label: "Teach my agents to produce it",
    description:
      "Write the instructions your agents read to emit this shape correctly.",
  },
  {
    id: "sample",
    label: "Fill in an example",
    description:
      "Create a realistic sample so you can preview and test it straight away.",
  },
];

export const NEW_SHAPE_DEFAULT_ASSETS: ReadonlyArray<NewShapeAsset> = [
  "component",
  "teaching_block",
  "sample",
];

const ASSET_BRIEF: Record<NewShapeAsset, string> = {
  component:
    "Build a purpose-built output component for it (do not leave it on the generic viewer).",
  teaching_block:
    "Write its teaching content block so agents know exactly how to emit it.",
  sample:
    "Author a realistic canonical example and pin it, so the shape can pass the activation gate and the user can preview it immediately.",
};

// --------------------------------------------------------------- the answers

export interface NewShapeAnswers {
  /** What they want it called. Required. */
  name: string;
  /** What one of these holds, in their words. Required. */
  contents: string;
  /** Real data they pasted. Optional, but the strongest signal there is. */
  sample: string;
  renderStyle: NewShapeRenderStyle;
  cardinality: NewShapeCardinality;
  visibility: NewShapeVisibility;
  assets: readonly NewShapeAsset[];
}

export const NEW_SHAPE_EMPTY_ANSWERS: NewShapeAnswers = {
  name: "",
  contents: "",
  sample: "",
  renderStyle: "auto",
  cardinality: "single",
  visibility: "internal",
  assets: NEW_SHAPE_DEFAULT_ASSETS,
};

export function newShapeAnswersReady(answers: NewShapeAnswers): boolean {
  return answers.name.trim().length > 0 && answers.contents.trim().length > 0;
}

/**
 * Turn the answers into the builder agent's hand-off.
 *
 * THE USER-INPUT LAW (common-docs/systems/agents/agent-variable-binding):
 *   - `userInput` is the person's OWN sentence, verbatim — what they typed
 *     into "what does one of these hold". Nothing composed, nothing added.
 *   - `task_brief` is the machine-composed directive: every structured answer
 *     from the form, spelled out so the agent never has to guess which
 *     checkbox was ticked.
 *   - `user_data_sample` carries the pasted data on its own variable, so the
 *     platform can cap, diff or swap it independently of the instruction.
 */
export function composeNewShapeBrief(answers: NewShapeAnswers): {
  userInput: string;
  variables: Record<string, string>;
} {
  const name = answers.name.trim();
  const assets = answers.assets.length
    ? answers.assets.map((asset) => `- ${ASSET_BRIEF[asset]}`).join("\n")
    : "- The user asked for NOTHING beyond the shape itself — create the definition and stop there.";

  const brief = [
    `Create a new Shape (kind) for this user and call it "${name}".`,
    "",
    "They filled in the studio's create form. These are their answers — treat every one as a decision they made, not a hint:",
    "",
    CARDINALITY_BRIEF[answers.cardinality],
    RENDER_STYLE_BRIEF[answers.renderStyle],
    `Visibility: \`${answers.visibility}\`${answers.visibility === "public" ? " — it goes into the shared Shapes library." : " — it stays inside their organization."} Never set \`personal\`; the database refuses it for shapes.`,
    "",
    "Then build what they asked for alongside it:",
    assets,
    "",
    answers.sample.trim()
      ? "They pasted real data — it is in your data sample. Design the structure around THAT, not around a guess, and keep their field names wherever they are sensible."
      : "They pasted no sample data. Derive the structure from their description, and tell them what fields you chose.",
    "",
    "Pick the slug yourself in lower_snake_case from the name. Their own description of the contents is the message they sent you — read it as the specification.",
  ].join("\n");

  const variables: Record<string, string> = { task_brief: brief };
  if (answers.sample.trim()) variables.user_data_sample = answers.sample.trim();

  return { userInput: answers.contents.trim(), variables };
}
