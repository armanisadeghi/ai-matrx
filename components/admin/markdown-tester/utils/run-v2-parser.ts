// components/admin/markdown-tester/utils/run-v2-parser.ts
// One-shot run of the local V2 splitter — the same parser that
// MarkdownStream uses for rendering. Used by both the auto-detect-on-save
// flow and the Analysis tab's drift comparison.
//
// Callers that need the SplitterBlock type should import it directly from
// content-splitter-v2 — this file does not re-export it (no-barrel-files).

import {
  splitContentIntoBlocksV2,
  type SplitterBlock,
} from "@/components/mardown-display/markdown-classification/processors/utils/content-splitter-v2";

export function runV2Parser(content: string): SplitterBlock[] {
  return splitContentIntoBlocksV2(content);
}
