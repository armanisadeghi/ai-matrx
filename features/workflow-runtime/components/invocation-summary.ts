/**
 * The one-line summary of an invocation in a readout's compact table mode.
 *
 * A kind is never drawn as raw JSON (Arman, 2026-09-30): an invocation whose
 * output is a kind — declared, carried by the value's own `__kind`, or arriving
 * as kind JSON in the text tail — reads as the kind's human name plus the
 * instance's title (`deriveInstanceTitle`, the same derivation saved instances
 * use), never as the first 80 characters of its JSON. Prose stays prose;
 * genuinely kindless JSON may still show as JSON. Null = nothing to say yet
 * (the caller shows the phase).
 */

import { deriveInstanceTitle } from "@/features/content-ir/studio/instance-title";
import {
  firstKindSlug,
  jsonKindSignal,
} from "@/features/content-ir/surfaces/json-kind-signal";

import { readAgentRunOutput } from "../agent-run-output";
import type { NodeInvocationState } from "../redux/workflow-runs.slice";
import { humanizeKind } from "./run/node-presentation";

const MAX_CHARS = 80;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function ownKind(value: unknown): string | null {
  if (!isRecord(value)) return null;
  const kind = value.__kind;
  return typeof kind === "string" && kind.trim() ? kind.trim() : null;
}

function clip(text: string): string {
  return text.length > MAX_CHARS ? `${text.slice(0, MAX_CHARS)}…` : text;
}

function kindLabel(kind: string, value: unknown): string {
  const name = humanizeKind(kind);
  const title = isRecord(value) ? deriveInstanceTitle(value) : null;
  return clip(title ? `${name} · ${title}` : name);
}

export function invocationSummary(inv: NodeInvocationState): string | null {
  const output = inv.output;
  const agent = output !== null ? readAgentRunOutput(output) : null;
  // The value the kind describes: an agent's structured answer, else the
  // output itself.
  const value = agent?.structured ?? output;
  const kind = inv.outputKind ?? ownKind(value);
  if (kind) return kindLabel(kind, value);

  const text =
    inv.textTail.length > 0 ? inv.textTail : (agent?.finalText ?? null);
  if (text) {
    if (jsonKindSignal(text) === "kind") {
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        // Still arriving, or truncated: the slug alone names it.
      }
      const slug = ownKind(parsed) ?? firstKindSlug(text);
      return slug ? kindLabel(slug, parsed) : "Arriving…";
    }
    return clip(text);
  }
  if (output !== null && !agent) return clip(JSON.stringify(output));
  if (inv.error?.message) return clip(inv.error.message);
  return null;
}
