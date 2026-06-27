/**
 * FlashcardsBlock — BlockPrinter
 *
 * Self-contained print logic for flashcard blocks.
 * Exported alongside the component so it travels with the block to the database.
 *
 * Variants:
 *   cut-cards     — 4-per-page grid with physical cut lines; designed to be printed, cut, and used as real cards
 *   both-sides    — 2-column grid showing front + back together (review/overview)
 *   study-sheet   — compact table (front | back) for quick reference or cramming
 *   front-only    — questions/terms only, blank backs for self-testing
 *   back-only     — answers/definitions only
 */

import {
  buildPrintDocument,
  openPrintWindow,
  escapeHtml,
  type BlockPrinter,
  type PrintSettings,
} from "@/lib/block-print/block-print-utils";
import type { Flashcard } from "./flashcard-parser";
import type { FlashcardsBlockData } from "@/types/python-generated/stream-events";

// ---------------------------------------------------------------------------
// Settings helpers
// ---------------------------------------------------------------------------

/** Resolved settings with all defaults filled in — safe to use without null checks */
interface CardPrintSettings {
  showSideLabel: boolean; // "Front" / "Back" label
  showCardNumber: boolean; // "#1", "#2" … badge
  showTickMarks: boolean; // 4 small tick marks at cut intersection
  showCutLines: boolean; // full dashed crossing lines
  lightBackText: boolean; // print back text in dark gray (~#555) to reduce show-through
  mirrorBack: boolean; // horizontally flip back page text so bleed-through is unreadable
}

const SETTING_DEFAULTS: CardPrintSettings = {
  showSideLabel: false,
  showCardNumber: false,
  showTickMarks: false,
  showCutLines: false,
  lightBackText: false,
  mirrorBack: false,
};

function resolveSettings(raw?: PrintSettings): CardPrintSettings {
  if (!raw) return { ...SETTING_DEFAULTS };
  const b = (key: keyof CardPrintSettings) =>
    raw[key] !== undefined ? Boolean(raw[key]) : SETTING_DEFAULTS[key];
  return {
    showSideLabel: b("showSideLabel"),
    showCardNumber: b("showCardNumber"),
    showTickMarks: b("showTickMarks"),
    showCutLines: b("showCutLines"),
    lightBackText: b("lightBackText"),
    mirrorBack: b("mirrorBack"),
  };
}

export type FlashcardsVariant =
  | "landscape-duplex"
  | "landscape-stacked"
  | "portrait-6up-duplex"
  | "portrait-6up-stacked"
  | "avery-5388"
  | "cut-cards"
  | "both-sides"
  | "study-sheet"
  | "front-only"
  | "back-only";

type FlashcardsData = { cards: Flashcard[] } | FlashcardsBlockData | string;

function extractCards(data: unknown): Flashcard[] {
  if (!data) return [];
  if (typeof data === "object" && data !== null && "cards" in data) {
    const cards = (data as { cards: unknown[] }).cards;
    return Array.isArray(cards) ? (cards as Flashcard[]) : [];
  }
  return [];
}

// ---------------------------------------------------------------------------
// Shared base styles — appended after block-print-utils PRINT_STYLES so these win on specificity
// ---------------------------------------------------------------------------
const BASE_STYLES = `
  h1.deck-title {
    font-size: 13pt !important;
    font-weight: 700;
    color: #1e293b;
    margin: 0 0 4px 0;
    letter-spacing: -0.01em;
    border-bottom: none !important;
  }
  h2 { border-bottom: none !important; }
  .deck-meta {
    font-size: 8.5pt;
    color: #64748b;
    margin-bottom: 16px;
  }
  .deck-header {
    border-bottom: 1.5px solid #e2e8f0;
    padding-bottom: 10px;
    margin-bottom: 16px;
  }

  @media print {
    @page { margin: 14mm 12mm; }
  }
`;

// ---------------------------------------------------------------------------
// Variant: Cut-out physical cards (4 per page, front face + scissor guides)
// ---------------------------------------------------------------------------
const CUT_CARD_STYLES = `
  ${BASE_STYLES}

  .instructions {
    font-size: 8pt;
    color: #64748b;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    padding: 7px 10px;
    margin-bottom: 14px;
    line-height: 1.5;
  }

  .cards-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0;
  }

  .card-cell {
    position: relative;
    border: 1px dashed #cbd5e1;
    padding: 0;
    min-height: 120px;
  }

  /* Cut-line corner markers */
  .card-cell::before, .card-cell::after {
    content: "";
    position: absolute;
    width: 8px;
    height: 8px;
    border-color: #94a3b8;
    border-style: solid;
  }
  .card-cell::before { top: 3px; left: 3px; border-width: 1px 0 0 1px; }
  .card-cell::after  { bottom: 3px; right: 3px; border-width: 0 1px 1px 0; }

  .card-inner {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 120px;
  }

  .card-face {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    padding: 12px 14px;
    text-align: center;
  }

  .card-front-face {
    background: linear-gradient(135deg, #1e3a5f 0%, #1e40af 100%);
    color: #ffffff;
    border-radius: 0;
  }
  .card-back-face {
    background: #ffffff;
    border-top: 1.5px solid #e2e8f0;
  }

  .card-side-label {
    font-size: 7pt;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    margin-bottom: 6px;
    opacity: 0.65;
  }
  .card-front-face .card-side-label { color: #bfdbfe; }
  .card-back-face .card-side-label  { color: #94a3b8; }

  .card-number-badge {
    position: absolute;
    top: 6px;
    right: 8px;
    font-size: 7pt;
    color: #94a3b8;
    font-weight: 600;
  }

  .front-text {
    font-size: 11pt;
    font-weight: 600;
    line-height: 1.4;
    color: #ffffff;
  }
  .front-text.long  { font-size: 9.5pt; }
  .front-text.xlong { font-size: 8.5pt; }

  .back-text {
    font-size: 10pt;
    line-height: 1.5;
    color: #1a1a1a;
    white-space: pre-line;
    text-align: left;
    width: 100%;
  }
  .back-text.long  { font-size: 9pt; }
  .back-text.xlong { font-size: 8pt; }

  .fold-hint {
    font-size: 7pt;
    color: #94a3b8;
    text-align: center;
    margin-top: 10px;
    letter-spacing: 0.04em;
  }

  .page-break { page-break-before: always; }

  @media print {
    .card-front-face { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .card-cell       { page-break-inside: avoid; break-inside: avoid; }
    .instructions    { display: none; }
  }
`;

function sizeClass(text: string): string {
  const len = text.length;
  if (len > 200) return "xlong";
  if (len > 100) return "long";
  return "";
}

