"use client";

// components/official/structured-value/KindDataGate.tsx
//
// THE BOTTOM-LAYER REFUSAL for raw data viewers (the JSON tree, the path
// explorer, the JSON inspector, the value grid's JSON fallback). Handed data
// that carries a kind anywhere — the one detector, `valueCarriesKind` — the
// viewer draws it through the one value door (`AnswerValueView`) instead of as
// source, and files the caller in the Error Inspector (Arman, 2026-09-30: a
// kind is never drawn as raw JSON). A deliberate source view (admin debug
// windows, a "Raw" tab, a "Show the raw data" escape) passes `showSource`.

import React from "react";
import { AnswerValueView } from "@/components/official/structured-value/AnswerValueView";
import {
  firstKindSlug,
  rootKindSlug,
  valueCarriesKind,
} from "@/features/content-ir/surfaces/json-kind-signal";
import { useReportKindAtRawRenderer } from "@/features/content-ir/surfaces/report-kind-at-raw-renderer";

export interface KindDataGateProps {
  /** The viewer's own name, for the report. */
  component: string;
  data: unknown;
  /** A deliberate source view: show the data as written. */
  showSource?: boolean;
  children: React.ReactNode;
}

function slugOf(data: unknown): string | null {
  return typeof data === "string" ? firstKindSlug(data) : rootKindSlug(data);
}

export function KindDataGate({
  component,
  data,
  showSource = false,
  children,
}: KindDataGateProps) {
  const kindData = !showSource && valueCarriesKind(data);
  useReportKindAtRawRenderer(component, kindData ? slugOf(data) : null, kindData);
  if (kindData) return <AnswerValueView value={data} />;
  return <>{children}</>;
}

export default KindDataGate;
