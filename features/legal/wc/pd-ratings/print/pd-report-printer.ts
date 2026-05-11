/**
 * PD Ratings Report — BlockPrinter
 *
 * Builds a clean, attorney-friendly printable report of the California PD
 * rating calculation. Two variants:
 *
 *   full      — Applicant info, summary, per-side formulas, injuries table,
 *               per-injury detail with warnings, disclaimer
 *   summary   — One-page summary (applicant + final % + comp + per-side)
 *
 * Self-contained: pure string assembly + window.open() via the shared
 * block-print-utils.
 */

import {
  buildPrintDocument,
  escapeHtml,
  openPrintWindow,
  type BlockPrinter,
  type PrintSettings,
} from "@/features/chat/utils/block-print-utils";
import { formatCurrency, formatNumber } from "../lib/formulas";
import type {
  StatelessRatingResponse,
  WcImpairmentDefinitionRead,
} from "../api/types";
import type { RatingDraft, InjuryDraft } from "../state/types";

// ─── Types ──────────────────────────────────────────────────────────────────

export type PdReportVariant = "full" | "summary";

export interface PdReportData {
  draft: RatingDraft;
  result: StatelessRatingResponse | null;
  /** Lookup table for impairment definitions by id (for unrated injuries). */
  impairmentCatalog: Record<string, WcImpairmentDefinitionRead> | null;
  occupationLabel: string | null;
}

// ─── Side helpers ───────────────────────────────────────────────────────────

const SIDE_LABELS: Record<string, string> = {
  left: "Left",
  right: "Right",
  default: "Bilateral",
};

const SIDE_ORDER = ["left", "right", "default"] as const;

function sideLabel(side: string): string {
  return SIDE_LABELS[side] ?? side;
}

function sortSides(sides: string[]): string[] {
  const known = SIDE_ORDER.filter((s) => sides.includes(s));
  const unknown = sides.filter(
    (s) => !SIDE_ORDER.includes(s as (typeof SIDE_ORDER)[number]),
  );
  return [...known, ...unknown];
}

// ─── Date helpers ───────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatToday(): string {
  return new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// ─── Cell helpers ───────────────────────────────────────────────────────────

function pctOrDash(value: number | null): string {
  if (value == null) return "—";
  return `${value}%`;
}

function safeText(
  value: string | number | null | undefined,
  fallback = "—",
): string {
  if (value === null || value === undefined) return fallback;
  const s = String(value).trim();
  return s.length === 0 ? fallback : escapeHtml(s);
}

// ─── Resolve a definition for a draft injury ────────────────────────────────

