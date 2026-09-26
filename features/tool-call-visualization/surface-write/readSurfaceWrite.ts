/**
 * The surface-write receipt — before → after for a tool that changed a surface.
 *
 * aidream attaches it out of band (`matrx_ai/tools/surface_write.py`) and the
 * executor emits it as ONE `tool_step` event whose `data.step` is
 * `SURFACE_WRITE_STEP`, just before `tool_completed`. The event streams live
 * AND is persisted in `chat.tool_call.execution_events`, so `entry.events`
 * carries it on both paths — the diff card renders identically live and on
 * reload, from this one reader, for every tool.
 */

import type { ToolLifecycleEntry } from "@/features/agents/types/request.types";

/** Knobs (platform.feature_knob, seeded by aidream db/migrations/1321). */
export const DIFF_VIEW_KNOB = { feature: "agents.tool_cards", key: "diff_default_view" } as const;
export const DIFF_START_OPEN_KNOB = { feature: "agents.tool_cards", key: "diff_start_open" } as const;

/** The step name — one string, both repos (`SURFACE_WRITE_STEP` in aidream). */
export const SURFACE_WRITE_STEP = "surface_write";

export type SurfaceWriteMode =
  | "overwrite"
  | "patch"
  | "append"
  | "prepend"
  | "insert"
  | "create"
  | "structured";

export interface SurfaceWriteReceipt {
  targetType: string;
  targetId: string | null;
  targetLabel: string;
  mode: SurfaceWriteMode;
  contentFormat: "markdown" | "text" | "code" | "html" | "css" | "json";
  language: string | null;
  before: string;
  after: string;
  beforeChars: number;
  afterChars: number;
  truncated: boolean;
  edits: number | null;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/** Parse one receipt payload (the step's `metadata`), or null when it is not one. */
export function parseSurfaceWrite(raw: unknown): SurfaceWriteReceipt | null {
  const r = asRecord(raw);
  if (!r) return null;
  const before = str(r.before);
  const after = str(r.after);
  const mode = str(r.mode);
  if (before === null || after === null || !mode) return null;
  const format = str(r.content_format) ?? "text";
  return {
    targetType: str(r.target_type) ?? "surface",
    targetId: str(r.target_id),
    targetLabel: str(r.target_label) ?? "",
    mode: mode as SurfaceWriteMode,
    contentFormat: format as SurfaceWriteReceipt["contentFormat"],
    language: str(r.language),
    before,
    after,
    beforeChars: num(r.before_chars) ?? before.length,
    afterChars: num(r.after_chars) ?? after.length,
    truncated: r.truncated === true,
    edits: num(r.edits),
  };
}

/** The receipt a tool call carries, or null. Last one wins (one write per call today). */
export function readSurfaceWrite(
  entry: Pick<ToolLifecycleEntry, "events"> | null | undefined,
): SurfaceWriteReceipt | null {
  const events = entry?.events;
  if (!Array.isArray(events)) return null;
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i];
    if (ev?.event !== "tool_step") continue;
    const data = asRecord(ev.data);
    if (data?.step !== SURFACE_WRITE_STEP) continue;
    const parsed = parseSurfaceWrite(data.metadata);
    if (parsed) return parsed;
  }
  return null;
}

/** Map the receipt's format to the diff engine's language hint. */
export function diffLanguageOf(receipt: SurfaceWriteReceipt): string | undefined {
  switch (receipt.contentFormat) {
    case "code":
      return receipt.language ?? undefined;
    case "html":
      return "html";
    case "css":
      return "css";
    default:
      return undefined; // markdown / text / json → the light text engine
  }
}
