// features/rich-document/code-block/code-block-context.ts
//
// A code block inside an answer acts through the ONE action registry: the
// bridge builds a registry context with source `{ type: "raw" }` and these
// facts under `metadata.codeBlock`. Actions registered for code blocks read
// them back with `readCodeBlockFacts` — any other raw document (no facts)
// never shows them.

import type { CodeRunResult } from "./code-run";

export type CodeRunState =
  | { status: "running" }
  | { status: "done"; result: CodeRunResult }
  | { status: "error"; message: string };

export interface CodeBlockFacts {
  code: string;
  language: string;
  title?: string | null;
  conversationId?: string | null;
  messageId?: string | null;
  /** Host hook: show a Run result under the block. Absent → no Run action. */
  onRunResult?: (state: CodeRunState) => void;
  /** Host hook: toggle the CSV/TSV chart under the block. Absent → no Chart action. */
  onToggleChart?: () => void;
}

export const CODE_BLOCK_METADATA_KEY = "codeBlock";

export function readCodeBlockFacts(
  metadata: Record<string, unknown> | null | undefined,
): CodeBlockFacts | null {
  const raw = metadata?.[CODE_BLOCK_METADATA_KEY];
  if (!raw || typeof raw !== "object") return null;
  const facts = raw as Partial<CodeBlockFacts>;
  if (typeof facts.code !== "string") return null;
  return { ...facts, code: facts.code, language: typeof facts.language === "string" ? facts.language : "" };
}
