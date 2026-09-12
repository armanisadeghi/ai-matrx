"use client";

/**
 * useFailedPrinterGate — "am I about to print on a printer this organization
 * already proved cannot print these labels?"
 *
 * The behaviour is NOT a hard-coded refusal. It is the org-configurable knob
 * `commerce.printer_certification / failed_printer_behavior`
 * (enum `warn` | `block`, platform default `warn`, overridable by the
 * organization) read through the canonical client path
 * (`useScopedKnobs` → `platform.knob_index`), per Arman's 2026-09-11 ruling
 * that live gates become settings the org turns, not blocks in code.
 *
 * Three states, all honest on screen (the host renders
 * `PrinterCertificationNotice`):
 *   warn   — loud in-place warning naming printer, stock and the failed
 *            checks; printing still goes through.
 *   block  — the print is refused, naming the setting and where an admin
 *            changes it (Organization settings → Configuration).
 *   knob unreadable — the RPC failed, or the knob row is not registered:
 *            say so on screen with the remedy and fall back to `warn`.
 *            NEVER a silent constant (feature-knobs: a missing knob raises).
 *
 * The physical printer is chosen in the OS print dialog, which no web page can
 * see — so the gate asks WHICH printer only when this org holds certifications
 * for the stock in hand, remembers that answer per device, and never pretends
 * to know.
 */

import { useEffect, useState } from "react";

import { useScopedKnobs } from "@/lib/scoped-config/useScopedKnobs";

import { listCertificationsForTemplate } from "./service";
import type { CertifiedPrinter } from "./types";

export const PRINTER_CERTIFICATION_FEATURE = "commerce.printer_certification";
export const FAILED_PRINTER_BEHAVIOR_KEY = "failed_printer_behavior";

export type FailedPrinterBehavior = "warn" | "block";

/** The sentinel selection: a printer this org has never certified for the stock. */
export const UNCERTIFIED_PRINTER = "__uncertified__";

export interface FailedPrinterGate {
  /** Live certifications this org holds for THIS label stock. */
  printers: CertifiedPrinter[];
  /** The chosen printer's row id, or UNCERTIFIED_PRINTER. */
  selectedId: string;
  select: (id: string) => void;
  selected: CertifiedPrinter | null;
  /** True once the printer list AND the knob have both answered. */
  ready: boolean;
  /** Effective behaviour — always `warn` when the knob could not be read. */
  behavior: FailedPrinterBehavior;
  /** Non-null when the knob could not be read: what happened + the remedy. */
  knobProblem: string | null;
  /** The chosen printer carries a `failed` verdict for this stock. */
  selectedFailed: boolean;
  /** Failed rows for this stock other than the chosen printer. */
  otherFailed: CertifiedPrinter[];
  /** The print must be refused: a failed choice under `block`. */
  blocked: boolean;
  /** The list read failed — the host says so rather than showing nothing. */
  listError: string | null;
}

/** The checks the admin answered "No" to, in the words they were asked. */
export function failedChecks(printer: CertifiedPrinter): string[] {
  return (printer.resultNotes?.questions ?? [])
    .filter((q) => q.answer === false)
    .map((q) => q.question);
}

export function printerLabel(printer: CertifiedPrinter): string {
  return `${printer.printerMake} ${printer.printerModel}`.trim();
}

function memoryKey(organizationId: string, templateId: string): string {
  return `commerce.labels.printer:${organizationId}:${templateId}`;
}

/** Per-DEVICE memory: which printer this workstation is standing next to. */
function rememberedPrinter(organizationId: string, templateId: string): string | null {
  try {
    return window.localStorage.getItem(memoryKey(organizationId, templateId));
  } catch {
    return null;
  }
}

function rememberPrinter(
  organizationId: string,
  templateId: string,
  id: string,
): void {
  try {
    window.localStorage.setItem(memoryKey(organizationId, templateId), id);
  } catch {
    // A device that refuses storage still prints; it just re-asks next time.
  }
}

export function useFailedPrinterGate(args: {
  organizationId: string | null | undefined;
  templateId: string | null | undefined;
}): FailedPrinterGate {
  const { organizationId, templateId } = args;

  const [printers, setPrinters] = useState<CertifiedPrinter[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string>(UNCERTIFIED_PRINTER);

  useEffect(() => {
    if (!organizationId || !templateId) {
      setPrinters([]);
      return;
    }
    let cancelled = false;
    setPrinters(null);
    setListError(null);
    void listCertificationsForTemplate({ organizationId, templateId })
      .then((rows) => {
        if (cancelled) return;
        setPrinters(rows);
        const remembered = rememberedPrinter(organizationId, templateId);
        const known = remembered && rows.some((r) => r.id === remembered);
        setSelectedId(
          known
            ? remembered
            : rows.length === 1
              ? rows[0].id
              : UNCERTIFIED_PRINTER,
        );
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.error("[commerce-labels] certification read failed", err);
        setPrinters([]);
        setListError(
          err instanceof Error ? err.message : "Unknown database error",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId, templateId]);

  const {
    knobs,
    isLoading: knobsLoading,
    error: knobsError,
  } = useScopedKnobs({
    organizationId,
    featurePrefix: PRINTER_CERTIFICATION_FEATURE,
  });

  const knob = knobs.find((k) => k.key === FAILED_PRINTER_BEHAVIOR_KEY);
  const raw = knob?.effective_value;

  let behavior: FailedPrinterBehavior = "warn";
  let knobProblem: string | null = null;
  if (!organizationId) {
    knobProblem = `No active organization, so this organization's failed-printer setting could not be read. Treating it as "Warn and let me print". Pick an organization from the switcher and reopen this.`;
  } else if (knobsError) {
    knobProblem = `Could not read this organization's failed-printer setting (${knobsError}). Treating it as "Warn and let me print". Reload the page, or ask an admin to check Organization settings → Configuration.`;
  } else if (!knobsLoading && (!knob || knob.origin === "missing")) {
    knobProblem = `This organization's failed-printer setting is not registered, so nothing here can be configured yet. Treating it as "Warn and let me print". Ask an admin to check Organization settings → Configuration.`;
  } else if (raw === "block") {
    behavior = "block";
  } else if (!knobsLoading && knob && raw !== "warn") {
    knobProblem = `This organization's failed-printer setting holds an unrecognised value (${JSON.stringify(raw)}). Treating it as "Warn and let me print". An admin can reset it in Organization settings → Configuration.`;
  }

  const selected =
    printers?.find((p) => p.id === selectedId) ?? null;
  const selectedFailed = selected?.status === "failed";
  const otherFailed = (printers ?? []).filter(
    (p) => p.status === "failed" && p.id !== selectedId,
  );

  return {
    printers: printers ?? [],
    selectedId,
    select: (id: string) => {
      setSelectedId(id);
      if (organizationId && templateId) {
        rememberPrinter(organizationId, templateId, id);
      }
    },
    selected,
    ready: printers !== null && !knobsLoading,
    behavior,
    knobProblem,
    selectedFailed,
    otherFailed,
    blocked: selectedFailed && behavior === "block",
    listError,
  };
}
