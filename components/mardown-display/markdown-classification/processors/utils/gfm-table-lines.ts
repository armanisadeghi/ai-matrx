/**
 * THE GFM table rule and its streaming line helpers live in `@ai-matrx/content-ir/source`
 * (chat-package-move P14); kept for its many app importers.
 */
export {
  continuesTable,
  findTableEnd,
  findTableStart,
  isGfmDelimiterRow,
  isPipeLedRow,
  lineIndent,
  opensTable,
  rowCells,
  splitRowSegments,
  startsHtmlBlock,
  startsPipelessTable,
  tableContainerIndent,
  tableStartsAt,
  unescapeCellPipes,
  findWholeTableStart,
  startsLikeTableRow,
  isGrowingDelimiterRow,
  trailingTableStart,
} from "@ai-matrx/content-ir/source";