function renderCutCards(
  cards: Flashcard[],
  title: string,
  startIndex = 0,
): string {
  const PAGE_SIZE = 4; // cards per page
  const pages: string[] = [];

  for (let p = 0; p < Math.ceil(cards.length / PAGE_SIZE); p++) {
    const batch = cards.slice(p * PAGE_SIZE, (p + 1) * PAGE_SIZE);

    const cells = batch
      .map((card, i) => {
        const globalIdx = startIndex + p * PAGE_SIZE + i + 1;
        const frontSize = sizeClass(card.front);
        const backSize = sizeClass(card.back ?? "");
        const backContent = (card.back ?? "")
          .split("\n")
          .map((line) => escapeHtml(line))
          .join("<br>");

        return `<div class="card-cell">
  <span class="card-number-badge">#${globalIdx}</span>
  <div class="card-inner">
    <div class="card-face card-front-face">
      <div class="card-side-label">Question / Term</div>
      <div class="front-text ${frontSize}">${escapeHtml(card.front)}</div>
    </div>
    <div class="card-face card-back-face">
      <div class="card-side-label">Answer / Definition</div>
      <div class="back-text ${backSize}">${backContent}</div>
    </div>
  </div>
</div>`;
      })
      .join("\n");

    const isFirst = p === 0;
    const pageClass = isFirst ? "" : ' class="page-break"';
    pages.push(`<div${pageClass}>
${
  isFirst
    ? `<div class="deck-header">
  <h1 class="deck-title">${escapeHtml(title)}</h1>
  <div class="deck-meta">${cards.length} card${cards.length !== 1 ? "s" : ""} &nbsp;·&nbsp; Cut along dashed lines</div>
</div>
<div class="instructions">
  ✂ Print this page, then cut along the dashed lines. Each cell is one card — front (blue) on top, answer on the bottom.
  Fold in half for a double-sided card, or cut each half separately for separate front/back cards.
</div>`
    : `<div class="deck-meta" style="margin-bottom:10px;">Cards ${startIndex + p * PAGE_SIZE + 1}–${startIndex + Math.min((p + 1) * PAGE_SIZE, cards.length)}</div>`
}
<div class="cards-grid">
${cells}
</div>
<div class="fold-hint">✂ cut along dashed borders · fold on the center line for double-sided cards</div>
</div>`);
  }

  return pages.join("\n");
}

// ---------------------------------------------------------------------------
// Variant: Both sides (2-column card grid, front + back visible)
// ---------------------------------------------------------------------------
const BOTH_SIDES_STYLES = `
  ${BASE_STYLES}

  .cards-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
  }
  .card-cell {
    border: 1.5px solid #e2e8f0;
    border-radius: 8px;
    overflow: hidden;
    page-break-inside: avoid;
    break-inside: avoid;
    background: #fff;
    box-shadow: 0 1px 3px rgba(0,0,0,0.06);
  }
  .card-front {
    background: #1e293b;
    color: #f1f5f9;
    padding: 10px 14px;
    font-weight: 600;
    font-size: 10.5pt;
    line-height: 1.4;
    position: relative;
  }
  .card-front .card-number { font-size: 7.5pt; color: #64748b; margin-bottom: 4px; }
  .card-back {
    padding: 10px 14px;
    font-size: 10pt;
    line-height: 1.5;
    color: #1a1a1a;
    background: #fff;
    border-top: 1px solid #e2e8f0;
    white-space: pre-line;
  }

  @media print {
    .card-front { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
`;

function renderBothSides(
  cards: Flashcard[],
  title: string,
  startIndex = 0,
): string {
  const cells = cards
    .map(
      (card, i) => `<div class="card-cell">
  <div class="card-front">
    <div class="card-number">Card ${startIndex + i + 1}</div>
    ${escapeHtml(card.front)}
  </div>
  <div class="card-back">${escapeHtml(card.back ?? "")}</div>
</div>`,
    )
    .join("\n");

  return `<div class="deck-header">
  <h1 class="deck-title">${escapeHtml(title)}</h1>
  <div class="deck-meta">${cards.length} card${cards.length !== 1 ? "s" : ""} &nbsp;·&nbsp; Front and back</div>
</div>
<div class="cards-grid">
${cells}
</div>`;
}

// ---------------------------------------------------------------------------
// Variant: Study sheet (full-width table)
// ---------------------------------------------------------------------------
const STUDY_SHEET_STYLES = `
  ${BASE_STYLES}

  table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 8px;
    font-size: 10pt;
  }
  thead th {
    background: #1e293b;
    color: #f1f5f9;
    padding: 8px 12px;
    text-align: left;
    font-size: 8.5pt;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }
  thead th:first-child { width: 38%; border-radius: 0; }

  tbody tr { page-break-inside: avoid; break-inside: avoid; }
  tbody tr:nth-child(even) td { background: #f8fafc; }

  tbody td {
    padding: 8px 12px;
    vertical-align: top;
    border-bottom: 1px solid #e2e8f0;
    line-height: 1.5;
    white-space: pre-line;
  }
  tbody td:first-child {
    font-weight: 600;
    border-right: 1px solid #e2e8f0;
    color: #1e3a5f;
  }
  .row-num {
    display: inline-block;
    width: 18px;
    font-size: 8pt;
    color: #94a3b8;
    font-weight: 400;
    margin-right: 4px;
  }

  @media print {
    thead th { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    tbody tr:nth-child(even) td { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
`;

function renderStudySheet(
  cards: Flashcard[],
  title: string,
  startIndex = 0,
): string {
  const rows = cards
    .map(
      (card, i) => `  <tr>
    <td><span class="row-num">${startIndex + i + 1}.</span>${escapeHtml(card.front)}</td>
    <td>${escapeHtml(card.back ?? "")}</td>
  </tr>`,
    )
    .join("\n");

  return `<div class="deck-header">
  <h1 class="deck-title">${escapeHtml(title)}</h1>
  <div class="deck-meta">${cards.length} card${cards.length !== 1 ? "s" : ""} &nbsp;·&nbsp; Study sheet</div>
</div>
<table>
  <thead>
    <tr>
      <th>Question / Term</th>
      <th>Answer / Definition</th>
    </tr>
  </thead>
  <tbody>
${rows}
  </tbody>
</table>`;
}

// ---------------------------------------------------------------------------
// Variant: Front only (self-test — blank space for answers)
// ---------------------------------------------------------------------------
const FRONT_ONLY_STYLES = `
  ${BASE_STYLES}

  .cards-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
  }
  .card-cell {
    border: 1.5px solid #bfdbfe;
    border-radius: 8px;
    overflow: hidden;
    page-break-inside: avoid;
    break-inside: avoid;
    background: #fff;
  }
  .card-front {
    background: linear-gradient(135deg, #1e3a5f 0%, #1e40af 100%);
    color: #ffffff;
    padding: 12px 14px;
    font-weight: 600;
    font-size: 10.5pt;
    line-height: 1.4;
  }
  .card-front .card-number { font-size: 7.5pt; color: #bfdbfe; margin-bottom: 4px; }
  .answer-blank {
    height: 52px;
    border-top: 1px dashed #cbd5e1;
    background: #fafafa;
    position: relative;
  }
  .answer-blank::after {
    content: "write your answer here";
    position: absolute;
    bottom: 6px;
    left: 12px;
    font-size: 7pt;
    color: #cbd5e1;
    letter-spacing: 0.04em;
  }

  @media print {
    .card-front { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
`;