function resolveDefinition(
  injury: InjuryDraft,
  rated: StatelessRatingResponse | null,
  catalog: Record<string, WcImpairmentDefinitionRead> | null,
  index: number,
): WcImpairmentDefinitionRead | null {
  if (rated && rated.injuries[index]) {
    return rated.injuries[index].impairment_definition;
  }
  if (catalog && injury.impairment_definition_id) {
    return catalog[injury.impairment_definition_id] ?? null;
  }
  return null;
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const PD_REPORT_STYLES = `
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
    color: #0f172a;
    line-height: 1.4;
    font-size: 10.5pt;
    max-width: 8.5in;
    margin: 0 auto;
    padding: 14px 24px;
    background: #fff;
  }

  /* ── Report header ── */
  .report-header {
    border-bottom: 2px solid #1e293b;
    padding-bottom: 10px;
    margin-bottom: 12px;
  }
  .report-header .eyebrow {
    font-size: 8pt;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #475569;
    margin-bottom: 3px;
  }
  .report-header h1 {
    font-size: 17pt;
    font-weight: 700;
    color: #0f172a;
    letter-spacing: -0.01em;
    margin: 0;
    line-height: 1.15;
  }
  .report-header .subtitle {
    font-size: 9pt;
    color: #64748b;
    margin-top: 3px;
  }

  /* ── Applicant info grid ──
   * 4-column grid; long values (Occupation, Weekly earnings) span 2
   * columns so multi-word occupational titles like "350 · DRIVER,
   * NEWSPAPER DELIVERY" stay on one line. */
  .info-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 6px 14px;
    margin: 10px 0 14px;
    padding: 9px 12px;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
  }
  .info-cell {
    min-width: 0;
  }
  .info-cell.wide {
    grid-column: span 2;
  }
  .info-cell .label {
    font-size: 7pt;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #64748b;
    margin-bottom: 1px;
  }
  .info-cell .value {
    font-size: 9.5pt;
    font-weight: 600;
    color: #0f172a;
    line-height: 1.25;
  }
  .info-cell .value.muted {
    color: #94a3b8;
    font-weight: 400;
  }

  /* ── Sections ── */
  section.block { margin: 14px 0; }

  h2.section-title {
    font-size: 10pt;
    font-weight: 700;
    color: #0f172a;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    border-bottom: 1px solid #cbd5e1;
    padding-bottom: 3px;
    margin: 0 0 6px;
  }

  /* ── Final rating callout ── */
  .final-card {
    display: grid;
    grid-template-columns: 1fr 2fr;
    gap: 14px;
    align-items: center;
    padding: 12px 16px;
    background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
    border: 1.5px solid #cbd5e1;
    border-radius: 8px;
  }
  .final-card .final-rating {
    text-align: left;
  }
  .final-card .final-rating .label {
    font-size: 7.5pt;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #475569;
  }
  .final-card .final-rating .value {
    font-size: 32pt;
    font-weight: 700;
    color: #0f172a;
    letter-spacing: -0.02em;
    line-height: 1;
    margin-top: 2px;
    font-variant-numeric: tabular-nums;
  }
  .final-card .final-rating .value .percent {
    font-size: 18pt;
    color: #64748b;
    margin-left: 2px;
    font-weight: 600;
  }

  .comp-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px 14px;
  }
  .comp-cell .label {
    font-size: 7pt;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #64748b;
  }
  .comp-cell .value {
    font-size: 12pt;
    font-weight: 700;
    color: #0f172a;
    margin-top: 1px;
    font-variant-numeric: tabular-nums;
    line-height: 1.1;
  }

  /* ── Per-side ──
   * Single-column stacked rows. Letter-portrait cannot fit three cards
   * side-by-side with the formulas WC engines emit (~45 chars), so we
   * give each side a full-width row with an inline label/total header
   * (matches the on-screen RatingBreakdownTable alignment) and the
   * formula list flowing below it on full width. This guarantees
   * formulas never wrap and keeps the side/% pair tightly aligned. */
  .side-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 6px;
  }
  .side-card {
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    padding: 5px 10px 6px;
    background: #fff;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .side-card .side-header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
  }
  .side-card .label {
    font-size: 8pt;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #475569;
  }
  .side-card .total {
    font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
    font-size: 11pt;
    font-weight: 700;
    color: #0f172a;
    font-variant-numeric: tabular-nums;
    line-height: 1;
  }
  .side-card ul {
    margin: 2px 0 0;
    padding: 0;
    list-style: none;
  }
  .side-card li {
    font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
    font-size: 8.5pt;
    color: #475569;
    line-height: 1.35;
    white-space: nowrap;
  }

  /* ── Tables ──
   * table-layout: fixed + explicit colgroup widths so the Impairment
   * column gets enough room for full names like "Cervical Diagnosis-
   * related Estimate (DRE)" without wrapping, while the seven narrow
   * numeric columns stay compact. */
  table.report-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 9pt;
    table-layout: fixed;
  }
  table.report-table col.col-num { width: 26px; }
  /* AMA codes ("16.05.01.00", "15.03.02.04 [5]") run wide enough to
   * collide with the Side column when this is too tight. The extra
   * room comes from the @page margin reduction below — Impairment
   * gives up only a couple of characters. */
  table.report-table col.col-code { width: 92px; }
  /* "Bilateral" is the longest Side label and needs room to breathe. */
  table.report-table col.col-side { width: 58px; }
  table.report-table col.col-pct { width: 44px; }
  table.report-table thead th {
    background: #1e293b;
    color: #f8fafc;
    text-align: left;
    padding: 5px 8px;
    font-size: 7pt;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    border: none;
  }
  table.report-table thead th.num { text-align: right; }
  table.report-table tbody td {
    padding: 4px 8px;
    border-bottom: 1px solid #e2e8f0;
    vertical-align: top;
    line-height: 1.35;
  }
  table.report-table tbody td.num {
    text-align: right;
    font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
    font-variant-numeric: tabular-nums;
  }
  table.report-table tbody td.code {
    font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
    color: #64748b;
    white-space: nowrap;
    font-size: 8.5pt;
  }
  table.report-table tbody tr:nth-child(even) td {
    background: #f8fafc;
  }
  table.report-table tbody tr.warning-row td {
    padding: 3px 8px 6px;
    border-bottom: 1px solid #e2e8f0;
    background: #fef3c7;
    font-size: 8pt;
    color: #78350f;
    line-height: 1.35;
  }
  table.report-table tbody tr.warning-row td ul {
    margin: 0;
    padding-left: 14px;
  }
  table.report-table tbody tr.warning-row td li {
    margin-bottom: 1px;
  }

  /* ── Notes ──
   * Renders right under the injuries table; the section.block margin
   * gives enough breathing room. Inline label (no separate row) so
   * a one-bullet note stays a single visual line. */
  .notes-card {
    border: 1px solid #fbbf24;
    background: #fef3c7;
    border-radius: 6px;
    padding: 6px 10px;
    color: #78350f;
    font-size: 8.5pt;
    line-height: 1.35;
  }
  .notes-card .label {
    font-size: 7pt;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #92400e;
    margin-right: 8px;
  }
  .notes-card .inline-note { display: inline; }
  .notes-card ul { margin: 2px 0 0; padding-left: 14px; }
  .notes-card li { margin-bottom: 1px; }

  /* ── Comments ──
   * Free-form attorney notes rendered after the rating detail. On a
   * typical case with short notes it stays on page 1; with long notes
   * it naturally flows to page 2. The section header carries an
   * applicant + final-rating suffix so when comments do land on a new
   * page, the reader still sees whose case this is and what the
   * headline rating was — no need for a separate running header. */
  .comments-block {
    margin: 16px 0 0;
    page-break-inside: auto;
    break-inside: auto;
  }
  .comments-block .comments-header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    border-bottom: 1px solid #cbd5e1;
    padding-bottom: 3px;
    margin-bottom: 6px;
  }
  .comments-block .comments-header .title {
    font-size: 10pt;
    font-weight: 700;
    color: #0f172a;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    margin: 0;
  }
  .comments-block .comments-header .context {
    font-size: 8.5pt;
    color: #64748b;
    font-weight: 500;
    line-height: 1.2;
  }
  .comments-block .comments-header .context .rating {
    color: #0f172a;
    margin-left: 6px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .comments-body {
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    padding: 10px 12px;
    background: #fafafa;
    color: #0f172a;
    font-size: 9.5pt;
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-word;
  }

  /* ── Disclaimer ── */
  .disclaimer {
    margin-top: 14px;
    padding-top: 8px;
    border-top: 1px solid #cbd5e1;
    font-size: 7.5pt;
    color: #64748b;
    line-height: 1.4;
  }
  .disclaimer strong { color: #475569; }

  /* ── Phase 3 compensation detail ── */
  .adjustment-card {
    border-radius: 6px;
    padding: 7px 10px;
    margin-top: 6px;
    page-break-inside: avoid;
    border: 1px solid;
  }
  .adjustment-card.bump {
    background: #ecfdf5;
    border-color: #6ee7b7;
    color: #065f46;
  }
  .adjustment-card.cut {
    background: #fef3c7;
    border-color: #fbbf24;
    color: #78350f;
  }
  .adjustment-card .adjustment-header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
  }
  .adjustment-card .adjustment-header .label {
    font-size: 8pt;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .adjustment-card .adjustment-header .value {
    font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
    font-size: 11pt;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .adjustment-card .reason {
    margin-top: 2px;
    font-size: 8.5pt;
    line-height: 1.35;
  }

  .life-pension-card {
    margin-top: 6px;
    border: 1px solid #c7d2fe;
    background: #eef2ff;
    border-radius: 6px;
    padding: 7px 10px;
    page-break-inside: avoid;
  }
  .life-pension-card .lp-header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
  }
  .life-pension-card .lp-header .label {
    font-size: 8pt;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #3730a3;
  }
  .life-pension-card .lp-header .value {
    font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
    font-size: 11pt;
    font-weight: 700;
    color: #1e1b4b;
    font-variant-numeric: tabular-nums;
  }
  .life-pension-card .lp-note {
    margin-top: 2px;
    font-size: 8.5pt;
    color: #4338ca;
    line-height: 1.35;
  }

  /* ── Phase 2 rating-breakdown table ──
   * 13-column grid for the structured math chain. Cells are tiny but
   * letter-portrait can fit it because every column except AMA code is
   * a 1-3 digit number. */
  table.report-table.breakdown-table {
    font-size: 8.5pt;
  }
  table.report-table col.col-letter { width: 36px; }
  table.report-table col.col-ag { width: 30px; }
  table.report-table tbody td.final-pd {
    font-weight: 700;
    color: #0f172a;
  }

  /* ── Empty state ── */
  .empty-result {
    border: 1px dashed #cbd5e1;
    border-radius: 6px;
    padding: 18px;
    text-align: center;
    color: #64748b;
    font-size: 9.5pt;
  }

  /* ── Print rules ── */
  @media print {
    /* Tight @page margins (0.35in top/bottom, 0.4in left/right) buy
     * back ~0.3in of horizontal printable width so the injuries table
     * isn't fighting for room. All major browsers and laser printers
     * tolerate ≥0.25in; this stays comfortably inside that envelope. */
    @page { size: letter portrait; margin: 0.35in 0.4in; }
    body { padding: 0; max-width: 100%; }
    .report-header, .final-card, .info-grid, .side-card,
    .notes-card, .comments-body, table.report-table thead {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .side-card, .info-grid { page-break-inside: avoid; }
    table.report-table { page-break-inside: auto; }
    table.report-table tr { page-break-inside: avoid; page-break-after: auto; }
    /* Keep the comments header glued to the first lines of the body
     * so a page break never orphans the title from the prose. */
    .comments-block .comments-header { page-break-after: avoid; }
    .comments-body { orphans: 3; widows: 3; }
  }
`;

// ─── Section builders ───────────────────────────────────────────────────────

function renderReportHeader(
  data: PdReportData,
  finalRating: number | null,
): string {
  const applicant =
    data.draft.claim.applicant_name?.trim() || "Unnamed applicant";
  const ratingLabel =
    finalRating != null
      ? `${formatNumber(finalRating, 0)}% Final PD`
      : "Calculation pending";

  return `<header class="report-header">
  <div class="eyebrow">California Workers' Compensation</div>
  <h1>PD Rating Report — ${safeText(applicant)}</h1>
  <div class="subtitle">${escapeHtml(ratingLabel)} · Generated ${escapeHtml(formatToday())}</div>
</header>`;
}

function renderInfoGrid(data: PdReportData): string {
  const { claim } = data.draft;

  // 4-column grid. The required rating-critical fields are always
  // rendered; the optional record-keeping fields (gender, case number,
  // evaluator) only appear when the user has filled them in, so a
  // bare-bones case doesn't get a noisy "—" wall.
  //
  // Layout when all optional fields are set:
  //   Row 1: Applicant       | DOI   | DOB   | Age at DOI
  //   Row 2: Occupation (×2)         | Weekly earnings (×2)
  //   Row 3: Case number (×2)        | Evaluator (×2)
  //   Row 4: Gender
  //
  // When optional fields are absent the trailing rows simply collapse,
  // which is critical for the single-page goal.
  type Cell = {
    label: string;
    value: string;
    muted?: boolean;
    wide?: boolean;
  };
  const cells: Cell[] = [
    {
      label: "Applicant",
      value: claim.applicant_name?.trim() || "—",
      muted: !claim.applicant_name?.trim(),
    },
    {
      label: "Date of injury",
      value: formatDate(claim.date_of_injury),
      muted: !claim.date_of_injury,
    },
    {
      label: "Date of birth",
      value: formatDate(claim.date_of_birth),
      muted: !claim.date_of_birth,
    },
    {
      label: "Age at DOI",
      value: claim.age_at_doi != null ? String(claim.age_at_doi) : "—",
      muted: claim.age_at_doi == null,
    },
    {
      label: "Occupation",
      value: data.occupationLabel
        ? `${claim.occupational_code} · ${data.occupationLabel}`
        : claim.occupational_code != null
          ? String(claim.occupational_code)
          : "—",
      muted: claim.occupational_code == null,
      wide: true,
    },
    {
      label: "Weekly earnings",
      value:
        claim.weekly_earnings != null
          ? formatCurrency(claim.weekly_earnings)
          : "—",
      muted: claim.weekly_earnings == null,
      wide: true,
    },
  ];

  if (claim.case_number?.trim()) {
    cells.push({
      label: "Case number",
      value: claim.case_number.trim(),
      wide: true,
    });
  }
  if (claim.evaluator_name?.trim()) {
    cells.push({
      label: "Evaluator",
      value: claim.evaluator_name.trim(),
      wide: true,
    });
  }
  if (claim.gender?.trim()) {
    cells.push({ label: "Gender", value: claim.gender.trim() });
  }
  // Phase 3 compensation context — only rendered when relevant. The
  // §4658(d) rule only applies for DOI 2005-2012, so we'd show these
  // anyway when they're set; collapses for clean cases.
  if (claim.p_s_date) {
    cells.push({ label: "P&S date", value: formatDate(claim.p_s_date) });
  }
  if (claim.job_offer_date) {
    cells.push({
      label: "Job offer date",
      value: formatDate(claim.job_offer_date),
    });
  }
  if (claim.large_employer) {
    cells.push({ label: "Large employer", value: "Yes (50+)" });
  }

  const html = cells
    .map(
      (c) =>
        `<div class="info-cell${c.wide ? " wide" : ""}">
    <div class="label">${escapeHtml(c.label)}</div>
    <div class="value${c.muted ? " muted" : ""}">${safeText(c.value)}</div>
  </div>`,
    )
    .join("\n");

  return `<div class="info-grid">${html}</div>`;
}

function renderFinalRatingCard(result: StatelessRatingResponse | null): string {
  const combined = result?.result?.combined_rating;
  const compensation = result?.result?.compensation;
  const finalRating = combined?.final_rating;

  if (result == null || finalRating == null) {
    return `<div class="empty-result">
  Rating not yet calculated — add the claim details and at least one injury, then re-print.
</div>`;
  }

  const finalValue = `${formatNumber(finalRating, 0)}<span class="percent">%</span>`;
  const comp =
    compensation?.compensation != null
      ? formatCurrency(compensation.compensation)
      : "—";
  const weeks =
    compensation?.weeks != null ? formatNumber(compensation.weeks, 2) : "—";
  const days =
    compensation?.days != null ? formatNumber(compensation.days, 0) : "—";

  return `<div class="final-card">
  <div class="final-rating">
    <div class="label">Final PD rating</div>
    <div class="value">${finalValue}</div>
  </div>
  <div class="comp-grid">
    <div class="comp-cell">
      <div class="label">Compensation</div>
      <div class="value">${escapeHtml(comp)}</div>
    </div>
    <div class="comp-cell">
      <div class="label">Weeks</div>
      <div class="value">${escapeHtml(weeks)}</div>
    </div>
    <div class="comp-cell">
      <div class="label">Days</div>
      <div class="value">${escapeHtml(days)}</div>
    </div>
  </div>
</div>`;
}

/** Phase 3 compensation block: weekly rate, daily rate, §4658(d) badge,
 *  Life Pension. Only renders when the calc has produced these fields.
 *  Keeps things compact: a 2-up rate row, a callout when bump/cut applies,
 *  and a Life Pension card when ≥ 70%. */
function renderCompensationDetail(
  result: StatelessRatingResponse | null,
): string {
  const compensation = result?.result?.compensation as
    | {
        weekly_payment?: number | null;
        daily_rate?: number | null;
        pd_adjustment_pct?: number | null;
        pd_adjustment_reason?: string | null;
        life_pension_weekly?: number | null;
      }
    | undefined;
  if (!compensation) return "";

  const weeklyPayment = compensation.weekly_payment ?? null;
  const dailyRate = compensation.daily_rate ?? null;
  const adjustmentPct = compensation.pd_adjustment_pct ?? 0;
  const adjustmentReason = compensation.pd_adjustment_reason ?? "";
  const lp = compensation.life_pension_weekly ?? 0;

  // If none of the new fields are populated, render nothing — old saved
  // cases that pre-date Phase 3 don't get a half-empty section.
  if (!weeklyPayment && !dailyRate && adjustmentPct === 0 && !lp) {
    return "";
  }

  const ratesHtml =
    weeklyPayment || dailyRate
      ? `<div class="comp-grid" style="grid-template-columns: repeat(2, 1fr); margin-bottom: 8px;">
    <div class="comp-cell">
      <div class="label">Weekly rate</div>
      <div class="value">${escapeHtml(
        weeklyPayment != null ? formatCurrency(weeklyPayment) : "—",
      )}</div>
    </div>
    <div class="comp-cell">
      <div class="label">Daily rate</div>
      <div class="value">${escapeHtml(
        dailyRate != null ? formatCurrency(dailyRate) : "—",
      )}</div>
    </div>
  </div>`
      : "";

  const adjustmentHtml =
    adjustmentPct !== 0
      ? `<div class="adjustment-card ${adjustmentPct > 0 ? "bump" : "cut"}">
    <div class="adjustment-header">
      <span class="label">LC §4658(d) adjustment</span>
      <span class="value">${adjustmentPct > 0 ? "+" : ""}${adjustmentPct}%</span>
    </div>
    ${adjustmentReason ? `<div class="reason">${escapeHtml(adjustmentReason)}</div>` : ""}
  </div>`
      : "";

  const lifePensionHtml =
    lp > 0
      ? `<div class="life-pension-card">
    <div class="lp-header">
      <span class="label">Life pension (LC §4659)</span>
      <span class="value">${escapeHtml(formatCurrency(lp))} / week</span>
    </div>
    <div class="lp-note">Paid for life after the regular PD payments end.</div>
  </div>`
      : "";

  return `<section class="block">
  <h2 class="section-title">Compensation detail</h2>
  ${ratesHtml}
  ${adjustmentHtml}
  ${lifePensionHtml}
</section>`;
}

function renderPerSideBreakdown(
  result: StatelessRatingResponse | null,
  showFormulas: boolean,
): string {
  const ratings = result?.result?.combined_rating?.ratings;
  if (!ratings || Object.keys(ratings).length === 0) return "";

  const sides = sortSides(Object.keys(ratings));
  const cards = sides
    .map((side) => {
      const sideData = ratings[side];
      const formulasHtml =
        showFormulas && sideData.ratings.length > 0
          ? `<ul>${sideData.ratings
              .map((r) => `<li>${escapeHtml(r.formula)}</li>`)
              .join("")}</ul>`
          : "";
      return `<div class="side-card">
  <div class="side-header">
    <span class="label">${escapeHtml(sideLabel(side))}</span>
    <span class="total">${formatNumber(sideData.total, 0)}%</span>
  </div>
  ${formulasHtml}
</div>`;
    })
    .join("\n");

  return `<section class="block">
  <h2 class="section-title">Per-side breakdown</h2>
  <div class="side-grid">${cards}</div>
</section>`;
}

function renderInjuriesTable(
  data: PdReportData,
  showInjuryNotes: boolean,
): string {
  const { draft, result, impairmentCatalog } = data;

  if (draft.injuries.length === 0) {
    return `<section class="block">
  <h2 class="section-title">Injuries</h2>
  <div class="empty-result">No injuries entered.</div>
</section>`;
  }

  const rows = draft.injuries
    .map((injury, idx) => {
      const definition = resolveDefinition(
        injury,
        result,
        impairmentCatalog,
        idx,
      );
      const ratedInjury = result?.injuries[idx];
      const acceptsSide = definition?.attributes?.side ?? false;
      const sideText = acceptsSide ? sideLabel(injury.side) : "—";
      const warnings: string[] = ratedInjury?.warnings ?? [];
      const errors: string[] = ratedInjury?.errors ?? [];

      const cells = [
        `<td class="num">${idx + 1}</td>`,
        `<td>${
          definition
            ? `<strong>${escapeHtml(definition.name)}</strong>`
            : '<em style="color:#94a3b8;">No impairment selected</em>'
        }</td>`,
        `<td class="code">${escapeHtml(definition?.impairment_number ?? "—")}</td>`,
        `<td>${escapeHtml(sideText)}</td>`,
        `<td class="num">${escapeHtml(pctOrDash(injury.wpi))}</td>`,
        `<td class="num">${escapeHtml(pctOrDash(injury.ue))}</td>`,
        `<td class="num">${escapeHtml(pctOrDash(injury.le))}</td>`,
        `<td class="num">${escapeHtml(pctOrDash(injury.digit))}</td>`,
        `<td class="num">${injury.pain ?? 0}</td>`,
        `<td class="num">${injury.industrial ?? 100}%</td>`,
        `<td class="num">${injury.ag ? "✓" : ""}</td>`,
      ].join("");

      const mainRow = `<tr>${cells}</tr>`;

      if (!showInjuryNotes || (warnings.length === 0 && errors.length === 0)) {
        return mainRow;
      }

      const noteItems = [
        ...errors.map(
          (e) => `<li><strong>Error:</strong> ${escapeHtml(e)}</li>`,
        ),
        ...warnings.map((w) => `<li>${escapeHtml(w)}</li>`),
      ].join("");

      const warningRow = `<tr class="warning-row"><td colspan="11"><ul>${noteItems}</ul></td></tr>`;
      return mainRow + warningRow;
    })
    .join("\n");

  // `table-layout: fixed` + colgroup gives the Impairment column the
  // remaining width after the other columns claim their fixed sizes,
  // so long impairment names stay on one line.
  return `<section class="block">
  <h2 class="section-title">Injuries (${draft.injuries.length})</h2>
  <table class="report-table">
    <colgroup>
      <col class="col-num">
      <col>
      <col class="col-code">
      <col class="col-side">
      <col class="col-pct">
      <col class="col-pct">
      <col class="col-pct">
      <col class="col-pct">
      <col class="col-pct">
      <col class="col-pct">
      <col class="col-ag">
    </colgroup>
    <thead>
      <tr>
        <th class="num">#</th>
        <th>Impairment</th>
        <th>AMA code</th>
        <th>Side</th>
        <th class="num">WPI</th>
        <th class="num">UE</th>
        <th class="num">LE</th>
        <th class="num">Digit</th>
        <th class="num">Pain</th>
        <th class="num">Industrial</th>
        <th class="num">AG</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</section>`;
}

/** Phase 2 rating breakdown — the structured math chain per injury that
 *  appears in the on-screen RatingBreakdownTable. Renders only when the
 *  calc has run and produced per-injury ratings.
 *
 *  Columns mirror the on-screen table, except we drop a couple of low-
 *  signal ones (Group is implied by the claim's Occupational code in the
 *  info grid) to fit letter-portrait. */
function renderRatingBreakdown(result: StatelessRatingResponse | null): string {
  if (!result?.injuries || result.injuries.length === 0) return "";

  // Per-injury rating payload was added in Phase 2 and may not be in the
  // generated TS types yet — read defensively.
  type RatingExt = {
    rating?: number | null;
    formula?: string | null;
    wpi?: number | null;
    pain?: number | null;
    final_wpi?: number | null;
    fec?: number | null;
    wpi_adj?: number | null;
    occupation_letter?: string | null;
    occup_adj?: number | null;
    age_adj?: number | null;
    industrial?: number | null;
  };

  const rows: string[] = [];
  result.injuries.forEach((inj, idx) => {
    const r = (inj as unknown as { rating?: RatingExt | null }).rating;
    if (!r || r.rating == null) return;
    const sideText = inj.impairment_definition.attributes?.side
      ? sideLabel(
          (inj.injury_attributes as { side?: string } | null)?.side ??
            "default",
        )
      : "—";
    rows.push(
      `<tr>
        <td class="num">${idx + 1}</td>
        <td class="code">${escapeHtml(inj.impairment_definition.impairment_number ?? "—")}</td>
        <td>${escapeHtml(sideText)}</td>
        <td class="num">${r.wpi != null ? r.wpi : "—"}</td>
        <td class="num">${r.pain != null ? r.pain : "—"}</td>
        <td class="num">${r.final_wpi != null ? r.final_wpi : "—"}</td>
        <td class="num">${r.fec != null ? r.fec : "—"}</td>
        <td class="num">${r.wpi_adj != null ? `${r.wpi_adj}%` : "—"}</td>
        <td class="num">${r.occupation_letter ?? "—"}</td>
        <td class="num">${r.occup_adj != null ? `${r.occup_adj}%` : "—"}</td>
        <td class="num">${r.age_adj != null ? `${r.age_adj}%` : "—"}</td>
        <td class="num">${r.industrial != null ? `${r.industrial}%` : "—"}</td>
        <td class="num final-pd">${r.rating != null ? `${r.rating}%` : "—"}</td>
      </tr>`,
    );
  });

  if (rows.length === 0) return "";

  return `<section class="block">
  <h2 class="section-title">Rating breakdown</h2>
  <table class="report-table breakdown-table">
    <colgroup>
      <col class="col-num">
      <col class="col-code">
      <col class="col-side">
      <col class="col-pct">
      <col class="col-pct">
      <col class="col-pct">
      <col class="col-pct">
      <col class="col-pct">
      <col class="col-letter">
      <col class="col-pct">
      <col class="col-pct">
      <col class="col-pct">
      <col class="col-pct">
    </colgroup>
    <thead>
      <tr>
        <th class="num">#</th>
        <th>AMA code</th>
        <th>Side</th>
        <th class="num">WPI</th>
        <th class="num">Pain</th>
        <th class="num">Final WPI</th>
        <th class="num">FEC</th>
        <th class="num">WPI Adj</th>
        <th class="num">Letter</th>
        <th class="num">Occup Adj</th>
        <th class="num">Age Adj</th>
        <th class="num">Industrial</th>
        <th class="num">Final PD</th>
      </tr>
    </thead>
    <tbody>${rows.join("")}</tbody>
  </table>
</section>`;
}

/** When any injury has AG set, surface a one-line note in Calculation
 *  Notes so the rater knows the report acknowledges the override flag.
 *  Today AG is record-keeping only; this note documents that explicitly. */
function buildAgNote(draft: RatingDraft): string | null {
  const flagged = draft.injuries.filter((i) => i.ag);
  if (flagged.length === 0) return null;
  if (flagged.length === draft.injuries.length) {
    return "AG (Almanac Grade) override flagged on every injury. Stored on the case for record-keeping; the engine does not modify the rating math from this flag today.";
  }
  return `AG (Almanac Grade) override flagged on ${flagged.length} of ${draft.injuries.length} injuries. Stored on the case for record-keeping; the engine does not modify the rating math from this flag today.`;
}

function renderCalculationNotes(
  result: StatelessRatingResponse | null,
  draft: RatingDraft,
): string {
  const engineWarnings = result?.result?.combined_rating?.warnings ?? [];
  const agNote = buildAgNote(draft);
  const allNotes: string[] = [...engineWarnings];
  if (agNote) allNotes.push(agNote);
  if (allNotes.length === 0) return "";

  const body =
    allNotes.length === 1
      ? `<span class="inline-note">${escapeHtml(allNotes[0])}</span>`
      : `<ul>${allNotes.map((w) => `<li>${escapeHtml(w)}</li>`).join("")}</ul>`;

  return `<section class="block">
  <div class="notes-card">
    <span class="label">Calculation notes</span>${body}
  </div>
</section>`;
}

function renderComments(
  data: PdReportData,
  finalRating: number | null,
): string {
  const comments = data.draft.claim.comments?.trim();
  if (!comments) return "";
  const applicant =
    data.draft.claim.applicant_name?.trim() || "Unnamed applicant";
  const ratingChip =
    finalRating != null
      ? `<span class="rating">${formatNumber(finalRating, 0)}% PD</span>`
      : "";

  // The header doubles as a running-context anchor for page 2 — if
  // comments naturally flow there, this title bar is the first thing
  // the reader sees on the new page.
  return `<section class="comments-block">
  <header class="comments-header">
    <h2 class="title">Comments</h2>
    <span class="context">${safeText(applicant)}${ratingChip}</span>
  </header>
  <div class="comments-body">${escapeHtml(comments)}</div>
</section>`;
}

function renderDisclaimer(): string {
  return `<div class="disclaimer">
  <strong>Disclaimer.</strong> This rating is an estimate generated from the
  AMA Guides to the Evaluation of Permanent Impairment combined with the
  California Schedule for Rating Permanent Disabilities. It is not legal
  advice and does not substitute for a qualified medical evaluator's report
  or formal rating by the Disability Evaluation Unit. Final compensation is
  determined by statute and the facts of the case.
</div>`;
}

// ─── Public BlockPrinter ────────────────────────────────────────────────────

export const pdReportPrinter: BlockPrinter = {
  label: "Print PD report",
  variants: [
    {
      id: "full",
      label: "Full report",
      description:
        "Applicant info, rating summary, per-side calculation breakdown, injuries table, and any warnings.",
    },
    {
      id: "summary",
      label: "Summary only",
      description:
        "Single-page snapshot — applicant info, final rating, and per-side breakdown without the injuries table.",
    },
  ],
  settings: [
    {
      type: "boolean",
      id: "showFormulas",
      label: "Include calculation formulas",
      description:
        "Show the per-side formulas (e.g. WPI × age × occupation) inside each side card.",
      defaultValue: true,
      appliesTo: ["full", "summary"],
    },
    {
      type: "boolean",
      id: "showInjuryNotes",
      label: "Include per-injury warnings",
      description:
        "Show any warnings or errors the rating engine produced under each injury row.",
      defaultValue: true,
      appliesTo: ["full"],
    },
  ],

  print(data: unknown, variantId: string = "full", settings?: PrintSettings) {
    const typed = data as PdReportData | null;
    if (!typed) {
      openPrintWindow(
        buildPrintDocument(
          '<p style="font-family:sans-serif;color:#64748b;">No data to print.</p>',
          "PD Report",
          "",
        ),
        "pd-report",
      );
      return;
    }

    const showFormulas = (settings?.showFormulas ?? true) as boolean;
    const showInjuryNotes = (settings?.showInjuryNotes ?? true) as boolean;
    const variant: PdReportVariant =
      variantId === "summary" ? "summary" : "full";

    const finalRating =
      typed.result?.result?.combined_rating?.final_rating ?? null;
    const applicant =
      typed.draft.claim.applicant_name?.trim() || "Unnamed applicant";
    const title = `PD Rating — ${applicant}`;

    const sections: string[] = [
      renderReportHeader(typed, finalRating),
      renderInfoGrid(typed),
      renderFinalRatingCard(typed.result),
      renderCompensationDetail(typed.result),
      renderPerSideBreakdown(typed.result, showFormulas),
    ];

    if (variant === "full") {
      sections.push(renderInjuriesTable(typed, showInjuryNotes));
      // Phase 2: structured per-injury rating breakdown (the math chain
      // the FE table renders). Only fits in the full variant — the
      // summary view stays a one-pager.
      sections.push(renderRatingBreakdown(typed.result));
    }

    sections.push(renderCalculationNotes(typed.result, typed.draft));
    // Comments live after the rating detail but before the disclaimer
    // so they're naturally last-content; long comments flow to a
    // second page and the section's own header anchors that page.
    if (variant === "full") {
      sections.push(renderComments(typed, finalRating));
    }
    sections.push(renderDisclaimer());

    const body = sections.filter((s) => s.length > 0).join("\n");

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>${PD_REPORT_STYLES}</style>
</head>
<body>
  <div class="screen-only" style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#f8fafc;border-bottom:1px solid #e2e8f0;padding:10px 16px;display:flex;gap:10px;align-items:center;margin:-14px -24px 14px;">
    <button onclick="window.print()" style="padding:7px 18px;background:#0f172a;color:#fff;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;">Print / Save PDF</button>
    <button onclick="window.close()" style="padding:7px 14px;background:#fff;border:1px solid #cbd5e1;border-radius:6px;font-size:13px;cursor:pointer;">Close</button>
    <span style="color:#64748b;font-size:11px;">Letter portrait · margins ~0.5in</span>
  </div>
${body}
<style>@media print { .screen-only { display:none !important; } }</style>
</body>
</html>`;

    openPrintWindow(
      html,
      `pd-report-${applicant.replace(/\s+/g, "-").toLowerCase()}`,
    );
  },
};
