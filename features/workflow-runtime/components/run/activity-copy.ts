/**
 * activity-copy — the wire's raw markers, in the reader's language.
 *
 * The slice keeps activity entries verbatim (reducers hold truth, not prose).
 * This module is the ONLY place that turns them into sentences, because the
 * wire formats are quirky and every quirk needs one tolerant answer:
 *
 *   kind "tool"    → the BARE tool name (`web_search`), repeated identically
 *                    for started / progress / completed / error. Humanised to
 *                    words here. (aidream's lifecycle field is dropped at the
 *                    emitter — a fix is in flight; the JSON form is already
 *                    handled below so the richer frame needs no FE change.)
 *   kind "phase"   → a bare lowercase label (`processing`, `structuring`,
 *                    `reasoning:started`). Mapped to a human line.
 *   kind "warning" → json.dumps(WarningPayload) HARD-SLICED at 200 chars, so
 *                    it is usually INVALID JSON. Parsed leniently: real JSON
 *                    first, then a field scrape off the truncated blob, then
 *                    the raw text. Never throws, never shows a JSON blob.
 *
 * Pure module — no React. Everything returns display strings.
 */

import type { RunActivityEntry } from "../../redux/workflow-runs.slice";
import { humanizeIdentifier } from "./node-presentation";

/** `web_search` → "web search". Also survives camelCase and dotted names. */
export function humanizeToolName(raw: string): string {
  return raw
    .replace(/[._-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim()
    .toLowerCase();
}

/**
 * The known phase vocabulary, in the reader's words. An unknown phase is
 * humanised rather than hidden — a new engine label must still read as
 * something, never vanish from the feed.
 */
const PHASE_COPY: Record<string, string> = {
  processing: "Thinking it through",
  executing: "Running the step",
  analyzing: "Analyzing the material",
  transcribing: "Transcribing",
  synthesizing: "Pulling it together",
  structuring: "Structuring the material",
  searching: "Searching",
  retrying: "Trying again",
  complete: "Finished a pass",
  "reasoning:started": "Reasoning",
  "reasoning:stopped": "Finished reasoning",
};

export function phaseCopy(raw: string): string {
  const key = raw.trim().toLowerCase();
  return PHASE_COPY[key] ?? humanizeIdentifier(key);
}

/**
 * Recover the human half of a warning payload that may be truncated JSON.
 * Order: parse → scrape `user_message` → scrape `code` → the raw text.
 */
export function warningCopy(raw: string): string {
  const trimmed = raw.trim();
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (typeof parsed === "object" && parsed !== null) {
      const record = parsed as Record<string, unknown>;
      const message = record.user_message ?? record.system_message;
      if (typeof message === "string" && message) return message;
      if (typeof record.code === "string" && record.code) {
        return humanizeIdentifier(record.code);
      }
    }
  } catch {
    // Expected: the emitter slices the JSON mid-string. Fall through.
  }
  const scraped =
    /"user_message"\s*:\s*"((?:[^"\\]|\\.)*)/.exec(trimmed) ??
    /"system_message"\s*:\s*"((?:[^"\\]|\\.)*)/.exec(trimmed);
  if (scraped?.[1]) {
    const text = scraped[1].replace(/\\"/g, '"').replace(/\\n/g, " ").trim();
    if (text) return text;
  }
  const code = /"code"\s*:\s*"([^"]+)"/.exec(trimmed);
  if (code?.[1]) return humanizeIdentifier(code[1]);
  return trimmed.startsWith("{") ? "Something needed a second attempt" : trimmed;
}

/**
 * A tool marker may arrive as a bare name (today) or as a small JSON summary
 * `{tool, event, message}` (the richer form). Both resolve to one line, and
 * the human `message` wins whenever it is present because it carries the real
 * query / URL.
 */
export function toolCopy(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{")) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (typeof parsed === "object" && parsed !== null) {
        const record = parsed as Record<string, unknown>;
        if (typeof record.message === "string" && record.message) {
          return record.message;
        }
        if (typeof record.tool === "string" && record.tool) {
          return humanizeToolName(record.tool);
        }
      }
    } catch {
      // Fall through to the raw text.
    }
  }
  return humanizeToolName(trimmed);
}

export interface ActivityLine {
  /** The sentence the reader sees. Always non-empty. */
  text: string;
  /** The step it belongs to, already humanised. Null for run-level lines. */
  stepLabel: string | null;
  /** A small trailing fact (duration, 3/10). Null when there isn't one. */
  detail: string | null;
  /** Drives the icon + tint. */
  tone: "work" | "tool" | "done" | "warn" | "fail";
}

/**
 * One activity entry → one line. `stepLabels` comes from the definition, so a
 * feed line never shows a graph-local node id.
 */
export function activityLine(
  entry: RunActivityEntry,
  stepLabels: Record<string, string>,
): ActivityLine {
  const stepLabel = entry.nodeId
    ? (stepLabels[entry.nodeId] ?? humanizeIdentifier(entry.nodeId))
    : null;
  const detail = entry.detail;

  switch (entry.kind) {
    case "started":
      return { text: "Started", stepLabel, detail, tone: "work" };
    case "completed":
      return { text: "Finished", stepLabel, detail, tone: "done" };
    case "skipped":
      return { text: "Not needed this time", stepLabel, detail, tone: "done" };
    case "failed":
      return {
        text: entry.text ?? "Ran into a problem",
        stepLabel,
        detail,
        tone: "fail",
      };
    case "retry":
      return { text: "Trying again", stepLabel, detail, tone: "warn" };
    case "progress":
      return {
        text: entry.text ?? "Working",
        stepLabel,
        detail,
        tone: "work",
      };
    case "phase":
      return {
        text: phaseCopy(entry.text ?? ""),
        stepLabel,
        detail,
        tone: "work",
      };
    case "tool":
      return {
        text: toolCopy(entry.text ?? ""),
        stepLabel,
        detail,
        tone: "tool",
      };
    case "warning":
      return {
        text: warningCopy(entry.text ?? ""),
        stepLabel,
        detail,
        tone: "warn",
      };
    case "delivered":
      return {
        text: entry.text ? `Delivered ${entry.text}` : "Delivered a result",
        stepLabel,
        detail,
        tone: "done",
      };
    case "child":
      return {
        text: "Handed off to a sub-workflow",
        stepLabel,
        detail,
        tone: "work",
      };
    default:
      return { text: "Working", stepLabel, detail, tone: "work" };
  }
}
