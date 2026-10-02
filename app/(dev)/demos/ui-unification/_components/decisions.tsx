"use client";

/**
 * The contested UI patterns, one entry per decision. Counts are the real
 * call-site numbers from the 2026-10-01 AST census (9,761 .tsx files); an
 * option without a census figure carries no `stat`.
 */

import type { ComponentType } from "react";
import * as S from "./specimens";
import * as OC from "./one-control";

export interface DecisionOption {
  id: string;
  label: string;
  stat?: string;
  Specimen: ComponentType;
}

export interface Decision {
  id: string;
  title: string;
  question: string;
  /** One option per row — for specimens that are full toolbars. */
  wide?: boolean;
  options: DecisionOption[];
}

export const DECISIONS: Decision[] = [
  {
    id: "D0",
    title: "One control system",
    question: "Every control, the same object as a tap button?",
    wide: true,
    options: [
      { id: "a", label: "Today, mixed", stat: "as shipped", Specimen: OC.OneToday },
      { id: "b", label: "One system at 32px", stat: "today's tap pill", Specimen: OC.OneAt32 },
      { id: "c", label: "One system at 28px", stat: "recommended", Specimen: OC.OneAt28 },
    ],
  },
  {
    id: "D0b",
    title: "Field shape",
    question: "Search and select fields at 28px",
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
    wide: true,
    options: [
      { id: "a", label: "13px, tap label", stat: "recommended", Specimen: OC.Label13 },
      { id: "b", label: "12px", Specimen: OC.Label12 },
    ],
  },
  {
    id: "D0d",
    title: "Icon size at 28px",
    question: "Glyph inside every control",
    wide: true,
    options: [
      { id: "a", label: "16px, tap glyph", stat: "recommended", Specimen: OC.Icon16At28 },
      { id: "b", label: "14px", Specimen: OC.Icon14At28 },
    ],
  },
  {
    id: "D0e",
    title: "Page density",
    question: "The same screen, today vs the dense defaults",
    wide: true,
    options: [
      { id: "a", label: "Today's defaults", stat: "as shipped", Specimen: OC.DensityToday },
      { id: "b", label: "Dense defaults", stat: "recommended", Specimen: OC.DensityDense },
    ],
  },

  {
    id: "D1b",
    title: "Touch screens",
    question: "What does a phone do to a small control?",
    wide: true,
    options: [
      { id: "a", label: "Row grows to 44px", stat: "Button today", Specimen: S.TouchGrows },
      { id: "b", label: "Invisible 44px hit area", stat: "tap system", Specimen: S.TouchHitArea },
    ],
  },



  {
    id: "D4",
    title: "Micro text size",
    question: "Which size for badges, meta and captions?",
    options: [
      { id: "a", label: "10px", stat: "5,566 sites", Specimen: S.Micro10 },
      { id: "b", label: "11px", stat: "6,187 sites", Specimen: S.Micro11 },
      { id: "c", label: "12px (text-xs)", stat: "19,929 sites", Specimen: S.Micro12 },
    ],
  },
  {
    id: "D5",
    title: "Badge shape",
    question: "Which badge is the one badge?",
    options: [
      { id: "a", label: "Package outline", stat: "1,231 sites", Specimen: S.BadgeOutline },
      { id: "b", label: "Small override", stat: "~965 sites", Specimen: S.BadgeSmallOverride },
      { id: "c", label: "Dense-rules pill", Specimen: S.BadgePill },
    ],
  },
  {
    id: "D5b",
    title: "Status badge colour",
    question: "How does a badge show status?",
    options: [
      { id: "a", label: "Variants", Specimen: S.StatusVariants },
      { id: "b", label: "Raw palette", stat: "154 sites", Specimen: S.StatusRawPalette },
    ],
  },
  {
    id: "D6",
    title: "Quiet icon buttons",
    question: "How do row actions look at rest?",
    options: [
      { id: "a", label: "Ghost", stat: "as shipped", Specimen: S.QuietGhost },
      { id: "b", label: "Ghost muted", stat: "447 sites", Specimen: S.QuietMuted },
      { id: "c", label: "Subtle variant", Specimen: S.QuietSubtle },
    ],
  },
  {
    id: "D6b",
    title: "Destructive row action",
    question: "How does Delete look inside a row?",
    options: [
      { id: "a", label: "Solid destructive", stat: "111 sites", Specimen: S.DestructiveSolid },
      { id: "b", label: "Ghost destructive", stat: "222 sites", Specimen: S.DestructiveGhost },
    ],
  },

  {
    id: "D8",
    title: "Tabs style",
    question: "Which tab bar is the one tab bar?",
    options: [
      { id: "a", label: "Pill TabsList", stat: "as shipped", Specimen: S.TabsPill },
      { id: "b", label: "Underline override", stat: "~34 triggers", Specimen: S.TabsLine },
      { id: "c", label: "SegmentedControl", stat: "14 files", Specimen: S.TabsSegmented },
      { id: "d", label: "Hand-rolled buttons", stat: "~104 files", Specimen: S.TabsHandRolled },
    ],
  },
  {
    id: "D9",
    title: "Card density",
    question: "Which card density is the default?",
    options: [
      { id: "a", label: "Host default (sm)", stat: "787 cards", Specimen: S.CardHostDefault },
      { id: "b", label: "Card size=md", stat: "0 sites", Specimen: S.CardMd },
      { id: "c", label: "Card + p-4", stat: "187 sites", Specimen: S.CardPadded },
      { id: "d", label: "Hand-rolled div", stat: "2,808 sites", Specimen: S.CardHandRolled },
    ],
  },
  {
    id: "D10",
    title: "Dialog width",
    question: "Which width is the default dialog?",
    options: [
      { id: "a", label: "max-w-md", stat: "92+ sites", Specimen: S.DialogMd },
      { id: "b", label: "max-w-lg (default)", stat: "87 restate", Specimen: S.DialogLg },
      { id: "c", label: "max-w-2xl", stat: "87 sites", Specimen: S.Dialog2xl },
      { id: "d", label: "max-w-3xl", stat: "31 sites", Specimen: S.Dialog3xl },
    ],
  },
  {
    id: "D11",
    title: "Loading indicator",
    question: "What shows while a region loads?",
    options: [
      { id: "a", label: "Loader2 spin", stat: "3,017 uses", Specimen: S.LoadSpin },
      { id: "b", label: "LoadingSpinner", stat: "25 importers", Specimen: S.LoadSpinner },
      { id: "c", label: "MatrxMiniLoader", stat: "56 files", Specimen: S.LoadMini },
      { id: "d", label: "Skeleton bars", stat: "321 files", Specimen: S.LoadSkeleton },
    ],
  },
  {
    id: "D12",
    title: "Empty state",
    question: "What does an empty list show?",
    options: [
      { id: "a", label: "Muted text", Specimen: S.EmptyText },
      { id: "b", label: "Icon + title + action", Specimen: S.EmptyComposed },
      { id: "c", label: "Dashed box", Specimen: S.EmptyDashed },
      { id: "d", label: "EmptyStateCard", stat: "2 importers", Specimen: S.EmptyOfficial },
    ],
  },
  {
    id: "D13",
    title: "Toasts",
    question: "Which toast API survives?",
    options: [
      { id: "a", label: "lib/toast", stat: "1,550 files", Specimen: S.ToastCanonical },
      { id: "b", label: "Legacy useToast", stat: "92 files", Specimen: S.ToastLegacy },
    ],
  },
  {
    id: "D14",
    title: "Surface corner radius",
    question: "Which radius do panels and cards use?",
    options: [
      { id: "a", label: "rounded-md", stat: "6,175 sites", Specimen: S.RadiusMd },
      { id: "b", label: "rounded-lg", stat: "3,999 sites", Specimen: S.RadiusLg },
      { id: "c", label: "rounded-xl", stat: "1,511 sites", Specimen: S.RadiusXl },
    ],
  },
  {
    id: "D15",
    title: "Phone page structure",
    question: "How is a screen built at phone width?",
    wide: true,
    options: [
      { id: "a", label: "Cards inside cards", stat: "common today", Specimen: S.PhoneNested },
      { id: "b", label: "Flat rows, hairlines", Specimen: S.PhoneFlat },
      { id: "c", label: "Inset grouped (iOS)", Specimen: S.PhoneInsetGrouped },
    ],
  },
];
