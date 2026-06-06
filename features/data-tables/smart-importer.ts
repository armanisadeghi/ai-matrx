/**
 * smart-importer — heuristic detection that routes an XLSX/CSV upload to
 * the better destination: typed dataset (/data) vs lossless workbook (/workbooks).
 *
 * Why the binary choice matters:
 *   - **Typed dataset** = one row per object, each cell a JSONB value keyed
 *     by a first-class field. Best for "rational" tabular data — header row
 *     + uniform-type columns + no formatting nuance. Queryable, indexable,
 *     edit-per-cell.
 *   - **Workbook** = Univer-rendered spreadsheet with merged cells, formulas,
 *     formatting, multi-sheet, multi-region. Best for "look-sensitive" sheets.
 *
 * The detector runs in the browser before either import path begins. It does
 * NOT navigate or commit anything — it returns a routing recommendation plus
 * confidence and reasons. The caller decides what to do with it (auto-route,
 * show a confirm dialog, etc.).
 *
 * Algorithm: scores 7 signals on each side and returns the winner. Designed
 * to surface "obvious workbook" cases (merged cells, formulas, multi-sheet,
 * heavy styling) with high confidence and "obvious typed" cases (uniform
 * columns, clear header) with high confidence, while flagging genuinely
 * ambiguous files for user choice.
 */

import * as XLSX from "xlsx";

export type ImportRouting = "typed" | "workbook";

export type ImportRouteDetection = {
  routing: ImportRouting;
  /** 0..1. Above 0.6 we recommend auto-routing; below, surface a choice. */
  confidence: number;
  scores: { typed: number; workbook: number };
  /** Short user-facing reasons, one per side. */
  reasons: { typed: string[]; workbook: string[] };
  /** Number of sheets the file contains. */
  sheetCount: number;
  /** Row count of the first sheet (the typed-import candidate). */
  firstSheetRowCount: number;
};

const SCORES = {
  MERGED_CELLS: 80,
  FORMULA_HEAVY: 60,
  MULTIPLE_SHEETS: 40,
  UNIFORM_COLUMNS: 50,
  MIXED_COLUMNS: 50,
  HEADER_ROW: 40,
  SPARSITY: 30,
  STYLED_CELLS: 30,
  WIDE_DATA_EXPORT: 20,
  TALL_LOG_LIKE: 20,
};

const FORMULA_PROPORTION_THRESHOLD = 0.05;
const UNIFORM_COLUMN_PCT_HIGH = 0.8;
const UNIFORM_COLUMN_PCT_LOW = 0.4;
const PER_COLUMN_UNIFORMITY_THRESHOLD = 0.9;
const SPARSITY_THRESHOLD = 0.15;
const STYLED_CELLS_THRESHOLD = 0.1;
const SAMPLE_ROWS_FOR_UNIFORMITY = 100;

/**
 * Read an XLSX/CSV file and decide where it should land. Pure detection —
 * does NOT mutate state, navigate, or hit the server.
 */
