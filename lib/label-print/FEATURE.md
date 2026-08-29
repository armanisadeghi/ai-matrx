# label-print — QR label-sheet printing core

Warehouse-grade QR labels on standard 8.5" × 11" label stock (Avery and
compatibles). The printing half of the commerce QR system: a DB/pool/batches
lane feeds label data into this seam; this core owns geometry, rendering,
print, preview, calibration, and PDF. Built on the block-print system
(`lib/block-print/`, `block-print-system` skill).

## The seam (what other lanes consume)

Data shape — `QrLabelPrintData` (`qr-labels-printer.ts`):

```ts
{ labels: { qrValue: string; caption?: string; lines?: string[] }[];
  templateId: string;            // registry id, or "custom"
  customTemplate?: LabelTemplate }
```

Entry points:

- `qrLabelsPrinter: BlockPrinter` — hand to `usePrintOptions` /
  `<PrintOptionsDialog>` (`@/lib/block-print/PrintOptionsDialog`); each
  registry template is a variant, settings below.
- `printQrLabelSheet(data, variantId?, settings?)` — the same path, direct.
- `printCalibrationSheet(template)` — grid outline + crop marks only.
- `downloadLabelsPdf(data, templateId?, settings?, filename?)`
  (`qr-labels-pdf.ts`) — jsPDF file instead of the print dialog. **jspdf is
  dynamically imported inside the function body** (code-splitting rule 6);
  keep it that way.
- `<LabelSheetPreview template labels …/>` (`LabelSheetPreview.tsx`) —
  scaled on-screen sheet preview (percent-positioned, exact proportions),
  `calibration` prop for outline view, `pageIndex` for multi-sheet paging.

Live demo (all of it wired): `app/(dev)/demos/tests/qr-labels/qr-label-generator/page.dev.tsx`
(Manual entry / papaparse CSV of `qr_value, line1..line6` / preview + print +
PDF + calibration).

First production consumer: `features/commerce-intake/labels/` (the pooled
label-code system — mint → print → claim-on-scan; batches at
`/commerce/labels`), which feeds `{ labels, templateId }` through every entry
point above and defaults `ecLevel` from the `commerce.labels.qr_ec_level` knob.

## Template registry (`label-templates.ts`)

`LabelTemplate` = `{id, name, stockCode, sheetWIn, sheetHIn, marginTopIn,
marginLeftIn, labelWIn, labelHIn, cols, rows, gutterXIn, gutterYIn,
cornerRadiusIn?, round?}` — inches, from Avery's published template specs.
**ONE generic grid renderer is driven by these numbers — never a
hand-written CSS block per stock.** `assertTemplateGeometry` verifies each
template tiles its sheet (dev-time console.error on drift).

Seeded: Avery **5160/8160** (1"×2⅝", 30-up) · **5163/8163** (2"×4", 10-up —
the clothing-trial 2×5 layout) · **5164/8164** (3⅓"×4", 6-up) · **22806**
(2"×2" square, 12-up) · **22807** (2" round, 12-up). Custom stock:
`customLabelTemplate(geometry)` + `templateId: "custom"`.

## The printer (`qr-labels-printer.ts`)

Variants = the registry templates. Settings (uses all four `PrintSetting`
types): `startAtLabel` (number — **leading** blank cells so a partial sheet
is reusable; trailing cells pad the last page), `copiesPerCode` (number),
`showCaption` / `showLines` (boolean), `labelRange` (range →
`rangeFrom`/`rangeTo`, 0 = unbounded), `ecLevel` (select L/M/Q, default M),
`calibrationPage` (boolean — routes to the calibration renderer).

Fidelity rules — the reasons this core exists; do not regress them:

- **Data URIs only.** The print window is a fresh unauthenticated document;
  every QR is generated client-side (`qrcode`, deferred import at call time)
  and inlined. Never a fetched image.
- **Quiet zone ≥ 4 modules** rendered inside each data URI
  (`QUIET_ZONE_MODULES`) — `margin: 0` is out of spec (the old generator's
  defect).
- **`print-color-adjust: exact`** on cells; QRs rasterized at 300 dpi for
  their printed size with `image-rendering: pixelated`.
- **Inch-exact geometry**: `@page { size: WIn HIn; margin: 0 }`, cells
  absolutely positioned from the template numbers; the screen-only banner
  tells the user "100% scale, no margins, Portrait".
- **Captions auto-shrink** (LP_FIT_SCRIPT, the flashcards FIT_TEXT pattern)
  — text never bleeds onto a neighboring label.
- Cell layout is automatic: aspect ratio ≥ 1.8 → QR left + caption/lines
  right; otherwise QR stacked over caption (round labels inscribe).
  `computeCellLayout` is shared by printer, preview, and PDF — one geometry
  brain.

## Calibration

`printCalibrationSheet` / `calibrationPage` setting / `LabelSheetPreview
calibration` prop: numbered dashed outlines of every cell + crop marks at
the grid corners. Print it on plain paper, hold against the label stock,
verify alignment before burning labels.

## History

Supersedes `lib/qr-labels/LabelGenerator.tsx` and the dev routes'
hard-coded jsPDF generator (deleted 2026-08-29 per no-legacy; its 2×5
2"×4" layout is the `avery-5163` template).

## Change Log

- 2026-08-29 — Created: registry (5 Avery stocks + custom), qrLabelsPrinter,
  LabelSheetPreview, calibration page, downloadLabelsPdf; added
  `number`/`select` setting types to block-print contract; deleted the old
  LabelGenerator + pdf-generator dead twin. Verified against code this date.
