// features/marketing/reports/saved/generate-outcome.ts — one `seo_report save`
// outcome (through the screen-run door) to one screen state. Pure, so every
// state the Generate button can show is tested without a server.
//
// The save path today: a save made outside a conversation is refused by
// `chat.artifact` row security (ruling pending with Arman, OSP-27). The server
// answers `error_type: "validation"` with a long sentence naming SQLSTATE 42501.
// The screen shows a SHORT reason in its layout slot and the server's own words
// in the tooltip — never hides the button, never works around the refusal.

import type { ToolActionOutcome } from "@ai-matrx/chat/action-requests/hooks/useToolAction";
import { isToolEnvelope, type ToolEnvelope } from "@ai-matrx/chat/action-requests/screen-run";
import type { SeoReportSaveData } from "./types";

export type GenerateState =
  | { kind: "idle" }
  | { kind: "saved"; reportId: string; version: number; replaced: boolean; link: string }
  /** `short` fits a 60-character slot; `detail` is ≤140 for the tooltip. */
  | { kind: "refused"; short: string; detail: string };

export const ROW_SECURITY_SHORT = "Not saved: screen saves are blocked for now";

const SLOT = 60;
const TOOLTIP = 140;

function clip(text: string, budget: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= budget ? flat : `${flat.slice(0, budget - 1).trimEnd()}…`;
}

/** The first clause of a server sentence — up to its first full stop or semicolon. */
function firstClause(text: string): string {
  const match = text.match(/^[^.;]*[.;]?/);
  return (match?.[0] ?? text).replace(/[;]$/, ".").trim();
}

export function isRowSecurityRefusal(message: string): boolean {
  return /row-level security|42501|refused the write|InsufficientPrivilege/i.test(message);
}

export function refusalFrom(message: string, suggested: string | null): GenerateState {
  if (isRowSecurityRefusal(message)) {
    return {
      kind: "refused",
      short: ROW_SECURITY_SHORT,
      detail: clip(
        suggested ? firstClause(suggested) : "Access rules refuse a report saved outside a chat.",
        TOOLTIP,
      ),
    };
  }
  return {
    kind: "refused",
    short: clip(`Not saved: ${firstClause(message)}`, SLOT),
    detail: clip(suggested ? `${firstClause(message)} ${firstClause(suggested)}` : message, TOOLTIP),
  };
}

export function generateStateFromOutcome(
  outcome: ToolActionOutcome<ToolEnvelope<SeoReportSaveData>>,
): GenerateState {
  switch (outcome.status) {
    case "declined":
    case "dismissed":
      return { kind: "refused", short: "Not saved: declined", detail: "Nothing was spent and nothing was saved." };
    case "busy":
      return { kind: "refused", short: clip(outcome.message, SLOT), detail: clip(outcome.message, TOOLTIP) };
    case "error":
      return refusalFrom(outcome.error.message, outcome.error.suggested_action);
    case "ok": {
      const envelope = outcome.output;
      if (!isToolEnvelope<SeoReportSaveData>(envelope) || !envelope.data) {
        const said = isToolEnvelope(envelope) ? envelope.notices?.[0] : null;
        return refusalFrom(said ?? "The tool answered in a shape this page cannot read.", null);
      }
      return {
        kind: "saved",
        reportId: envelope.data.report_id,
        version: envelope.data.version,
        replaced: envelope.data.replaced_earlier_version,
        link: envelope.data.link,
      };
    }
  }
}
