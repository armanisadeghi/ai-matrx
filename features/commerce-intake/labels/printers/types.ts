/**
 * features/commerce-intake/labels/printers/types.ts
 *
 * Printer certification — `commerce.certified_printer` (applied + certified
 * live 2026-08-31, migrations/commerce_certified_printer_2026_08_31.sql).
 *
 * The platform SHIPS officially-supported printer recommendations (Brother
 * QL-810W, DYMO LW550, Zebra ZD410 — ruled 2026-08-29). This module is how an
 * admin certifies ANY OTHER printer against a specific label stock: print the
 * @ai-matrx/print calibration page, answer four physical checks, record the
 * verdict. One row = one (printer, stock) pair.
 *
 * Row types project `Database["commerce"]` directly — no hand-declared twins.
 */

import type { LabelTemplate } from "@ai-matrx/print/labels";

import type { Database } from "@/types/database.types";
import type { ListScopeKind } from "@/lib/list-scope/types";

export type CertifiedPrinterRow =
  Database["commerce"]["Tables"]["certified_printer"]["Row"];

/** The live CHECK vocabulary (Supabase renders a CHECK-constrained text as `string`). */
export type CertificationStatus = "certified" | "failed" | "needs_recheck";

export const CERTIFICATION_STATUSES: CertificationStatus[] = [
  "certified",
  "failed",
  "needs_recheck",
];

export function formatCertificationStatus(value: string): string {
  switch (value) {
    case "certified":
      return "Certified";
    case "failed":
      return "Failed";
    case "needs_recheck":
      return "Needs re-check";
    default:
      return value;
  }
}

// ── The physical checks ─────────────────────────────────────────────────────

export interface CertificationCheck {
  id: string;
  /** The question, in the words of someone holding the printed page. */
  question: (template: LabelTemplate) => string;
  /** Why it matters / where to look — shown under the question. */
  hint: (template: LabelTemplate) => string;
}

/**
 * The four checks that decide a certification. Each one is answerable by
 * looking at the printed calibration page against the physical stock; none of
 * them asks the admin to know anything about printing.
 */
export const CERTIFICATION_CHECKS: CertificationCheck[] = [
  {
    id: "outlines_inside_labels",
    question: () =>
      "Are all numbered outlines fully inside their labels?",
    hint: (t) =>
      t.kind === "roll"
        ? "Hold the printed label up: the outline should sit inside the die-cut edge the whole way around, not crossing it."
        : "Hold the printed page against your label sheet. Every outline should sit inside its label, with white showing all around — none clipped by a label edge.",
  },
  {
    id: "crop_marks_at_corners",
    question: (t) =>
      t.kind === "roll"
        ? "Do the crop marks sit at the corners of the label?"
        : "Do the crop marks sit at the sheet corners?",
    hint: (t) =>
      t.kind === "roll"
        ? "There is one small mark near each corner of the printed label. They should be at the corners, not pulled toward the middle."
        : "There are four small corner marks. They should be at the corners of the paper. If they are pulled in toward the middle, the print dialog scaled the page.",
  },
  {
    id: "first_outline_on_first_label",
    question: () => "Is outline #1 where label #1 is on your stock?",
    hint: (t) =>
      t.kind === "roll"
        ? "Outline #1 is the only outline on a roll label — it should cover the label you fed, not the one before or after it."
        : "Outline #1 is the top-left one. It should land on the top-left label of the sheet, not one row down or one column over.",
  },
  {
    id: "printed_at_full_size",
    question: () =>
      "Is the printed page the same size as your stock — nothing shrunk?",
    hint: (t) =>
      t.kind === "roll"
        ? `The label should measure ${t.labelWIn}" × ${t.labelHIn}". If it is smaller, the print dialog was not set to 100% scale.`
        : `The printed sheet should measure ${t.sheetWIn}" × ${t.sheetHIn}". If the image is smaller than the paper, the print dialog was not set to 100% scale with margins off.`,
  },
];

/** What lands in `result_notes` — the per-check answers plus the settings used. */
export interface CertificationResultNotes {
  answers: Record<string, boolean>;
  template_id: string;
  template_name: string;
  stock_code: string;
  /** Every check the wizard asked, so a later reader knows what was answered. */
  questions: { id: string; question: string; answer: boolean }[];
  answered_at: string;
}

// ── UI shapes ───────────────────────────────────────────────────────────────

export interface CertifiedPrinter {
  id: string;
  organizationId: string;
  printerMake: string;
  printerModel: string;
  connectionNote: string | null;
  templateId: string;
  status: CertificationStatus;
  certifiedBy: string | null;
  certifiedAt: string | null;
  resultNotes: CertificationResultNotes | null;
  createdAt: string;
  version: number;
}

/** The list row (the EntityListPage shell's TRow). */
export interface CertifiedPrinterListRow {
  id: string;
  printer_make: string;
  printer_model: string;
  connection_note: string | null;
  template_id: string;
  status: string;
  certified_at: string | null;
  created_at: string;
}

/** Org register: certifications are a team fact, not a personal one. */
export const CERTIFIED_PRINTER_LIST_SCOPES: ListScopeKind[] = ["orgs"];

export const CERTIFIED_PRINTERS_HREF = "/commerce/labels/printers";

/** The wizard, fresh or re-checking an existing row. */
export function certifyPrinterHref(printerId?: string): string {
  return printerId
    ? `${CERTIFIED_PRINTERS_HREF}/certify?id=${printerId}`
    : `${CERTIFIED_PRINTERS_HREF}/certify`;
}

export function printerDisplayName(
  row: Pick<CertifiedPrinterListRow, "printer_make" | "printer_model">,
): string {
  return `${row.printer_make} ${row.printer_model}`.trim();
}
