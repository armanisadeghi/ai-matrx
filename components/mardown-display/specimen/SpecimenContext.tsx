"use client";

// components/mardown-display/specimen/SpecimenContext.tsx
//
// SPECIMEN MODE — a declared "this content is not real work" state for the
// shared rich-document / markdown renderers.
//
// Why this exists: the Masterwork Bad Example probe generates a document that
// is deliberately wrong, prints "We wrote this. It is meant to look right and
// be wrong." above it — and then the shared table renderer drew a live
// Workbook / Google Sheet / Export / Edit toolbar on it, so an Expert could
// send an AI's knowingly-false certificate of destruction to Google Sheets as
// if it were a real record. (jobs-bar-2026-09-16 lanes-b item C, feedback
// 729b59bd-7485-44ce-bb91-c5d4e3ba48b0.)
//
// A prop on one component would have fixed one screen. This is context, in the
// shared layer, because the actionable controls live several levels below the
// caller (RichDocument → MarkdownStream → block registry → table renderer) and
// EVERY surface that shows generated bad examples inherits the same duty: a
// specimen carries no way out of the screen it was written for.
//
// The contract:
//   - A caller DECLARES the mode. Nothing infers it.
//   - Inside the mode, renderers show no control that moves the content
//     somewhere it could be mistaken for real: export, download, send to a
//     workbook or a Google Sheet, save as a data table, edit, or open in a
//     separate window (which renders OUTSIDE this provider and would carry the
//     full toolbar back).
//   - Nothing fails silently: the banner says what this is and why the usual
//     controls are absent. Controls are ABSENT, never dead or lying.

import * as React from "react";
import { cn } from "@/lib/utils";
import { AlertTriangle } from "lucide-react";

export interface SpecimenMode {
  /** What this document is, in the Expert's words. One short line. */
  label: string;
  /** Why it carries none of the usual actions. One plain sentence. */
  notice: string;
}

export const DEFAULT_SPECIMEN: SpecimenMode = {
  label: "A specimen — written to be wrong",
  notice:
    "Nothing here is a real record, so there is nothing to export, send to a workbook or a sheet, or edit.",
};

const SpecimenContext = React.createContext<SpecimenMode | null>(null);

export function SpecimenProvider({
  value,
  children,
}: {
  value: SpecimenMode;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <SpecimenContext.Provider value={value}>
      {children}
    </SpecimenContext.Provider>
  );
}

/** The declared specimen mode, or null when the content is real work. */
export function useSpecimenMode(): SpecimenMode | null {
  return React.useContext(SpecimenContext);
}

/** True when the surrounding content was declared a specimen. */
export function useIsSpecimen(): boolean {
  return React.useContext(SpecimenContext) !== null;
}

/** Normalizes the caller-facing prop shape into a full SpecimenMode. */
export function resolveSpecimenMode(
  specimen: boolean | Partial<SpecimenMode> | undefined,
): SpecimenMode | null {
  if (!specimen) return null;
  if (specimen === true) return DEFAULT_SPECIMEN;
  return {
    label: specimen.label ?? DEFAULT_SPECIMEN.label,
    notice: specimen.notice ?? DEFAULT_SPECIMEN.notice,
  };
}

/**
 * The banner that stands in for the action surface. Rendered once per
 * document by RichDocument — never per table.
 */
export function SpecimenBanner({
  mode,
  className,
}: {
  mode: SpecimenMode;
  className?: string;
}): React.ReactElement {
  return (
    <div
      data-specimen-banner
      className={cn(
        "mb-2 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-300",
        className,
      )}
    >
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span>
        <span className="font-medium">{mode.label}.</span> {mode.notice}
      </span>
    </div>
  );
}
