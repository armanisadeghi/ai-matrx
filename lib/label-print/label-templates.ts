/**
 * Label-sheet template registry — the geometry source of truth for QR label
 * printing on standard 8.5" × 11" label stock (Avery and compatibles).
 *
 * ONE generic grid renderer (`render-label-sheet.ts`) is driven entirely by
 * these numbers — never a hand-written CSS block per stock. All dimensions in
 * inches, taken from Avery's published templates:
 *   - horizontal pitch = labelWIn + gutterXIn; vertical pitch = labelHIn + gutterYIn
 *   - a template is valid when marginLeft*2 + cols*labelW + (cols-1)*gutterX = sheetW
 *     (same vertically) — `assertTemplateGeometry` checks this in dev.
 *
 * Docs: lib/label-print/FEATURE.md
 */

export interface LabelTemplate {
  id: string;
  name: string;
  /** Stock code as printed on the box (e.g. "Avery 5160"). */
  stockCode: string;
  sheetWIn: number;
  sheetHIn: number;
  marginTopIn: number;
  marginLeftIn: number;
  labelWIn: number;
  labelHIn: number;
  cols: number;
  rows: number;
  /** Horizontal gap BETWEEN columns (not the outer margin). */
  gutterXIn: number;
  /** Vertical gap BETWEEN rows. */
  gutterYIn: number;
  /** Corner radius; equal to labelWIn/2 for round labels. */
  cornerRadiusIn?: number;
  /** True round label (die-cut circle) — preview/calibration draw a circle. */
  round?: boolean;
}

/**
 * Seeded templates. Geometry verified against Avery's published template
 * dimensions (avery.com template pages for each SKU):
 *
 * 5160 — 1" × 2⅝" address, 30-up (3×10). Top/bottom margin 0.5",
 *        side margin 0.1875", 0.125" column gutter, zero row gutter.
 * 5163 — 2" × 4" shipping, 10-up (2×5). Top/bottom 0.5", side 0.15625",
 *        0.1875" column gutter, zero row gutter.
 * 5164 — 3⅓" × 4" shipping, 6-up (2×3). Same horizontal grid as 5163.
 * 22806 — 2" × 2" rounded square, 12-up (3×4). Margins 0.375" sides /
 *        0.75" top, 0.375" column gutter, 0.5" row gutter.
 * 22807 — 2" round, 12-up (3×4). Same grid as 22806, circular die-cut.
 */
export const LABEL_TEMPLATES: LabelTemplate[] = [
  {
    id: "avery-5160",
    name: 'Address 1" × 2⅝" — 30 per sheet',
    stockCode: "Avery 5160 / 8160",
    sheetWIn: 8.5,
    sheetHIn: 11,
    marginTopIn: 0.5,
    marginLeftIn: 0.1875,
    labelWIn: 2.625,
    labelHIn: 1,
    cols: 3,
    rows: 10,
    gutterXIn: 0.125,
    gutterYIn: 0,
    cornerRadiusIn: 0.1,
  },
  {
    id: "avery-5163",
    name: 'Shipping 2" × 4" — 10 per sheet',
    stockCode: "Avery 5163 / 8163",
    sheetWIn: 8.5,
    sheetHIn: 11,
    marginTopIn: 0.5,
    marginLeftIn: 0.15625,
    labelWIn: 4,
    labelHIn: 2,
    cols: 2,
    rows: 5,
    gutterXIn: 0.1875,
    gutterYIn: 0,
    cornerRadiusIn: 0.125,
  },
  {
    id: "avery-5164",
    name: 'Shipping 3⅓" × 4" — 6 per sheet',
    stockCode: "Avery 5164 / 8164",
    sheetWIn: 8.5,
    sheetHIn: 11,
    marginTopIn: 0.5,
    marginLeftIn: 0.15625,
    labelWIn: 4,
    labelHIn: 3.3333333,
    cols: 2,
    rows: 3,
    gutterXIn: 0.1875,
    gutterYIn: 0,
    cornerRadiusIn: 0.125,
  },
  {
    id: "avery-22806",
    name: 'Square 2" × 2" — 12 per sheet',
    stockCode: "Avery 22806",
    sheetWIn: 8.5,
    sheetHIn: 11,
    marginTopIn: 0.75,
    marginLeftIn: 0.375,
    labelWIn: 2,
    labelHIn: 2,
    cols: 3,
    rows: 4,
    gutterXIn: 0.375,
    gutterYIn: 0.5,
    cornerRadiusIn: 0.09375,
  },
  {
    id: "avery-22807",
    name: 'Round 2" — 12 per sheet',
    stockCode: "Avery 22807",
    sheetWIn: 8.5,
    sheetHIn: 11,
    marginTopIn: 0.75,
    marginLeftIn: 0.375,
    labelWIn: 2,
    labelHIn: 2,
    cols: 3,
    rows: 4,
    gutterXIn: 0.375,
    gutterYIn: 0.5,
    cornerRadiusIn: 1,
    round: true,
  },
];

export function getLabelTemplate(id: string): LabelTemplate | undefined {
  return LABEL_TEMPLATES.find((t) => t.id === id);
}

/**
 * Build a `custom` template for stock not in the registry. Callers supply the
 * full geometry; id is fixed to "custom".
 */
export function customLabelTemplate(
  geometry: Omit<LabelTemplate, "id" | "name" | "stockCode"> &
    Partial<Pick<LabelTemplate, "name" | "stockCode">>,
): LabelTemplate {
  return {
    id: "custom",
    name: geometry.name ?? "Custom stock",
    stockCode: geometry.stockCode ?? "custom",
    ...geometry,
  };
}

/** Dev-time sanity check: the grid must tile the sheet exactly (±1/64"). */
export function assertTemplateGeometry(t: LabelTemplate): void {
  const w =
    t.marginLeftIn * 2 + t.cols * t.labelWIn + (t.cols - 1) * t.gutterXIn;
  const h =
    t.marginTopIn * 2 + t.rows * t.labelHIn + (t.rows - 1) * t.gutterYIn;
  const tol = 1 / 64;
  if (Math.abs(w - t.sheetWIn) > tol || Math.abs(h - t.sheetHIn) > tol) {
    console.error(
      `[label-print] Template ${t.id} does not tile its sheet: grid ${w.toFixed(4)}×${h.toFixed(4)}in vs sheet ${t.sheetWIn}×${t.sheetHIn}in`,
    );
  }
}

if (process.env.NODE_ENV !== "production") {
  LABEL_TEMPLATES.forEach(assertTemplateGeometry);
}
