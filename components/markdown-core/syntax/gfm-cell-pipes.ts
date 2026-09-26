/**
 * GFM's ONE table-cell rule for pipes (spec example 200; GitHub renders it so):
 * a row is split into cells FIRST, then the `\|` that kept a pipe inside a
 * cell is unescaped — inside code spans too. Every surface that shows a table
 * cell goes through this: Studio/Preview (remark-table-code-pipes, on code in
 * a table cell), the chat and artifact table (StreamingTableRenderer, on each
 * cell's inline source before the inline core reads it) and the table writer's
 * read-back (rich-editor/core/table-source). verify-RC-B4 R4-3, R5-2.
 * The rule itself lives in @ai-matrx/content-ir/source; this is its door here.
 */
export { unescapeCellPipes } from "@ai-matrx/content-ir/source";
