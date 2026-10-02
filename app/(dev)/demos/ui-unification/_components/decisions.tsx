"use client";

/**
 * Round 2 (2026-10-02). The owner's round-1 picks are recorded here as data;
 * where they and the engineering recommendation agree, the decision is listed
 * as AGREED and not re-asked. Where they differ, both are shown and NEITHER
 * wins by default. Counts are the 2026-10-01 AST census.
 */

import type { ComponentType } from "react";
import * as S from "./specimens";
import * as OC from "./one-control";
import * as R2 from "./round2";
import * as TS from "./toast-system";

export interface DecisionOption {
  id: string;
  label: string;
  stat?: string;
  Specimen: ComponentType;
}

export type DecisionStatus = "open" | "combined" | "rule" | "new";

export interface Decision {
  id: string;
  title: string;
  question: string;
  status: DecisionStatus;
  /** What the owner picked in round 1, in his words where possible. */
  round1?: string;
  /** The engineering recommendation for this round. */
  mine?: string;
  /** One option per row — for specimens that are full rows or frames. */
  wide?: boolean;
  options: DecisionOption[];
}

/** Settled in round 1: owner pick and recommendation match. */
export const AGREED: { id: string; text: string }[] = [
  { id: "D1", text: "Toolbars are 28px — the tap capsule" },
  { id: "D1b", text: "Touch gets an invisible 44px hit area; layout never grows" },
  { id: "D5", text: "One badge: the package outline shape" },
  { id: "D6", text: "Quiet row actions are muted until hover" },
  { id: "D7", text: "Icon-only buttons are 28px (now: tap buttons at 28)" },
  { id: "D10", text: "Default dialog width is md" },
  { id: "D14", text: "Panels and cards use 8px corners (rounded-lg)" },
  { id: "D15", text: "Phone screens are flat rows with hairlines" },
];