function renderFrontOnly(
  cards: Flashcard[],
  title: string,
  startIndex = 0,
): string {
  const cells = cards
    .map(
      (card, i) => `<div class="card-cell">
  <div class="card-front">
    <div class="card-number">Card ${startIndex + i + 1}</div>
    ${escapeHtml(card.front)}
  </div>
  <div class="answer-blank"></div>
</div>`,
    )
    .join("\n");

  return `<div class="deck-header">
  <h1 class="deck-title">${escapeHtml(title)}</h1>
  <div class="deck-meta">${cards.length} card${cards.length !== 1 ? "s" : ""} &nbsp;·&nbsp; Self-test — write your answers in the blank space</div>
</div>
<div class="cards-grid">
${cells}
</div>`;
}

// ---------------------------------------------------------------------------
// Variant: Back only (answers / definitions)
// ---------------------------------------------------------------------------
const BACK_ONLY_STYLES = `
  ${BASE_STYLES}

  .cards-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
  }
  .card-cell {
    border: 1.5px solid #a7f3d0;
    border-radius: 8px;
    overflow: hidden;
    page-break-inside: avoid;
    break-inside: avoid;
    background: #fff;
  }
  .card-back-header {
    background: linear-gradient(135deg, #065f46 0%, #0f766e 100%);
    color: #ecfdf5;
    padding: 10px 14px;
    font-size: 7.5pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  .card-back-content {
    padding: 10px 14px;
    font-size: 10pt;
    line-height: 1.5;
    color: #1a1a1a;
    white-space: pre-line;
  }

  @media print {
    .card-back-header { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
`;

function renderBackOnly(
  cards: Flashcard[],
  title: string,
  startIndex = 0,
): string {
  const cells = cards
    .map(
      (card, i) => `<div class="card-cell">
  <div class="card-back-header">Card ${startIndex + i + 1}</div>
  <div class="card-back-content">${escapeHtml(card.back ?? "")}</div>
</div>`,
    )
    .join("\n");

  return `<div class="deck-header">
  <h1 class="deck-title">${escapeHtml(title)}</h1>
  <div class="deck-meta">${cards.length} card${cards.length !== 1 ? "s" : ""} &nbsp;·&nbsp; Answers and definitions only</div>
</div>
<div class="cards-grid">
${cells}
</div>`;
}

// ---------------------------------------------------------------------------
// Variant: Landscape cut sheet (4 cards per page, 2×2, black & white)
//
// Geometry (landscape 11" × 8.5"):
//   Page is split into 4 equal quadrants: 5.5" wide × 4.25" tall each.
//   Outer margin: 0.5" on every edge.
//   Inner gap at each cut line: 0.5" each side → 1" total dead zone at center.
//   Usable card area: (5.5 − 0.5 − 0.5)" × (4.25 − 0.5 − 0.5)" = 4.5" × 3.25"
//
// Text sizing: font-size uses vw/vh relative units so it always fills the cell.
//   `fit-text` class uses container-relative font that shrinks when content overflows
//   via a JS resize loop in the document itself.
//
// Double-sided (duplex) mirroring:
//   When a landscape sheet is flipped on the long (left→right) edge,
//   left and right columns swap. So back page layout is:
//     TL = back[1], TR = back[0], BL = back[3], BR = back[2]
// ---------------------------------------------------------------------------

const LANDSCAPE_STYLES = `
  @page { size: landscape; margin: 0; }

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  html, body {
    width: 11in;
    background: #fff;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    color: #000;
    /* Screen: scroll to see all pages. Print: locked to one page height per .page. */
  }

  /* The page wrapper takes the full physical page */
  .page {
    width: 11in;
    height: 8.5in;
    position: relative;
    page-break-after: always;
    break-after: page;
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: 1fr 1fr;
    gap: 0;
    padding: 0.5in;
    /* Thin separator visible on screen between pages */
    border-bottom: 2px solid #e2e8f0;
  }
  .page:last-child {
    page-break-after: auto;
    break-after: auto;
    border-bottom: none;
  }

  @media print {
    /* Do NOT constrain html/body height — that clips pages 2+.
       Page sizing is handled by @page + .page { height: 8.5in } + break-after: page. */
    html, body { width: 11in; height: auto; overflow: visible; }
    .page { border-bottom: none; }
  }

  /* Each quadrant cell — full 5.5" × 4.25" including its half-gutter */
  .quad {
    display: flex;
    align-items: stretch;
    justify-content: stretch;
    padding: 0 0.25in 0.25in 0;   /* right + bottom inner half-gutters */
  }
  /* Top row: add top inner half-gutter via bottom padding of the cell above */
  .quad.top    { padding-bottom: 0.25in; padding-top: 0; }
  .quad.bottom { padding-bottom: 0;      padding-top: 0.25in; }
  .quad.left   { padding-left: 0;  padding-right: 0.25in; }
  .quad.right  { padding-left: 0.25in; padding-right: 0; }

  /* The actual card face — no border, no lines. Cuts are the separation. */
  .card-face {
    flex: 1;
    border: none;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 0.18in 0.22in;
    overflow: hidden;
    position: relative;
  }

  /*
   * Cut tick marks — 4 short marks at the exact center intersection.
   * These sit on the .page element (outside all card faces).
   * Each tick is a 0.18in line. Two ticks per axis: one on each side of center.
   */

  /* Horizontal axis ticks: sit at vertical midpoint, on the left and right edges */
  .tick-h-left, .tick-h-right {
    position: absolute;
    top: 50%;
    width: 0.18in;
    height: 0;
    border-top: 0.6px solid #bbb;
    pointer-events: none;
  }
  .tick-h-left  { left: 0.1in; }
  .tick-h-right { right: 0.1in; }

  /* Vertical axis ticks: sit at horizontal midpoint, on the top and bottom edges */
  .tick-v-top, .tick-v-bottom {
    position: absolute;
    left: 50%;
    height: 0.18in;
    width: 0;
    border-left: 0.6px solid #bbb;
    pointer-events: none;
  }
  .tick-v-top    { top: 0.1in; }
  .tick-v-bottom { bottom: 0.1in; }

  /* Full dashed cut lines (optional — only rendered when showCutLines = true) */
  .cut-line-h {
    position: absolute;
    left: 0;
    right: 0;
    top: 50%;
    height: 0;
    border-top: 0.6px dashed #bbb;
    pointer-events: none;
  }
  .cut-line-v {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 50%;
    width: 0;
    border-left: 0.6px dashed #bbb;
    pointer-events: none;
  }

  /* Card number badge */
  .card-num {
    position: absolute;
    top: 5px;
    right: 7px;
    font-size: 6.5pt;
    color: #999;
    font-weight: 600;
  }

  /* Side label (FRONT / BACK) */
  .side-label {
    font-size: 6.5pt;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #888;
    margin-bottom: 8px;
    align-self: flex-start;
  }

  /* The text container — fills remaining space, centers content */
  .card-text {
    flex: 1;
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    overflow: hidden;
  }

  .card-text-inner {
    font-size: 22pt;   /* fitText JS shrinks this to fit — start bigger for short fronts */
    font-weight: 600;
    line-height: 1.3;
    white-space: pre-wrap;
    word-break: break-word;
    text-align: center;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* Multiline prose back: left-align, slightly smaller start */
  .card-text-inner.multiline {
    text-align: left;
    font-size: 15pt;
    font-weight: 400;
    line-height: 1.45;
  }

  /* Bullet list back */
  ul.card-text-inner.card-list {
    text-align: left;
    font-size: 15pt;
    font-weight: 400;
    line-height: 1.5;
    padding-left: 1.1em;
    margin: 0;
    list-style-type: disc;
    white-space: normal;
    width: 100%;
  }
  ul.card-text-inner.card-list li {
    margin-bottom: 0.25em;
  }
  ul.card-text-inner.card-list li:last-child {
    margin-bottom: 0;
  }

  /* Print-only: hide the browser action bar */
  @media print {
    .screen-only { display: none !important; }
  }
`;

