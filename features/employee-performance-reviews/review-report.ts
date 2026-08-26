import {
  buildPrintDocument,
  escapeHtml,
  openPrintWindow,
} from "@/lib/block-print/block-print-utils";
import {
  OVERALL_OPTIONS,
  RATING_SCHEMA,
  ratingKey,
  type Review,
} from "./schema";

export interface ReviewReportSummary {
  average: number | null;
  ratedCount: number;
  totalCount: number;
  categoryAverages: Record<string, number | null>;
}

export const REVIEW_REPORT_STYLES = `
  .pr-report {
    --pr-ink: #172033;
    --pr-muted: #657089;
    --pr-accent: #3659a8;
    --pr-accent-soft: #edf2ff;
    --pr-line: #d9deea;
    color: var(--pr-ink);
    font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  .pr-report-page {
    position: relative;
    width: 8.5in;
    max-width: 100%;
    min-height: 11in;
    margin: 0 auto 24px;
    padding: 0.52in 0.58in 0.48in;
    overflow: hidden;
    background: #ffffff;
    color: var(--pr-ink);
    box-shadow: 0 18px 46px rgba(23, 32, 51, 0.14);
  }

  .pr-report-page:last-child { margin-bottom: 0; }
  .pr-report * { box-sizing: border-box; }
  .pr-report h1, .pr-report h2, .pr-report h3, .pr-report p { margin: 0; }

  .pr-report-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 24px;
    padding-bottom: 18px;
    border-bottom: 2px solid var(--pr-ink);
  }
  .pr-report-header > div:first-child { min-width: 0; }

  .pr-report-kicker {
    margin-bottom: 7px;
    color: var(--pr-accent);
    font-size: 8.5pt;
    font-weight: 800;
    letter-spacing: 0.18em;
    text-transform: uppercase;
  }

  .pr-report-title {
    font-size: 24pt;
    font-weight: 780;
    letter-spacing: -0.035em;
    line-height: 1.03;
  }

  .pr-report-period {
    margin-top: 8px !important;
    color: var(--pr-muted);
    font-size: 10pt;
  }

  .pr-report-mark {
    display: grid;
    width: 42px;
    height: 42px;
    flex: none;
    place-items: center;
    border-radius: 11px;
    background: var(--pr-ink);
    color: #ffffff;
    font-size: 10pt;
    font-weight: 800;
    letter-spacing: 0.06em;
  }

  .pr-identity {
    display: grid;
    grid-template-columns: 1.4fr 1fr 1fr;
    gap: 14px 22px;
    padding: 17px 0 16px;
    border-bottom: 1px solid var(--pr-line);
  }

  .pr-label {
    display: block;
    margin-bottom: 3px;
    color: var(--pr-muted);
    font-size: 7.5pt;
    font-weight: 800;
    letter-spacing: 0.11em;
    text-transform: uppercase;
  }

  .pr-value {
    color: var(--pr-ink);
    font-size: 10pt;
    font-weight: 650;
    line-height: 1.3;
  }

  .pr-score-row {
    display: grid;
    grid-template-columns: 1.3fr 1fr 1fr;
    gap: 10px;
    margin: 15px 0 17px;
  }

  .pr-score {
    min-height: 58px;
    padding: 10px 12px;
    border: 1px solid var(--pr-line);
    border-radius: 10px;
    background: #fbfcff;
  }

  .pr-score strong {
    display: block;
    margin-top: 2px;
    color: var(--pr-ink);
    font-size: 15pt;
    line-height: 1.1;
  }

  .pr-section { margin-top: 16px; }
  .pr-section-heading {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 14px;
    margin-bottom: 8px;
    padding-bottom: 6px;
    border-bottom: 1px solid var(--pr-line);
  }

  .pr-section-heading h2 {
    font-size: 10pt;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .pr-section-heading span {
    color: var(--pr-muted);
    font-size: 7.5pt;
    font-weight: 650;
  }

  .pr-list {
    display: grid;
    gap: 7px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .pr-list-item {
    display: grid;
    grid-template-columns: 21px 1fr;
    gap: 9px;
    color: var(--pr-ink);
    font-size: 9pt;
    line-height: 1.34;
  }

  .pr-list-number {
    display: grid;
    width: 19px;
    height: 19px;
    place-items: center;
    border-radius: 6px;
    background: var(--pr-accent-soft);
    color: var(--pr-accent);
    font-size: 7.5pt;
    font-weight: 800;
  }

  .pr-empty {
    color: var(--pr-muted);
    font-size: 9pt;
    font-style: italic;
  }

  .pr-two-column {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 18px;
  }

  .pr-rating-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px 12px;
    margin-top: 11px;
  }

  .pr-rating-category {
    overflow: hidden;
    border: 1px solid var(--pr-line);
    border-radius: 9px;
  }

  .pr-rating-category-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 7px 9px;
    background: var(--pr-ink);
    color: #ffffff;
    font-size: 8pt;
    font-weight: 800;
    letter-spacing: 0.03em;
  }

  .pr-rating-category-head span {
    color: #cbd4e8;
    font-weight: 650;
  }

  .pr-rating-item {
    display: grid;
    grid-template-columns: 1fr 22px;
    align-items: center;
    gap: 8px;
    min-height: 24px;
    padding: 3px 8px;
    border-top: 1px solid #e8ebf2;
    font-size: 7.65pt;
    line-height: 1.22;
  }

  .pr-rating-item:first-of-type { border-top: 0; }
  .pr-rating-value {
    display: grid;
    width: 20px;
    height: 20px;
    place-items: center;
    border-radius: 50%;
    background: var(--pr-accent-soft);
    color: var(--pr-accent);
    font-size: 8pt;
    font-weight: 850;
  }

  .pr-prose {
    min-height: 58px;
    padding: 10px 12px;
    border: 1px solid var(--pr-line);
    border-radius: 9px;
    background: #fbfcff;
    color: var(--pr-ink);
    font-size: 8.8pt;
    line-height: 1.4;
    white-space: normal;
  }

  .pr-overall {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-top: 10px;
    padding: 9px 13px;
    border-radius: 9px;
    background: var(--pr-accent-soft);
  }

  .pr-overall strong { font-size: 11pt; }
  .pr-overall span { color: var(--pr-muted); font-size: 8pt; }
  .pr-report-page:nth-child(2) .pr-section { margin-top: 12px; }
  .pr-report-page:nth-child(2) .pr-prose {
    min-height: 52px;
    padding: 8px 12px;
  }

  .pr-report-footer {
    position: absolute;
    right: 0.58in;
    bottom: 0.27in;
    left: 0.58in;
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding-top: 8px;
    border-top: 1px solid var(--pr-line);
    color: var(--pr-muted);
    font-size: 7.5pt;
  }
  .pr-report-footer span:first-child { min-width: 0; }
  .pr-report-footer span:last-child { flex: none; white-space: nowrap; }

  @media screen and (max-width: 760px) {
    .pr-report-preview .pr-report-page {
      width: 100%;
      min-height: auto;
      padding: 24px 18px 56px;
      overflow: visible;
    }
    .pr-report-preview .pr-identity,
    .pr-report-preview .pr-score-row,
    .pr-report-preview .pr-two-column,
    .pr-report-preview .pr-rating-grid { grid-template-columns: 1fr; }
    .pr-report-preview .pr-report-title { font-size: 21pt; }
    .pr-report-preview .pr-report-footer { right: 18px; bottom: 18px; left: 18px; }
  }

  @page { size: letter portrait; margin: 0; }
  @media print {
    body { margin: 0 !important; padding: 0 !important; background: #ffffff !important; }
    .content { width: 100%; }
    .pr-report-page {
      width: 8.5in;
      max-width: none;
      min-height: 11in;
      margin: 0;
      padding: 0.52in 0.58in 0.48in;
      overflow: hidden;
      box-shadow: none;
      break-after: page;
      page-break-after: always;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .pr-report-page:last-child { break-after: auto; page-break-after: auto; }
  }
`;