export const DECISIONS: Decision[] = [
  {
    id: "D0",
    title: "One control system",
    question: "Every control, the same object as a tap button?",
    status: "new",
    round1: "28px toolbars (D1)",
    mine: "Yes, at 28px",
    wide: true,
    options: [
      { id: "a", label: "Today, mixed", stat: "as shipped", Specimen: OC.OneToday },
      { id: "b", label: "One system at 32px", stat: "today's tap pill", Specimen: OC.OneAt32 },
      { id: "d", label: "One system at 30px", stat: "in between", Specimen: OC.OneAt30 },
      { id: "c", label: "One system at 28px", stat: "recommended", Specimen: OC.OneAt28 },
    ],
  },
  {
    id: "D2",
    title: "Form row height",
    question: "Fields and buttons in a form",
    status: "open",
    round1: "All 32px",
    mine: "28px — one height everywhere",
    wide: true,
    options: [
      { id: "a", label: "28px, same as toolbars", stat: "recommended", Specimen: R2.FormAt28 },
      { id: "b", label: "32px", stat: "your round 1", Specimen: R2.FormAt32 },
    ],
  },
  {
    id: "D3",
    title: "Icon size at 28px",
    question: "One glyph size for every control",
    status: "open",
    round1: "12px",
    mine: "16px (tap glyph)",
    wide: true,
    options: [
      { id: "a", label: "12px", stat: "your round 1", Specimen: R2.Glyph12 },
      { id: "b", label: "14px", Specimen: R2.Glyph14 },
      { id: "c", label: "16px, the tap glyph", stat: "recommended", Specimen: R2.Glyph16 },
    ],
  },
  {
    id: "D4",
    title: "Meta text size",
    question: "Captions and meta lines under a 13px title",
    status: "open",
    round1: "10px",
    mine: "11px",
    wide: true,
    options: [
      { id: "a", label: "10px", stat: "your round 1", Specimen: R2.Meta10 },
      { id: "b", label: "11px", stat: "recommended", Specimen: R2.Meta11 },
    ],
  },
  {
    id: "D5b",
    title: "Status colour",
    question: "Keep the colour, lose the raw palette?",
    status: "combined",
    round1: "Raw palette (the colour)",
    mine: "Token variants",
    wide: true,
    options: [
      { id: "a", label: "Raw palette classes", stat: "your round 1", Specimen: R2.StatusRaw },
      { id: "b", label: "Same tint, as variants", stat: "combined", Specimen: R2.StatusTinted },
    ],
  },
  {
    id: "D6b",
    title: "Delete",
    question: "Three tiers, each with a rule for when",
    status: "rule",
    round1: "Trash icon mostly; big red when it matters",
    mine: "Same — three tiers",
    wide: true,
    options: [
      { id: "a", label: "Quiet · Confirm · Danger zone", stat: "recommended", Specimen: R2.DeleteTiers },
    ],
  },

  {
    id: "D8",
    title: "Tabs",
    question: "Sections vs filters",
    status: "combined",
    round1: "Underline",
    mine: "Capsule (one system)",
    wide: true,
    options: [
      { id: "a", label: "Underline for both", stat: "your round 1", Specimen: R2.TabsAllUnderline },
      { id: "b", label: "Capsule for both", Specimen: R2.TabsAllCapsule },
      { id: "c", label: "Underline sections, capsule filters", stat: "combined", Specimen: R2.TabsByPurpose },
    ],
  },
  {
    id: "D9",
    title: "Cards, redone",
    question: "Same content, one surface level, three skins",
    status: "open",
    round1: "None — all looked wrong",
    mine: "Bordered",
    wide: true,
    options: [
      { id: "a", label: "Inset (no border)", Specimen: R2.CardInset },
      { id: "b", label: "Bordered", stat: "recommended", Specimen: R2.CardBordered },
      { id: "c", label: "Elevated", Specimen: R2.CardElevated },
    ],
  },
  {
    id: "D11",
    title: "Loading",
    question: "Approve the rule, not one widget",
    status: "rule",
    round1: "Skeleton — matched to each region",
    mine: "Same",
    wide: true,
    options: [
      { id: "a", label: "Each region, its own shaped skeleton", stat: "your rule", Specimen: R2.LoadingMatched },
      { id: "b", label: "One block for the page", stat: "banned", Specimen: R2.LoadingPageBlob },
      { id: "c", label: "One spinner in the middle", stat: "banned", Specimen: R2.LoadingCenterSpinner },
    ],
  },
  {
    id: "D12",
    title: "Empty state",
    question: "Structure of one, colour of the other",
    status: "combined",
    round1: "EmptyStateCard's colour",
    mine: "Icon + title + action structure",
    wide: true,
    options: [
      { id: "a", label: "Combined, dense", stat: "combined", Specimen: R2.EmptyCombinedSpecimen },
      { id: "b", label: "EmptyStateCard today", stat: "your round 1", Specimen: S.EmptyOfficial },
    ],
  },
  {
    id: "D13",
    title: "Toast",
    question: "One component, four layers",
    status: "new",
    round1: "Neither look; copy-for-AI on every toast; layers",
    mine: "Your four-layer spec",
    wide: true,
    options: [
      { id: "a", label: "Four-layer toast (prototype)", stat: "your spec", Specimen: TS.ToastSystemSpecimen },
    ],
  },

  {
    id: "D0f",
    title: "Inner padding",
    question: "Edge to first glyph, the same everywhere?",
    status: "new",
    round1: "Buttons and fields look padded wider than tap",
    mine: "Matched: icon 6px, text 10px",
    wide: true,
    options: [
      { id: "a", label: "Today: 12–14px", Specimen: OC.PadToday },
      { id: "b", label: "Matched to the tap pill", stat: "recommended", Specimen: OC.PadMatched },
      { id: "c", label: "Tight: 8px", Specimen: OC.PadTight },
    ],
  },
  {
    id: "D0g",
    title: "Selected inside a group",
    question: "One outline, even inset on every side",
    status: "new",
    round1: "Double border at the ends",
    mine: "Fixed: even inset, fill not ring",
    wide: true,
    options: [
      { id: "a", label: "Tap group + segmented", stat: "after the fix", Specimen: R2.SelectedInGroup },
    ],
  },
  {
    id: "D0b",
    title: "Field shape",
    question: "Search and select fields",
    status: "new",
    mine: "Capsule, like tap",
    wide: true,
    options: [
      { id: "a", label: "Capsule, like tap", stat: "recommended", Specimen: OC.FieldCapsule },
      { id: "b", label: "8px corners", Specimen: OC.FieldRounded },
    ],
  },
  {
    id: "D0c",
    title: "Control text",
    question: "Label size inside every control",
    status: "new",
    mine: "13px, the tap label",
    wide: true,
    options: [
      { id: "a", label: "13px, tap label", stat: "recommended", Specimen: OC.Label13 },
      { id: "b", label: "12px", Specimen: OC.Label12 },
    ],
  },
  {
    id: "D0e",
    title: "Page density",
    question: "The same screen, today vs the dense defaults",
    status: "new",
    mine: "Dense defaults",
    wide: true,
    options: [
      { id: "a", label: "Today's defaults", stat: "as shipped", Specimen: OC.DensityToday },
      { id: "b", label: "Dense defaults", stat: "recommended", Specimen: OC.DensityDense },
    ],
  },
];