/**
 * Shrink font JS — runs inside the printed window.
 * For each .card-text-inner, reduces font-size until the text fits its container.
 */
const FIT_TEXT_SCRIPT = `
<script>
(function() {
  function fitText(el, container) {
    // container is the bounding box we must fit inside
    var maxW = container.clientWidth;
    var maxH = container.clientHeight;
    var size = parseFloat(window.getComputedStyle(el).fontSize);
    var minSize = 6;
    // Give the element a chance to reflow at current size before measuring
    el.style.fontSize = size + "pt";
    while (size > minSize && (el.scrollWidth > maxW + 1 || el.scrollHeight > maxH + 1)) {
      size -= 0.5;
      el.style.fontSize = size + "pt";
    }
  }
  function runAll() {
    // Landscape card text: container is .card-text (the flex centering wrapper)
    var cardEls = document.querySelectorAll(".card-text .card-text-inner");
    for (var i = 0; i < cardEls.length; i++) {
      fitText(cardEls[i], cardEls[i].parentElement);
    }
    // Avery card text: container is .avery-text-wrap (the absolute centering wrapper)
    var averyEls = document.querySelectorAll(".avery-text-wrap .avery-text");
    for (var i = 0; i < averyEls.length; i++) {
      fitText(averyEls[i], averyEls[i].parentElement);
    }
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", runAll);
  } else {
    // document.write pages may already be loaded
    setTimeout(runAll, 0);
  }
})();
</script>`;

/** Returns true if the majority of non-empty lines look like bullet items */
function isBulletContent(text: string): boolean {
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length < 2) return false;
  const bulletLines = lines.filter((l) => /^\s*[-•*]\s/.test(l));
  return bulletLines.length >= lines.length * 0.6; // 60%+ bullet lines = treat as list
}

function isMultiline(text: string): boolean {
  return text.includes("\n") || text.length > 120;
}

/**
 * Render card back text as either:
 *   - A bullet list (<ul><li>…</li></ul>) when content is bullet-style — left-aligned
 *   - Plain centered text for normal prose
 *   - Front text is always plain centered
 */
function renderCardText(
  text: string,
  isFront: boolean,
  extraStyle = "",
): { html: string; isList: boolean } {
  if (isFront) {
    const styleAttr = extraStyle ? ` style="${extraStyle}"` : "";
    return {
      html: `<div class="card-text-inner"${styleAttr}>${escapeHtml(text).replace(/\n/g, "<br>")}</div>`,
      isList: false,
    };
  }

  const bullet = isBulletContent(text);

  if (bullet) {
    const lines = text.split("\n");
    const items = lines
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .map((l) => l.replace(/^[-•*]\s*/, "")) // strip leading dash/bullet
      .map((l) => `<li>${escapeHtml(l)}</li>`)
      .join("");
    const styleAttr = extraStyle ? ` style="${extraStyle}"` : "";
    return {
      html: `<ul class="card-text-inner card-list"${styleAttr}>${items}</ul>`,
      isList: true,
    };
  }

  // Plain multiline or single-line prose
  const ml = isMultiline(text);
  const cls = ml ? "card-text-inner multiline" : "card-text-inner";
  const styleAttr = extraStyle ? ` style="${extraStyle}"` : "";
  return {
    html: `<div class="${cls}"${styleAttr}>${escapeHtml(text).replace(/\n/g, "<br>")}</div>`,
    isList: false,
  };
}

function buildCardFace(
  text: string,
  cardNum: number,
  isFront: boolean,
  s: CardPrintSettings,
): string {
  const numBadge = s.showCardNumber
    ? `<span class="card-num">#${cardNum}</span>`
    : "";
  const sideLabel = s.showSideLabel
    ? `<span class="side-label">${isFront ? "Front" : "Back"}</span>`
    : "";

  const textColor = !isFront && s.lightBackText ? "color:#777;" : "";
  const mirrorXform =
    !isFront && s.mirrorBack ? "transform:scaleX(-1);display:block;" : "";
  const innerStyle = textColor + mirrorXform;

  const { html, isList } = renderCardText(text, isFront, innerStyle);
  // Lists align to the start so bullets sit at top-left; prose/front stays centered
  const cardTextStyle = isList ? ' style="align-items:flex-start;"' : "";

  return `<div class="card-face">
  ${numBadge}
  ${sideLabel}
  <div class="card-text"${cardTextStyle}>
    ${html}
  </div>
</div>`;
}

const QUAD_CLASSES = [
  "quad top left",
  "quad top right",
  "quad bottom left",
  "quad bottom right",
] as const;

function buildPage(cells: string[], s: CardPrintSettings): string {
  const ticks = s.showTickMarks
    ? `<div class="tick-h-left"></div>
  <div class="tick-h-right"></div>
  <div class="tick-v-top"></div>
  <div class="tick-v-bottom"></div>`
    : "";

  const lines = s.showCutLines
    ? `<div class="cut-line-h"></div>
  <div class="cut-line-v"></div>`
    : "";

  return `<div class="page">
  ${ticks}
  ${lines}
  ${cells.map((c, i) => `<div class="${QUAD_CLASSES[i]}">${c}</div>`).join("\n  ")}
</div>`;
}

/**
 * landscape-duplex: alternating front/back pages.
 *   Front page  → [card1F, card2F, card3F, card4F]
 *   Back page   → [card2B, card1B, card4B, card3B]  (mirrored L↔R for duplex flip on long edge)
 *
 * landscape-stacked: all fronts first, then all backs (same column order both pages).
 */
