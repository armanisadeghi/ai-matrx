"use client";

/**
 * The contested UI patterns, one entry per decision. Counts are the real
 * call-site numbers from the 2026-10-01 AST census (9,761 .tsx files); an
 * option without a census figure carries no `stat`.
 */

import type { ComponentType } from "react";
import * as S from "./specimens";

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
    id: "D1",
    title: "Toolbar height",
    question: "Which height do all toolbar controls share?",
    wide: true,
    options: [
      { id: "a", label: "Today, mixed", stat: "as shipped", Specimen: S.ToolbarCurrent },
      { id: "b", label: "28px, the tap capsule", stat: "1,440 sites", Specimen: S.Toolbar28 },
      { id: "c", label: "32px, the tap pill", stat: "2,695 sites", Specimen: S.Toolbar32 },
      { id: "d", label: "36px, today's default", stat: "113 sites", Specimen: S.Toolbar36 },
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
    id: "D1c",
    title: "Size scale",
    question: "How many heights does the one scale have?",
    wide: true,
    options: [
      { id: "a", label: "Five: 24 · 28 · 32 · 36 · 40", Specimen: S.Rungs5 },
      { id: "b", label: "Three: 28 · 32 · 36", Specimen: S.Rungs3 },
      { id: "c", label: "Two: 28 · 36", Specimen: S.Rungs2 },
    ],
  },
  {
    id: "D2",
    title: "Form field height",
    question: "How tall is a standard form row?",
    wide: true,
    options: [
      { id: "a", label: "40px input, 36px rest", stat: "992 sites", Specimen: S.FieldInput },
      { id: "b", label: "All 36px", Specimen: S.FieldBasicInput },
      { id: "c", label: "All 32px", stat: "410 inputs", Specimen: S.Field32 },
    ],
  },
  {
    id: "D3",
    title: "Icon size in small buttons",
    question: "How big is an icon inside a small button?",
    options: [
      { id: "a", label: "16px (today)", stat: "3,613 ignored", Specimen: S.Icon16 },
      { id: "b", label: "14px", stat: "1,521 sites", Specimen: S.Icon14 },
      { id: "c", label: "12px", stat: "603 sites", Specimen: S.Icon12 },
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
    id: "D7",
    title: "Icon button",
    question: "Which icon-only button is canonical?",
    options: [
      { id: "a", label: "size=icon (36)", stat: "as shipped", Specimen: S.IconBtnDefault },
      { id: "b", label: "size=icon-sm (28)", stat: "7 + 179 sites", Specimen: S.IconBtnSm },
      { id: "c", label: "h-6 w-6 p-0 (24)", stat: "173 sites", Specimen: S.IconBtn24 },
      { id: "d", label: "Official IconButton", stat: "25 importers", Specimen: S.IconBtnOfficial },
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
