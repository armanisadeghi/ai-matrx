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
  FileText,
  Gauge,
  LayoutPanelTop,
  ListOrdered,
  Table,
} from "lucide-react";
import { AGENT_ICON } from "@/components/icons/domain-icons";
import {
  KIND_DISPOSITION_CHOICES,
  isKindDisposition,
  type KindDisposition,
} from "@/features/content-ir/registry/kind-dispositions";

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
    icon: AGENT_ICON,
  },
];

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

// -------------------------------------------------------------- disposition

/**
 * What each one IS (KINDS-GLUE: `metadata.disposition`). The person picks it — nothing is
 * preselected — and the brief hands the builder the exact value to pass to `kind_create`,
 * which refuses a create without one.
 */
export const NEW_SHAPE_DISPOSITIONS: ReadonlyArray<NewShapeChoice<KindDisposition>> =
  KIND_DISPOSITION_CHOICES;

// ------------------------------------------------------ published to the web

/** Mirrors `content_ir.kind_definition.published_to_web`. A shape is always open to people who
 *  reach it through the organization; there is no "Only me" for shapes (a shape one account alone
 *  can edit is stranded the moment its author is away). */
export type NewShapeWebChoice = "not_published" | "published_to_web";

export const NEW_SHAPE_WEB_CHOICES: ReadonlyArray<
  NewShapeChoice<NewShapeWebChoice>
> = [
  {
    id: "not_published",
    label: "My organization",
    description: "Everyone who has access through your organization.",
  },
  {
    id: "published_to_web",
    label: "Published to the web",
    description: "Anyone can open it; it is listed in the shared Shapes library.",
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
  /** What each one IS — required, never defaulted (null until the person picks). */
  disposition: KindDisposition | null;
  web: NewShapeWebChoice;
  assets: readonly NewShapeAsset[];
}

export const NEW_SHAPE_EMPTY_ANSWERS: NewShapeAnswers = {
  name: "",
  contents: "",
  sample: "",
  renderStyle: "auto",
  cardinality: "single",
  disposition: null,
  web: "not_published",
  assets: NEW_SHAPE_DEFAULT_ASSETS,
};

export function newShapeAnswersReady(answers: NewShapeAnswers): boolean {
  return (
    answers.name.trim().length > 0 &&
    answers.contents.trim().length > 0 &&
    isKindDisposition(answers.disposition)
  );
}

/**
 * Turn the answers into the builder agent's hand-off.
 *
 * THE USER-INPUT LAW (common-docs/systems/agents/agent-variable-binding):
 *   - `userInput` is the person's OWN sentence, verbatim — what they typed
 *     into "what does one of these hold". Nothing composed, nothing added.
 *   - Every structured answer rides as its own NAMED variable holding the raw
 *     choice (`single`, `card`, `published_to_web`, ...). What each choice
 *     MEANS is written once, on the builder agent's authored user message —
 *     code composes no prose.
 *   - `user_data_sample` carries the pasted data on its own variable, so the
 *     platform can cap, diff or swap it independently of the instruction.
 */
export function composeNewShapeBrief(answers: NewShapeAnswers): {
  userInput: string;
  variables: Record<string, string | string[]>;
} {
  const variables: Record<string, string | string[]> = {
    shape_name: answers.name.trim(),
    shape_cardinality: answers.cardinality,
    shape_render_style: answers.renderStyle,
    shape_visibility: answers.web,
    shape_assets: answers.assets.length ? [...answers.assets] : "none",
  };
  if (answers.disposition) variables.shape_disposition = answers.disposition;
  if (answers.sample.trim()) variables.user_data_sample = answers.sample.trim();

  return { userInput: answers.contents.trim(), variables };
}