function renderLandscape(
  cards: Flashcard[],
  title: string,
  mode: "duplex" | "stacked",
  s: CardPrintSettings,
  startIndex = 0,
): string {
  const BATCH = 4;
  const pages: string[] = [];
  const empty = `<div class="card-face"></div>`;

  for (let p = 0; p < Math.ceil(cards.length / BATCH); p++) {
    const batch = cards.slice(p * BATCH, (p + 1) * BATCH);
    while (batch.length < BATCH) batch.push({ front: "", back: "" });

    const fronts = batch.map((c, i) =>
      c.front
        ? buildCardFace(c.front, startIndex + p * BATCH + i + 1, true, s)
        : empty,
    );
    const backs = batch.map((c, i) =>
      c.back
        ? buildCardFace(c.back ?? "", startIndex + p * BATCH + i + 1, false, s)
        : empty,
    );

    if (mode === "duplex") {
      const backsFlipped = [backs[1], backs[0], backs[3], backs[2]];
      pages.push(buildPage(fronts, s));
      pages.push(buildPage(backsFlipped, s));
    } else {
      pages.push(buildPage(fronts, s));
      pages.push(buildPage(backs, s));
    }
  }

  return pages.join("\n");
}

/**
 * Landscape cards need a fully custom document — no buildPrintDocument wrapper
 * because that adds max-width, padding, and chrome that fights the precise page geometry.
 */
function openLandscapeWindow(bodyHtml: string, title: string): void {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(title)}</title>
  <style>${LANDSCAPE_STYLES}</style>
</head>
<body>
<div class="screen-only" style="font-family:sans-serif;font-size:12px;padding:12px 16px;background:#f8fafc;border-bottom:1px solid #e2e8f0;display:flex;gap:10px;align-items:center;">
  <button onclick="window.print()" style="padding:7px 18px;background:#111;color:#fff;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;">Print / Save PDF</button>
  <button onclick="window.close()" style="padding:7px 14px;background:#f1f5f9;border:1px solid #cbd5e1;border-radius:6px;font-size:13px;cursor:pointer;">Close</button>
  <span style="color:#64748b;font-size:11px;">Tip: set your printer to <strong>Landscape</strong> with no additional margins</span>