export async function detectImportRoute(
  file: File,
): Promise<ImportRouteDetection> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, {
    type: "array",
    cellDates: true,
    cellFormula: true,
    cellStyles: true,
  });

  let workbookScore = 0;
  let typedScore = 0;
  const workbookReasons: string[] = [];
  const typedReasons: string[] = [];

  const sheetNames = wb.SheetNames;
  const firstSheetName = sheetNames[0];
  const firstSheet = firstSheetName ? wb.Sheets[firstSheetName] : undefined;

  // Multi-sheet ----------------------------------------------------------
  if (sheetNames.length > 1) {
    workbookScore += SCORES.MULTIPLE_SHEETS;
    workbookReasons.push(`${sheetNames.length} sheets`);
  }

  // Empty / unreadable ---------------------------------------------------
  if (!firstSheet) {
    return {
      routing: "typed",
      confidence: 0,
      scores: { typed: 0, workbook: 0 },
      reasons: { typed: ["empty file"], workbook: [] },
      sheetCount: 0,
      firstSheetRowCount: 0,
    };
  }

  // Per-sheet pass: count formulas, styled cells, merges --------------
  let formulaCellCount = 0;
  let styledCellCount = 0;
  let totalNonEmptyCells = 0;
  let totalMerges = 0;

  for (const name of sheetNames) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    const mergesArr = ws["!merges"] as XLSX.Range[] | undefined;
    if (mergesArr && mergesArr.length > 0) totalMerges += mergesArr.length;
    for (const key in ws) {
      if (key.startsWith("!")) continue;
      totalNonEmptyCells++;
      const cell = ws[key] as XLSX.CellObject | undefined;
      if (!cell) continue;
      if (typeof cell.f === "string" && cell.f.length > 0) formulaCellCount++;
      if (cell.s) styledCellCount++;
    }
  }

  // Merged cells --------------------------------------------------------
  if (totalMerges > 0) {
    workbookScore += SCORES.MERGED_CELLS;
    workbookReasons.push(
      `${totalMerges} merged cell range${totalMerges === 1 ? "" : "s"}`,
    );
  }

  // Formula-heavy -------------------------------------------------------
  const formulaProportion =
    totalNonEmptyCells > 0 ? formulaCellCount / totalNonEmptyCells : 0;
  if (formulaProportion > FORMULA_PROPORTION_THRESHOLD) {
    workbookScore += SCORES.FORMULA_HEAVY;
    workbookReasons.push(
      `${formulaCellCount} formula cell${formulaCellCount === 1 ? "" : "s"}`,
    );
  }

  // Style density -------------------------------------------------------
  const styleProportion =
    totalNonEmptyCells > 0 ? styledCellCount / totalNonEmptyCells : 0;
  if (styleProportion > STYLED_CELLS_THRESHOLD) {
    workbookScore += SCORES.STYLED_CELLS;
    workbookReasons.push("custom cell formatting");
  }

  // First-sheet structural analysis ------------------------------------
  // We only typed-evaluate the FIRST sheet because typed datasets are
  // single-table — extra sheets are workbook-territory regardless.
  const jsonData = XLSX.utils.sheet_to_json(firstSheet, {
    defval: null,
  }) as Array<Record<string, unknown>>;
  const refRange = XLSX.utils.decode_range(firstSheet["!ref"] ?? "A1:A1");
  const sheetCols = refRange.e.c - refRange.s.c + 1;
  const sheetRows = refRange.e.r - refRange.s.r + 1;

  if (jsonData.length > 0) {
    const headers = Object.keys(jsonData[0]);

    // Per-column uniformity --------------------------------------------
    let uniformColumns = 0;
    let samplesSeen = 0;
    for (const h of headers) {
      const values = jsonData
        .slice(0, SAMPLE_ROWS_FOR_UNIFORMITY)
        .map((row) => row[h])
        .filter((v) => v !== null && v !== undefined && v !== "");
      if (values.length === 0) {
        // An empty column is "uniform" trivially — don't double-count it
        // against typed-detection, but don't credit it either.
        continue;
      }
      samplesSeen++;
      const typeCounts: Record<string, number> = {};
      for (const v of values) {
        const t = simpleTypeOf(v);
        typeCounts[t] = (typeCounts[t] || 0) + 1;
      }
      const dominant = Math.max(...Object.values(typeCounts));
      if (dominant / values.length >= PER_COLUMN_UNIFORMITY_THRESHOLD) {
        uniformColumns++;
      }
    }
    const uniformFraction = samplesSeen > 0 ? uniformColumns / samplesSeen : 0;
    if (uniformFraction > UNIFORM_COLUMN_PCT_HIGH) {
      typedScore += SCORES.UNIFORM_COLUMNS;
      typedReasons.push(
        `${uniformColumns} of ${samplesSeen} columns have uniform types`,
      );
    } else if (uniformFraction < UNIFORM_COLUMN_PCT_LOW && samplesSeen > 0) {
      workbookScore += SCORES.MIXED_COLUMNS;
      workbookReasons.push("heterogeneous column types");
    }

    // Header row probability -------------------------------------------
    const row0Values = headers
      .map((h) => jsonData[0]?.[h])
      .filter((v) => v !== null && v !== undefined);
    const row0AllStrings =
      row0Values.length > 0 &&
      row0Values.every((v) => typeof v === "string");
    const row1 = jsonData[1];
    if (row0AllStrings && row1) {
      const row1HasNonString = Object.values(row1).some(
        (v) =>
          v !== null &&
          v !== undefined &&
          v !== "" &&
          typeof v !== "string",
      );
      if (row1HasNonString) {
        typedScore += SCORES.HEADER_ROW;
        typedReasons.push("header row followed by typed data");
      }
    }

    // Wide-data export pattern -----------------------------------------
    if (
      sheetCols > 100 &&
      sheetRows > 500 &&
      formulaProportion < 0.02 &&
      uniformFraction > UNIFORM_COLUMN_PCT_HIGH
    ) {
      typedScore += SCORES.WIDE_DATA_EXPORT;
      typedReasons.push("large structured data export");
    }

    // Tall append-only / log pattern ------------------------------------
    if (
      sheetRows > 5000 &&
      sheetCols < 20 &&
      uniformFraction > UNIFORM_COLUMN_PCT_HIGH
    ) {
      typedScore += SCORES.TALL_LOG_LIKE;
      typedReasons.push("large append-only / log-style dataset");
    }

    // Sparsity ----------------------------------------------------------
    const usableCells = jsonData.length * headers.length;
    const cellDensity = usableCells / Math.max(sheetRows * sheetCols, 1);
    if (cellDensity < SPARSITY_THRESHOLD) {
      workbookScore += SCORES.SPARSITY;
      workbookReasons.push("sparse multi-region layout");
    }
  }

  // Decision ------------------------------------------------------------
  const total = Math.max(typedScore + workbookScore, 1);
  const winnerScore = Math.max(typedScore, workbookScore);
  const loserScore = Math.min(typedScore, workbookScore);
  // Confidence: dominance of the winner, normalized so a runaway score is 1.
  const confidence =
    winnerScore === 0
      ? 0
      : (winnerScore - loserScore) / Math.max(winnerScore, 1);

  return {
    routing: workbookScore > typedScore ? "workbook" : "typed",
    confidence: Math.max(0, Math.min(1, confidence)),
    scores: { typed: typedScore, workbook: workbookScore },
    reasons: {
      typed: typedReasons.length > 0 ? typedReasons : ["no strong signal"],
      workbook:
        workbookReasons.length > 0 ? workbookReasons : ["no strong signal"],
    },
    sheetCount: sheetNames.length,
    firstSheetRowCount: jsonData.length,
  };
}

function simpleTypeOf(v: unknown): "number" | "string" | "boolean" | "date" {
  if (v instanceof Date) return "date";
  if (typeof v === "number") return "number";
  if (typeof v === "boolean") return "boolean";
  return "string";
}

/**
 * Threshold above which we recommend auto-routing (skip the confirm dialog).
 * Anything below this should surface the choice to the user.
 */
export const AUTO_ROUTE_CONFIDENCE = 0.6;