function clean(value: string): string {
  return value.trim() ? escapeHtml(value.trim()) : "Not provided";
}

function prose(value: string): string {
  if (!value.trim()) return '<span class="pr-empty">Not provided</span>';
  return escapeHtml(value.trim()).replace(/\n/g, "<br>");
}

function formatDate(value: string): string {
  if (!value) return "Not provided";
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return escapeHtml(value);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(year, month - 1, day));
}

function renderList(items: string[]): string {
  if (items.length === 0) {
    return '<p class="pr-empty">Not provided</p>';
  }
  return `<ol class="pr-list">${items
    .map(
      (item, index) => `<li class="pr-list-item">
        <span class="pr-list-number">${index + 1}</span>
        <span>${escapeHtml(item).replace(/\n/g, "<br>")}</span>
      </li>`,
    )
    .join("")}</ol>`;
}

function identity(label: string, value: string): string {
  return `<div><span class="pr-label">${escapeHtml(label)}</span><div class="pr-value">${value}</div></div>`;
}

function section(title: string, items: string[]): string {
  return `<section class="pr-section">
    <div class="pr-section-heading"><h2>${escapeHtml(title)}</h2><span>${items.length || 0} item${items.length === 1 ? "" : "s"}</span></div>
    ${renderList(items)}
  </section>`;
}