</div>
${bodyHtml}
${FIT_TEXT_SCRIPT}
</body>
</html>`;

  const win = window.open("", "_blank", "width=1100,height=720,scrollbars=yes");
  if (!win) {
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/\s+/g, "-").toLowerCase()}-flashcards.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
}

// ---------------------------------------------------------------------------
// Variant: Avery 5388 — 3×5" index cards, 3 per page, portrait
//
// Geometry (portrait 8.5" × 11"):
//   Card size: 5" wide × 3" tall
//   3 cards stacked = 9" height
//   Remaining vertical: 11" − 9" = 2" → 0.5" top + 0.5" gap × 2 + 0.5" bottom
//   Side margins: (8.5" − 5") / 2 = 1.75" each side
//
//   Layout: page padding 0.5in top/bottom, 1.75in left/right
//           between cards: 0.5in gap
//
// Each page = 3 card fronts. Next page = matching 3 card backs (same order).
// No borders, no lines, no cut marks. Just text centered in each card zone.
// ---------------------------------------------------------------------------

const AVERY_5388_STYLES = `
  @page { size: portrait; margin: 0; }

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  html, body {
    width: 8.5in;
    background: #fff;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    color: #000;
  }

  .avery-page {
    width: 8.5in;
    height: 11in;
    padding: 0.5in 1.75in;
    display: flex;
    flex-direction: column;
    gap: 0.5in;
    page-break-after: always;
    break-after: page;
    border-bottom: 1px solid #e2e8f0; /* screen only separator */
  }
  .avery-page:last-child {
    page-break-after: auto;
    break-after: auto;
    border-bottom: none;
  }

  /* Each card zone: exactly 5" × 3" — position:relative so the inner text can be absolutely centered */
  .avery-card {
    width: 5in;
    height: 3in;
    position: relative;
    overflow: hidden;
    flex-shrink: 0;
  }

  /* Text centering wrapper — fills the card and centers content in both axes */
  .avery-text-wrap {
    position: absolute;
    inset: 0.2in 0.3in;   /* inner padding — 0.2in top/bottom, 0.3in left/right */
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  /* Side label (tiny, top-left) */
  .avery-side-label {
    position: absolute;
    top: 6px;
    left: 8px;
    font-size: 6pt;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #aaa;
  }

  /* Card number (tiny, top-right) */
  .avery-card-num {
    position: absolute;
    top: 6px;
    right: 8px;
    font-size: 6pt;
    color: #aaa;
    font-weight: 600;
  }

  /* The text itself — starts large, fitText JS shrinks it to fit the wrap container */
  .avery-text {
    font-size: 22pt;
    font-weight: 600;
    line-height: 1.3;
    white-space: pre-wrap;
    word-break: break-word;
    text-align: center;
    max-width: 100%;
  }
  .avery-text.multiline {
    font-size: 15pt;
    font-weight: 400;
    text-align: left;
    line-height: 1.45;
  }

  /* Bullet list back */
  ul.avery-text.card-list {
    text-align: left;
    font-size: 15pt;
    font-weight: 400;
    line-height: 1.5;
    padding-left: 1.1em;
    margin: 0;
    list-style-type: disc;
    white-space: normal;
    width: 100%;
  }
  ul.avery-text.card-list li {
    margin-bottom: 0.3em;
  }
  ul.avery-text.card-list li:last-child {
    margin-bottom: 0;
  }

  @media print {
    /* Ensure gray text isn't converted to black by color management */
    .avery-text { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }

  @media print {
    html, body { width: 8.5in; height: auto; overflow: visible; }
    .avery-page { border-bottom: none; }
    .screen-only { display: none !important; }
  }
`;

function buildAveryCard(
  text: string,
  cardNum: number,
  isFront: boolean,
  s: CardPrintSettings,
): string {
  const numBadge = s.showCardNumber
    ? `<span class="avery-card-num">#${cardNum}</span>`
    : "";
  const sideLabel = s.showSideLabel
    ? `<span class="avery-side-label">${isFront ? "Front" : "Back"}</span>`
    : "";

  const textColor = !isFront && s.lightBackText ? "color:#777;" : "";
  const mirrorXform = !isFront && s.mirrorBack ? "transform:scaleX(-1);" : "";
  const innerStyle = textColor + mirrorXform;

  // Render with shared logic — detects bullets, builds <ul> if needed
  const isBullet = !isFront && isBulletContent(text);
  const isML = !isFront && isMultiline(text);
  const cls = isBullet
    ? "avery-text card-list"
    : isML
      ? "avery-text multiline"
      : "avery-text";
  const styleAttr = innerStyle ? ` style="${innerStyle}"` : "";

  let innerHtml: string;
  if (isBullet) {
    const items = text
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .map((l) => l.replace(/^[-•*]\s*/, ""))
      .map((l) => `<li>${escapeHtml(l)}</li>`)
      .join("");
    innerHtml = `<ul class="${cls}"${styleAttr}>${items}</ul>`;
  } else {
    const escaped = escapeHtml(text).replace(/\n/g, "<br>");
    innerHtml = `<div class="${cls}"${styleAttr}>${escaped}</div>`;
  }

  // List content: wrap aligns to start; prose/front: centered
  const wrapExtra = isBullet ? ' style="align-items:flex-start;"' : "";

  return `<div class="avery-card">
  ${numBadge}
  ${sideLabel}
  <div class="avery-text-wrap"${wrapExtra}>
    ${innerHtml}
  </div>
</div>`;
}

function renderAvery5388(
  cards: Flashcard[],
  title: string,
  s: CardPrintSettings,
  startIndex = 0,
): string {
  const BATCH = 3;
  const pages: string[] = [];

  for (let p = 0; p < Math.ceil(cards.length / BATCH); p++) {
    const batch = cards.slice(p * BATCH, (p + 1) * BATCH);

    const frontCells = batch
      .map((c, i) =>
        buildAveryCard(c.front, startIndex + p * BATCH + i + 1, true, s),
      )
      .join("\n");
    const backCells = batch
      .map((c, i) =>
        buildAveryCard(c.back ?? "", startIndex + p * BATCH + i + 1, false, s),
      )
      .join("\n");

    const padCount = BATCH - batch.length;
    const padCells = Array(padCount)
      .fill(`<div class="avery-card"></div>`)
      .join("\n");

    pages.push(`<div class="avery-page">${frontCells}${padCells}</div>`);
    pages.push(`<div class="avery-page">${backCells}${padCells}</div>`);
  }

  return pages.join("\n");
}

function openAveryWindow(bodyHtml: string, title: string): void {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(title)} — Avery 5388</title>
  <style>${AVERY_5388_STYLES}</style>
</head>
<body>
<div class="screen-only" style="font-family:sans-serif;font-size:12px;padding:10px 16px;background:#f8fafc;border-bottom:1px solid #e2e8f0;display:flex;gap:10px;align-items:center;">
  <button onclick="window.print()" style="padding:7px 18px;background:#111;color:#fff;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;">Print / Save PDF</button>
  <button onclick="window.close()" style="padding:7px 14px;background:#f1f5f9;border:1px solid #cbd5e1;border-radius:6px;font-size:13px;cursor:pointer;">Close</button>
  <span style="color:#64748b;font-size:11px;">Avery 5388 · 3×5" index cards · 3 per page · set printer to <strong>Portrait, no margins</strong></span>
</div>
${bodyHtml}
${FIT_TEXT_SCRIPT}
</body>
</html>`;

  const win = window.open("", "_blank", "width=900,height=720,scrollbars=yes");
  if (!win) {
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/\s+/g, "-").toLowerCase()}-avery5388.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
}

// ---------------------------------------------------------------------------
// Variant: Portrait 6-up (6 cards per page, 2 columns × 3 rows)
//
// Geometry (portrait 8.5" × 11"):
//   Page is split exactly in half down the middle and into thirds across.
//   Each cell: 4.25" wide × 3.667" tall.
//   Inner padding per cell: ~0.22" gives the text breathing room without
//   pushing content off the cuttable area.
//
// Duplex (double-sided) mirroring for portrait:
//   Most printers default to "flip on long edge" for portrait duplex, which
//   pivots the sheet around its left (long) edge. Result: left ↔ right
//   columns swap on the back side, rows are unchanged.
//
//   Front slot order:  [0:TL, 1:TR, 2:ML, 3:MR, 4:BL, 5:BR]
//   Back page render:  [B1, B0, B3, B2, B5, B4]  (columns swapped per row)
//
// Content centering:
//   Each card face uses flex centering so short text sits dead-center,
//   multiline prose is left-aligned but still vertically centered, and
//   bullet lists align to the top-left of their cell for readability.
// ---------------------------------------------------------------------------

const PORTRAIT_6UP_STYLES = `
  @page { size: portrait; margin: 0; }

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  html, body {
    width: 8.5in;
    background: #fff;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    color: #000;
  }

  .page-6up {
    width: 8.5in;
    height: 11in;
    position: relative;
    page-break-after: always;
    break-after: page;
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: 1fr 1fr 1fr;
    gap: 0;
    padding: 0;
    border-bottom: 2px solid #e2e8f0;
  }
  .page-6up:last-child {
    page-break-after: auto;
    break-after: auto;
    border-bottom: none;
  }

  @media print {
    html, body { width: 8.5in; height: auto; overflow: visible; }
    .page-6up { border-bottom: none; }
  }

  /* Each of the 6 cells — clean 4.25" × 3.667" zone split by the cuts */
  .cell-6 {
    display: flex;
    align-items: stretch;
    justify-content: stretch;
    padding: 0.2in 0.22in;
    overflow: hidden;
  }

  /* The actual card face — no border. Cuts are the separation. */
  .card-face {
    flex: 1;
    border: none;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 0.1in 0.12in;
    overflow: hidden;
    position: relative;
  }

  /* Cut tick marks — short marks at each cut intersection with the page edge */
  .tick-v-top, .tick-v-bottom {
    position: absolute;
    left: 50%;
    height: 0.18in;
    width: 0;
    border-left: 0.6px solid #bbb;
    pointer-events: none;
  }
  .tick-v-top    { top: 0.1in; }
  .tick-v-bottom { bottom: 0.1in; }

  .tick-h-1-left, .tick-h-1-right,
  .tick-h-2-left, .tick-h-2-right {
    position: absolute;
    width: 0.18in;
    height: 0;
    border-top: 0.6px solid #bbb;
    pointer-events: none;
  }
  .tick-h-1-left  { top: 33.333%; left: 0.1in; }
  .tick-h-1-right { top: 33.333%; right: 0.1in; }
  .tick-h-2-left  { top: 66.667%; left: 0.1in; }
  .tick-h-2-right { top: 66.667%; right: 0.1in; }

  /* Full dashed cut lines (optional) */
  .cut-line-v {
    position: absolute;
    top: 0; bottom: 0;
    left: 50%;
    width: 0;
    border-left: 0.6px dashed #bbb;
    pointer-events: none;
  }
  .cut-line-h-1, .cut-line-h-2 {
    position: absolute;
    left: 0; right: 0;
    height: 0;
    border-top: 0.6px dashed #bbb;
    pointer-events: none;
  }
  .cut-line-h-1 { top: 33.333%; }
  .cut-line-h-2 { top: 66.667%; }

  /* Card number badge */
  .card-num {
    position: absolute;
    top: 5px;
    right: 7px;
    font-size: 6.5pt;
    color: #999;
    font-weight: 600;
  }

  /* Side label (FRONT / BACK) */
  .side-label {
    font-size: 6.5pt;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #888;
    margin-bottom: 6px;
    align-self: flex-start;
  }

  /* Centered text container — fills the card, both axes centered */
  .card-text {
    flex: 1;
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    overflow: hidden;
  }

  .card-text-inner {
    font-size: 18pt;   /* fitText JS shrinks this to fit */
    font-weight: 600;
    line-height: 1.3;
    white-space: pre-wrap;
    word-break: break-word;
    text-align: center;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .card-text-inner.multiline {
    text-align: left;
    font-size: 13pt;
    font-weight: 400;
    line-height: 1.45;
  }

  ul.card-text-inner.card-list {
    text-align: left;
    font-size: 13pt;
    font-weight: 400;
    line-height: 1.5;
    padding-left: 1.1em;
    margin: 0;
    list-style-type: disc;
    white-space: normal;
    width: 100%;
  }
  ul.card-text-inner.card-list li { margin-bottom: 0.2em; }
  ul.card-text-inner.card-list li:last-child { margin-bottom: 0; }

  @media print {
    .screen-only { display: none !important; }
  }
`;

function buildPage6Up(cells: string[], s: CardPrintSettings): string {
  const ticks = s.showTickMarks
    ? `<div class="tick-v-top"></div>
  <div class="tick-v-bottom"></div>
  <div class="tick-h-1-left"></div>
  <div class="tick-h-1-right"></div>
  <div class="tick-h-2-left"></div>
  <div class="tick-h-2-right"></div>`
    : "";

  const lines = s.showCutLines
    ? `<div class="cut-line-v"></div>
  <div class="cut-line-h-1"></div>
  <div class="cut-line-h-2"></div>`
    : "";

  return `<div class="page-6up">
  ${ticks}
  ${lines}
  ${cells.map((c) => `<div class="cell-6">${c}</div>`).join("\n  ")}
</div>`;
}

/**
 * portrait-6up-duplex: alternating front/back pages, backs mirrored for duplex.
 *   Front page → [F0, F1, F2, F3, F4, F5] in slot order TL, TR, ML, MR, BL, BR
 *   Back page  → [B1, B0, B3, B2, B5, B4]  (columns swapped for long-edge flip)
 *
 * portrait-6up-stacked: all fronts first, then all backs (same slot order both).
 */
function renderPortrait6Up(
  cards: Flashcard[],
  title: string,
  mode: "duplex" | "stacked",
  s: CardPrintSettings,
  startIndex = 0,
): string {
  const BATCH = 6;
  const pages: string[] = [];
  const empty = `<div class="card-face"></div>`;

  for (let p = 0; p < Math.ceil(cards.length / BATCH); p++) {
    const batch = cards.slice(p * BATCH, (p + 1) * BATCH);
    while (batch.length < BATCH) batch.push({ front: "", back: "" });

    const fronts = batch.map((c, i) =>
      c.front
        ? buildCardFace(c.front, startIndex + p * BATCH + i + 1, true, s)
        : empty,
    );
    const backs = batch.map((c, i) =>
      c.back
        ? buildCardFace(c.back ?? "", startIndex + p * BATCH + i + 1, false, s)
        : empty,
    );

    if (mode === "duplex") {
      // Long-edge flip swaps columns per row: [TR, TL, MR, ML, BR, BL]
      const backsFlipped = [
        backs[1],
        backs[0],
        backs[3],
        backs[2],
        backs[5],
        backs[4],
      ];
      pages.push(buildPage6Up(fronts, s));
      pages.push(buildPage6Up(backsFlipped, s));
    } else {
      pages.push(buildPage6Up(fronts, s));
      pages.push(buildPage6Up(backs, s));
    }
  }

  return pages.join("\n");
}

function openPortrait6UpWindow(bodyHtml: string, title: string): void {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(title)} — 6 per page</title>
  <style>${PORTRAIT_6UP_STYLES}</style>
</head>
<body>
<div class="screen-only" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#fff;border-bottom:1px solid #e2e8f0;padding:14px 20px;">
  <div style="display:flex;gap:10px;align-items:center;margin-bottom:10px;">
    <button onclick="window.print()" style="padding:8px 20px;background:#111;color:#fff;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;">Print / Save PDF</button>
    <button onclick="window.close()" style="padding:8px 14px;background:#f1f5f9;border:1px solid #cbd5e1;border-radius:6px;font-size:13px;cursor:pointer;">Close</button>
    <span style="color:#111;font-size:12px;font-weight:600;margin-left:4px;">6 flashcards per page · cut into 6</span>
  </div>
  <div style="background:#fef3c7;border:1px solid #fbbf24;border-radius:6px;padding:10px 14px;font-size:12px;line-height:1.55;color:#78350f;max-width:720px;">
    <div style="font-weight:700;margin-bottom:4px;color:#92400e;">⚠ Printer settings for duplex alignment</div>
    <strong>- Page Size:</strong> Letter (8.5" × 11")<br>
    <strong>- Orientation:</strong> Portrait<br>
    <strong>- Two-sided (Duplex):</strong> On<br>
    <strong>- Flip on:</strong> Long edge<br>
    <strong>- Pages per sheet:</strong> 1<br>
    <strong>- Scale:</strong> 100% / Actual size<br>
    <strong>- Margins:</strong> None<br>
  </div>
</div>
${bodyHtml}
${FIT_TEXT_SCRIPT}
</body>
</html>`;

  const win = window.open("", "_blank", "width=900,height=720,scrollbars=yes");
  if (!win) {
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/\s+/g, "-").toLowerCase()}-flashcards-6up.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
}

