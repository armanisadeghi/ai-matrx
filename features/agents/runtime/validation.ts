// features/agents/runtime/validation.ts
//
// Pure helpers that gate user-facing actions on the resolved model
// capabilities. Used by the launcher (`execute-instance`) to check
// outbound content blocks against `model.capabilities.input`, by the
// stream processor to flag output blocks against `capabilities.output`,
// and by the builder composer to grey out attach buttons.
//
// Warn-only by default: callers branch on `ok` and surface a friendly
// message but still complete the request in this rollout phase. Step 3's
// follow-up ticket flips the call sites that should actually block.

import type {
  ContentType,
  ModelCapabilities,
} from "@/features/ai-models/capabilities/types";
import type { MessagePart } from "@/types/python-generated/stream-events";

/** Project a single MessagePart onto the canonical input ContentType. Null if not an input modality (e.g. tool calls, thinking). */
function messagePartToInputContentType(part: MessagePart): ContentType | null {
  if (part.type === "text") return "text";
  if (part.type !== "media") return null;
  if (part.kind === "image") return "image";
  if (part.kind === "audio") return "audio";
  if (part.kind === "video") return "video";
  if (part.kind === "document") return "document";
  // youtube, code_exec, etc. — not modeled as ContentType for capabilities.
  return null;
}

export type ValidationResult =
  | { ok: true }
  | { ok: false; rejected: ContentType[]; message: string };

/**
 * Validates every outbound block against the model's input capabilities.
 * `parts` is the assembled MessagePart[] (or a single text string, which
 * is always accepted).
 *
 * Note: `text` is always accepted (every model takes text input). We
 * only reject when a non-text input modality isn't in `caps.input`.
 */
export function validateMessageBlocks(
  parts: ReadonlyArray<MessagePart> | string | undefined,
  caps: ModelCapabilities,
): ValidationResult {
  if (typeof parts === "string" || parts === undefined) return { ok: true };
  const rejected = new Set<ContentType>();
  for (const p of parts) {
    const ct = messagePartToInputContentType(p);
    if (!ct || ct === "text") continue;
    if (!caps.input.includes(ct)) rejected.add(ct);
  }
  if (rejected.size === 0) return { ok: true };
  const list: ContentType[] = [];
  rejected.forEach((v) => list.push(v));
  const human = list.length === 1
    ? `${list[0]}s`
    : `${list.slice(0, -1).join("s, ")}s or ${list[list.length - 1]}s`;
  return {
    ok: false,
    rejected: list,
    message: `This model doesn't accept ${human}. Switch to a model that supports them or remove the attachment.`,
  };
}

/**
 * True iff the model can ACCEPT the given content type as input. Used
 * by the builder composer to grey out attach buttons.
 */
export function modelAcceptsInput(
  caps: ModelCapabilities,
  type: ContentType,
): boolean {
  return caps.input.includes(type);
}

/**
 * True iff the model can PRODUCE the given content type as output. Used
 * by the render-time guard to flag malformed stream outputs.
 */
export function modelProducesOutput(
  caps: ModelCapabilities,
  type: ContentType,
): boolean {
  return caps.output.includes(type);
}
