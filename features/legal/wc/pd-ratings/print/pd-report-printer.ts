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
    line-height: 1.55;
    font-size: 10.5pt;
    max-width: 8.5in;
    margin: 0 auto;
    padding: 24px 36px;
    background: #fff;
  }

  /* ── Report header ── */
  .report-header {
    border-bottom: 2px solid #1e293b;
    padding-bottom: 14px;
    margin-bottom: 18px;
  }
  .report-header .eyebrow {
    font-size: 8.5pt;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #475569;
    margin-bottom: 4px;
  }
  .report-header h1 {
    font-size: 19pt;
    font-weight: 700;
    color: #0f172a;
    letter-spacing: -0.01em;
    margin: 0;
    line-height: 1.2;
  }
  .report-header .subtitle {
    font-size: 9.5pt;
    color: #64748b;
    margin-top: 4px;
  }

  /* ── Applicant info grid ── */
  .info-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px 18px;
    margin: 14px 0 22px;
    padding: 12px 14px;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
  }
  .info-cell {
    min-width: 0;
  }
  .info-cell .label {
    font-size: 7.5pt;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #64748b;
    margin-bottom: 2px;
  }
  .info-cell .value {
    font-size: 10pt;
    font-weight: 600;
    color: #0f172a;
  }
  .info-cell .value.muted {
    color: #94a3b8;
    font-weight: 400;
  }

  /* ── Sections ── */
  section.block { margin: 22px 0; }

  h2.section-title {
    font-size: 10.5pt;
    font-weight: 700;
    color: #0f172a;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    border-bottom: 1px solid #cbd5e1;
    padding-bottom: 4px;
    margin: 0 0 10px;
  }

  /* ── Final rating callout ── */
  .final-card {
    display: grid;
    grid-template-columns: 1fr 2fr;
    gap: 18px;
    align-items: center;
    padding: 18px 20px;
    background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
    border: 1.5px solid #cbd5e1;
    border-radius: 8px;
  }
  .final-card .final-rating {
    text-align: left;
  }
  .final-card .final-rating .label {
    font-size: 8pt;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #475569;
  }
  .final-card .final-rating .value {
    font-size: 42pt;
    font-weight: 700;
    color: #0f172a;
    letter-spacing: -0.02em;
    line-height: 1;
    margin-top: 4px;
    font-variant-numeric: tabular-nums;
  }
  .final-card .final-rating .value .percent {
    font-size: 24pt;
    color: #64748b;
    margin-left: 2px;
    font-weight: 600;
  }

  .comp-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px 16px;
  }
  .comp-cell .label {
    font-size: 7.5pt;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #64748b;
  }
  .comp-cell .value {
    font-size: 13pt;
    font-weight: 700;
    color: #0f172a;
    margin-top: 2px;
    font-variant-numeric: tabular-nums;
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
    padding: 8px 12px;
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
    font-size: 12pt;
    font-weight: 700;
    color: #0f172a;
    font-variant-numeric: tabular-nums;
    line-height: 1;
  }
  .side-card ul {
    margin: 4px 0 0;
    padding: 0;
    list-style: none;
  }
  .side-card li {
    font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
    font-size: 8.5pt;
    color: #475569;
    line-height: 1.5;
    white-space: nowrap;
  }
  .side-card li + li { margin-top: 1px; }

  /* ── Tables ── */
  table.report-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 9.5pt;
  }
  table.report-table thead th {
    background: #1e293b;
    color: #f8fafc;
    text-align: left;
    padding: 6px 10px;
    font-size: 7.5pt;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    border: none;
  }
  table.report-table thead th.num { text-align: right; }
  table.report-table tbody td {
    padding: 6px 10px;
    border-bottom: 1px solid #e2e8f0;
    vertical-align: top;
    line-height: 1.45;
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
  }
  table.report-table tbody tr:nth-child(even) td {
    background: #f8fafc;
  }
  table.report-table tbody tr.warning-row td {
    padding: 4px 10px 10px;
    border-bottom: 1px solid #e2e8f0;
    background: #fef3c7;
    font-size: 8.5pt;
    color: #78350f;
  }
  table.report-table tbody tr.warning-row td ul {
    margin: 0;
    padding-left: 16px;
  }
  table.report-table tbody tr.warning-row td li {
    margin-bottom: 2px;
  }

  /* ── Notes ── */
  .notes-card {
    border: 1px solid #fbbf24;
    background: #fef3c7;
    border-radius: 6px;
    padding: 10px 14px;
    color: #78350f;
    font-size: 9pt;
  }
  .notes-card .label {
    font-size: 7.5pt;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #92400e;
    margin-bottom: 4px;
  }
  .notes-card ul { margin: 0; padding-left: 16px; }
  .notes-card li { margin-bottom: 2px; }

  /* ── Disclaimer ── */
  .disclaimer {
    margin-top: 26px;
    padding-top: 12px;
    border-top: 1px solid #cbd5e1;
    font-size: 8pt;
    color: #64748b;
    line-height: 1.5;
  }
  .disclaimer strong { color: #475569; }

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
    @page { size: letter portrait; margin: 0.45in 0.55in; }
    body { padding: 0; max-width: 100%; }
    .report-header, .final-card, .info-grid, .side-card,
    .notes-card, table.report-table thead {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .side-card, .info-grid { page-break-inside: avoid; }
    table.report-table { page-break-inside: auto; }
    table.report-table tr { page-break-inside: avoid; page-break-after: auto; }
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
  const cells: Array<{ label: string; value: string; muted?: boolean }> = [
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
    },
    {
      label: "Weekly earnings",
      value:
        claim.weekly_earnings != null
          ? formatCurrency(claim.weekly_earnings)
          : "—",
      muted: claim.weekly_earnings == null,
    },
  ];

  const html = cells
    .map(
      (c) =>
        `<div class="info-cell">
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

      const warningRow = `<tr class="warning-row"><td colspan="10"><ul>${noteItems}</ul></td></tr>`;
      return mainRow + warningRow;
    })
    .join("\n");

  return `<section class="block">
  <h2 class="section-title">Injuries (${draft.injuries.length})</h2>
  <table class="report-table">
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
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</section>`;
}

function renderCalculationNotes(
  result: StatelessRatingResponse | null,
): string {
  const warnings = result?.result?.combined_rating?.warnings ?? [];
  if (warnings.length === 0) return "";

  const items = warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join("");

  return `<section class="block">
  <div class="notes-card">
    <div class="label">Calculation notes</div>
    <ul>${items}</ul>
  </div>
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
      renderPerSideBreakdown(typed.result, showFormulas),
    ];

    if (variant === "full") {
      sections.push(renderInjuriesTable(typed, showInjuryNotes));
    }

    sections.push(renderCalculationNotes(typed.result));
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
  <div class="screen-only" style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#f8fafc;border-bottom:1px solid #e2e8f0;padding:10px 16px;display:flex;gap:10px;align-items:center;margin:-24px -36px 18px;">
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