// ---------------------------------------------------------------------------
// Helper: derive a title from the data if available
// ---------------------------------------------------------------------------
function deriveTitle(data: unknown): string {
  if (data && typeof data === "object" && "title" in data) {
    const t = (data as { title?: unknown }).title;
    if (typeof t === "string" && t.trim()) return t.trim();
  }
  return "Flashcards";
}

// ---------------------------------------------------------------------------
// Exported printer
// ---------------------------------------------------------------------------
export const flashcardsPrinter: BlockPrinter = {
  label: "Print flashcards",
  variants: [
    {
      id: "portrait-6up-duplex",
      label: "Portrait 6-up — duplex (recommended)",
      description:
        "6 cards per page (2 columns × 3 rows), portrait. Split down the middle and into thirds. Fronts and backs on alternating pages — backs are mirrored so they align perfectly when duplex-printed (flip on long edge) and cut into 6",
    },
    {
      id: "portrait-6up-stacked",
      label: "Portrait 6-up — all fronts then all backs",
      description:
        "6 cards per page (2 columns × 3 rows), portrait. All front pages first, then all back pages — cut all sheets together for a matching deck",
    },
    {
      id: "landscape-duplex",
      label: "Landscape cut sheet — duplex (double-sided)",
      description:
        "4 cards per page, landscape. Fronts and backs on alternating pages — backs are mirrored so they align perfectly when you flip and cut",
    },
    {
      id: "landscape-stacked",
      label: "Landscape cut sheet — all fronts then all backs",
      description:
        "4 cards per page, landscape. All front pages first, then all back pages — cut all sheets together for a matching deck",
    },
    {
      id: "avery-5388",
      label: 'Avery 5388 — 3×5" index cards (3 per page)',
      description:
        "Prints to Avery 5388 card stock. 3 cards per page, portrait. Front page then back page per set of 3 — load the sheet twice to print both sides",
    },
    {
      id: "cut-cards",
      label: "Cut-out cards (portrait)",
      description:
        "4 per page with cut lines — front and back shown together per card",
    },
    {
      id: "both-sides",
      label: "Both sides per card",
      description: "Front and back shown together — best for review or sharing",
    },
    {
      id: "study-sheet",
      label: "Study sheet (table)",
      description: "Compact two-column table — all cards on one or two pages",
    },
    {
      id: "front-only",
      label: "Questions only (self-test)",
      description:
        "Front side with blank space to write answers — print and quiz yourself",
    },
    {
      id: "back-only",
      label: "Answers only",
      description: "Definitions / answers without the questions",
    },
  ],

  settings: [
    {
      type: "range" as const,
      id: "cardRange",
      label: "Cards to print",
      description: "Leave blank to print the whole deck",
      fromId: "fromCard",
      toId: "toCard",
      defaultFrom: 0,
      defaultTo: 0,
      min: 1,
      fromPlaceholder: "1",
      toPlaceholder: "end",
    },
    {
      type: "boolean" as const,
      id: "showSideLabel",
      label: "Show side label",
      description: 'Prints "Front" or "Back" in the corner of each card',
      defaultValue: false,
      appliesTo: [
        "landscape-duplex",
        "landscape-stacked",
        "portrait-6up-duplex",
        "portrait-6up-stacked",
        "avery-5388",
      ],
    },
    {
      type: "boolean" as const,
      id: "showCardNumber",
      label: "Show card number",
      description: "Prints #1, #2 … in the corner of each card",
      defaultValue: false,
      appliesTo: [
        "landscape-duplex",
        "landscape-stacked",
        "portrait-6up-duplex",
        "portrait-6up-stacked",
        "avery-5388",
      ],
    },
    {
      type: "boolean" as const,
      id: "showTickMarks",
      label: "Show cut tick marks",
      description:
        "Small marks at each cut intersection — where to make each cut",
      defaultValue: false,
      appliesTo: [
        "landscape-duplex",
        "landscape-stacked",
        "portrait-6up-duplex",
        "portrait-6up-stacked",
      ],
    },
    {
      type: "boolean" as const,
      id: "showCutLines",
      label: "Show full cut lines",
      description:
        "Dashed lines all the way across the page — helps if you don't have a ruler",
      defaultValue: false,
      appliesTo: [
        "landscape-duplex",
        "landscape-stacked",
        "portrait-6up-duplex",
        "portrait-6up-stacked",
      ],
    },
    {
      type: "boolean" as const,
      id: "lightBackText",
      label: "Light back text (reduce show-through)",
      description:
        "Prints the back side in dark gray instead of black — ink is lighter and less visible through the paper",
      defaultValue: false,
      appliesTo: [
        "landscape-duplex",
        "landscape-stacked",
        "portrait-6up-duplex",
        "portrait-6up-stacked",
        "avery-5388",
      ],
    },
    {
      type: "boolean" as const,
      id: "mirrorBack",
      label: "Mirror back text (best show-through prevention)",
      description:
        "Flips back text horizontally — any ink that bleeds through reads backwards and is unrecognizable from the front",
      defaultValue: false,
      appliesTo: [
        "landscape-duplex",
        "landscape-stacked",
        "portrait-6up-duplex",
        "portrait-6up-stacked",
        "avery-5388",
      ],
    },
  ],

  print(
    data: unknown,
    variantId: string = "portrait-6up-duplex",
    rawSettings?: PrintSettings,
  ) {
    const allCards = extractCards(data);
    const title = deriveTitle(data);
    const s = resolveSettings(rawSettings);

    if (allCards.length === 0) {
      openPrintWindow(
        buildPrintDocument(
          "<p>No flashcard data available to print.</p>",
          title,
          BASE_STYLES,
        ),
        "flashcards",
      );
      return;
    }

    // Resolve the "cards to print" range. 0 / missing / out-of-bounds all
    // fall back to sensible ends. Any invalid input still produces a valid deck.
    const rawFrom =
      typeof rawSettings?.fromCard === "number" ? rawSettings.fromCard : 0;
    const rawTo =
      typeof rawSettings?.toCard === "number" ? rawSettings.toCard : 0;
    const rangeStart = rawFrom > 0 ? Math.min(rawFrom, allCards.length) : 1;
    const rangeEnd =
      rawTo > 0 ? Math.min(rawTo, allCards.length) : allCards.length;
    const [fromIdx, toIdx] =
      rangeStart <= rangeEnd ? [rangeStart, rangeEnd] : [rangeEnd, rangeStart]; // swap if user inverted them
    const startIndex = fromIdx - 1; // 0-based offset of the first card
    const cards = allCards.slice(startIndex, toIdx);

    // Landscape and Avery variants use fully custom documents (precise page geometry)
    if (variantId === "landscape-duplex") {
      openLandscapeWindow(
        renderLandscape(cards, title, "duplex", s, startIndex),
        title,
      );
      return;
    }
    if (variantId === "landscape-stacked") {
      openLandscapeWindow(
        renderLandscape(cards, title, "stacked", s, startIndex),
        title,
      );
      return;
    }
    if (variantId === "portrait-6up-duplex") {
      openPortrait6UpWindow(
        renderPortrait6Up(cards, title, "duplex", s, startIndex),
        title,
      );
      return;
    }
    if (variantId === "portrait-6up-stacked") {
      openPortrait6UpWindow(
        renderPortrait6Up(cards, title, "stacked", s, startIndex),
        title,
      );
      return;
    }
    if (variantId === "avery-5388") {
      openAveryWindow(renderAvery5388(cards, title, s, startIndex), title);
      return;
    }

    let bodyHtml: string;
    let styles: string;

    switch (variantId as FlashcardsVariant) {
      case "cut-cards":
        bodyHtml = renderCutCards(cards, title, startIndex);
        styles = CUT_CARD_STYLES;
        break;
      case "front-only":
        bodyHtml = renderFrontOnly(cards, title, startIndex);
        styles = FRONT_ONLY_STYLES;
        break;
      case "back-only":
        bodyHtml = renderBackOnly(cards, title, startIndex);
        styles = BACK_ONLY_STYLES;
        break;
      case "study-sheet":
        bodyHtml = renderStudySheet(cards, title, startIndex);
        styles = STUDY_SHEET_STYLES;
        break;
      case "both-sides":
      default:
        bodyHtml = renderBothSides(cards, title, startIndex);
        styles = BOTH_SIDES_STYLES;
        break;
    }

    openPrintWindow(buildPrintDocument(bodyHtml, title, styles), "flashcards");
  },
};
