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

import React, { createContext, useContext } from "react";
import { KindValueFrontDoor } from "@/components/official/structured-value/KindValueFrontDoor";
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

/**
 * Values an ancestor gate already drew through the value door. A kind whose
 * own rendering falls back to a raw viewer for the SAME value (a component's
 * JSON fallback, a crash floor) shows the source there instead of looping.
 */
const RoutedValuesContext = createContext<readonly string[]>([]);

function canonicalJson(data: unknown): string {
  try {
    return JSON.stringify(data) ?? "";
  } catch {
    return "";
  }
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
  const routedAbove = useContext(RoutedValuesContext);
  const candidate = !showSource && valueCarriesKind(data);
  const key = candidate ? canonicalJson(data) : "";
  const kindData = candidate && !routedAbove.includes(key);
  useReportKindAtRawRenderer(component, kindData ? slugOf(data) : null, kindData);
  if (!kindData) {
    // G1: a caller's explicit source view says so in the DOM (leak sentinel).
    return showSource ? (
      <div data-kind-source="explicit" className="contents">
        {children}
      </div>
    ) : (
      <>{children}</>
    );
  }
  return (
    <RoutedValuesContext.Provider value={[...routedAbove, key]}>
      <KindValueFrontDoor value={data} />
    </RoutedValuesContext.Provider>
  );
}

export default KindDataGate;