function footer(review: Review, page: number): string {
  return `<footer class="pr-report-footer"><span>${clean(review.employeeName)} · ${clean(review.reviewPeriod)}</span><span>Page ${page} of 2</span></footer>`;
}

function renderRatings(review: Review, summary: ReviewReportSummary): string {
  return RATING_SCHEMA.map((category) => {
    const average = summary.categoryAverages[category.key];
    const rows = category.items
      .map((item) => {
        const value = review.ratings[ratingKey(category.key, item.key)];
        return `<div class="pr-rating-item"><span>${escapeHtml(item.label)}</span><span class="pr-rating-value">${value ?? "—"}</span></div>`;
      })
      .join("");
    return `<section class="pr-rating-category">
      <div class="pr-rating-category-head">${escapeHtml(category.label)}<span>${average == null ? "Not rated" : `${average.toFixed(1)} avg`}</span></div>
      ${rows}
    </section>`;
  }).join("");
}

export function buildReviewReportHtml(
  review: Review,
  summary: ReviewReportSummary,
): string {
  const overall = OVERALL_OPTIONS.find(
    (option) => option.key === review.overall,
  );
  const score = summary.average === null ? "—" : summary.average.toFixed(2);

  return `<div class="pr-report">
    <article class="pr-report-page" data-review-report-page="1">
      <header class="pr-report-header">
        <div>
          <p class="pr-report-kicker">Employee review</p>
          <h1 class="pr-report-title">Performance Review</h1>
          <p class="pr-report-period">${clean(review.reviewPeriod)}</p>
        </div>
        <div class="pr-report-mark">PR</div>
      </header>

      <section class="pr-identity">
        ${identity("Employee", clean(review.employeeName))}
        ${identity("Title", clean(review.title))}
        ${identity("Department", clean(review.department))}
        ${identity("Date of hire", formatDate(review.dateOfHire))}
        ${identity("Evaluation date", formatDate(review.dateOfEvaluation))}
        ${identity("Review period", clean(review.reviewPeriod))}
      </section>

      <section class="pr-score-row">
        <div class="pr-score"><span class="pr-label">Average rating</span><strong>${score}<small> / 5</small></strong></div>
        <div class="pr-score"><span class="pr-label">Items rated</span><strong>${summary.ratedCount}<small> / ${summary.totalCount}</small></strong></div>
        <div class="pr-score"><span class="pr-label">Overall performance</span><strong>${overall ? escapeHtml(overall.label) : "Not set"}</strong></div>
      </section>

      ${section("Job responsibilities", review.responsibilities)}
      ${section("Accomplishments", review.accomplishments)}
      <div class="pr-two-column">
        ${section("Strengths", review.strengths)}
        ${section("Opportunities for improvement", review.opportunities)}
      </div>
      ${footer(review, 1)}
    </article>

    <article class="pr-report-page" data-review-report-page="2">
      <header class="pr-report-header">
        <div>
          <p class="pr-report-kicker">Performance detail</p>
          <h1 class="pr-report-title">Ratings &amp; direction</h1>
          <p class="pr-report-period">1 Unsatisfactory · 2 Needs Improvement · 3 Successful · 4 Exceeds · 5 Outstanding</p>
        </div>
        <div class="pr-report-mark">02</div>
      </header>

      <div class="pr-rating-grid">${renderRatings(review, summary)}</div>

      <section class="pr-overall">
        <div><span class="pr-label">Overall performance rating</span><strong>${overall ? escapeHtml(overall.label) : "Not set"}</strong></div>
        <span>${overall ? escapeHtml(overall.description) : "Choose an overall rating to complete the summary."}</span>
      </section>

      <section class="pr-section">
        <div class="pr-section-heading"><h2>Goals &amp; objectives</h2></div>
        <div class="pr-prose">${prose(review.goals)}</div>
      </section>

      <section class="pr-section">
        <div class="pr-section-heading"><h2>Additional comments</h2></div>
        <div class="pr-prose">${prose(review.additionalComments)}</div>
      </section>
      ${footer(review, 2)}
    </article>
  </div>`;
}

export function openReviewPrintView(
  review: Review,
  summary: ReviewReportSummary,
): void {
  const employee = review.employeeName.trim() || "Employee";
  openPrintWindow(
    buildPrintDocument(
      buildReviewReportHtml(review, summary),
      `${employee} Performance Review`,
      REVIEW_REPORT_STYLES,
    ),
    `${employee} Performance Review`,
  );
}

export function reviewReportFilename(review: Review): string {
  const safeName = (review.employeeName.trim() || "employee")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${safeName || "employee"}-performance-review`;
}
