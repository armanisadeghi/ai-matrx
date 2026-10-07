"use client";

/**
 * The app's data-tool renderer REGISTRATIONS into `@ai-matrx/chat` (chat-package-move CPM-009b:
 * feature tool renderers become registrations; the package's `registerToolRenderer` is the door).
 * Imported once for its side effect by `providers/ChatSurfaceRegistrations.tsx`.
 *
 * Each registration keeps the tool's existing entry (labels, subtitle, header extras) and swaps
 * only the body: `answerRenderer(previous)` draws rows as the table, writes as a line with a door,
 * everything else as one sentence, and hands any answer it does not read to the previous body.
 *
 * The common data set (`DATA_TOOLS`, `dataToolDisplays.ts`) is held by guard 3
 * (`__tests__/every-data-tool-has-a-display.test.tsx`).
 */

import {
  registerToolRenderer,
  toolRendererRegistry,
} from "@ai-matrx/chat/tool-call-visualization/registry/registry";
import type { ToolRenderer } from "@ai-matrx/chat/tool-call-visualization/types";
import { answerRenderer } from "./RecordsAnswerView";

/** The tools whose answers `answerRenderer` reads (`readRecordsAnswer`). */
export const ANSWER_READ_FOR = ["records", "table"] as const;

/**
 * The `records` split experiment (aidream `matrx_records/agent/split.py`, records-split-2026-10):
 * these tools run the same engine and answer in the same shape as `records`, so each is drawn by
 * the `records` renderer under its own name. Remove with the losing concept.
 */
export const RECORDS_SPLIT_TOOLS = [
  "records_read", "records_write", "records_tables", "records_build", "records_help",
  "records_data", "records_structure",
  "records_form", "records_capture", "records_booking", "records_checklist", "records_board",
  "records_dashboard", "records_document", "records_portal", "records_signature_request",
  "records_subscription", "records_enrich",
] as const;

const registered = new WeakSet<ToolRenderer>();

export function registerDataToolRenderers(registry: Record<string, ToolRenderer> = toolRendererRegistry): void {
  for (const toolName of ANSWER_READ_FOR) {
    const previous = registry[toolName];
    if (!previous || registered.has(previous)) continue;
    const next: ToolRenderer = {
      ...previous,
      InlineComponent: answerRenderer(previous.InlineComponent),
      OverlayComponent: answerRenderer(previous.OverlayComponent ?? previous.InlineComponent),
    };
    registered.add(next);
    if (registry === toolRendererRegistry) registerToolRenderer(toolName, next);
    else registry[toolName] = next;
  }
  const records = registry.records;
  if (!records) return;
  for (const toolName of RECORDS_SPLIT_TOOLS) {
    if (registry[toolName]?.InlineComponent === records.InlineComponent) continue;
    const next: ToolRenderer = { ...records, toolName };
    if (registry === toolRendererRegistry) registerToolRenderer(toolName, next);
    else registry[toolName] = next;
  }
}

registerDataToolRenderers();
