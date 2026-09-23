/**
 * The `speech_script` message part — ordered spoken turns for text to speech.
 *
 * Canonical contract: `common-docs/systems/agents/typed-messages/FEATURE.md`
 * (Text to speech row). The server declares the part (aidream
 * `matrx_ai.speech.kinds.SpeechScript`, `SpeechScriptPart` in the user-input
 * union) and compiles it per vendor; this module is the AUTHORING side: the
 * constructor (both discriminator keys, always), the loose-record reader, and
 * the compatibility verdict the editor shows.
 */

import type { AIModelRecord } from "@/features/ai-models/redux/modelRegistrySlice";
import type { UserInputPart } from "@/features/agents/types/request.types";
import { parseCapabilities } from "@/features/ai-models/capabilities/parse";
import { partKind } from "@/features/agents/decision-questions/types";

export const SPEECH_SCRIPT_KIND = "speech_script" as const;

/** Server limit (`matrx_ai.speech.kinds.MAX_PAUSE_MS`). */
export const MAX_PAUSE_MS = 10_000;

export interface SpeechTurnSpec {
  /** Speaker name. Turns with the same name are the same speaker. */
  speaker: string;
  /** A provider voice id, a `{{variable}}`, or empty = the agent's Voice setting. */
  voice?: string | null;
  /** What is said. `{{variable}}` works. */
  text: string;
  /** Free-text performance direction for this turn only. */
  direction?: string | null;
  pause_after_ms?: number | null;
}

/** The part exactly as the server declares it on the wire (generated). */
export type SpeechScriptPart = Extract<UserInputPart, { type: "speech_script" }>;

/** Drop empty optional fields so the stored part carries only what was set. */
function cleanTurn(turn: SpeechTurnSpec): SpeechTurnSpec {
  const out: SpeechTurnSpec = { speaker: turn.speaker, text: turn.text };
  const voice = turn.voice?.trim();
  if (voice) out.voice = voice;
  const direction = turn.direction?.trim();
  if (direction) out.direction = direction;
  if (turn.pause_after_ms != null && Number.isFinite(turn.pause_after_ms)) {
    out.pause_after_ms = Math.max(0, Math.min(MAX_PAUSE_MS, Math.round(turn.pause_after_ms)));
  }
  return out;
}

/** The ONE constructor for the part — both keys, never one. */
export function newSpeechScriptPart(turns: SpeechTurnSpec[]): SpeechScriptPart {
  return {
    __kind: SPEECH_SCRIPT_KIND,
    type: SPEECH_SCRIPT_KIND,
    turns: turns.map(cleanTurn),
  };
}

export function newSpeechTurn(existing: SpeechTurnSpec[]): SpeechTurnSpec {
  const names = distinctSpeakers(existing);
  // Alternate between the first two speakers — the common dialogue case.
  const last = existing[existing.length - 1]?.speaker;
  const next =
    names.length >= 2 ? (names.find((n) => n !== last) ?? names[0]) : names[0];
  const voice = existing.find((t) => t.speaker === next && t.voice)?.voice ?? null;
  return { speaker: next ?? "Narrator", text: "", voice };
}

export function isSpeechScriptPart(
  part: Record<string, unknown> | null | undefined,
): boolean {
  return !!part && partKind(part) === SPEECH_SCRIPT_KIND;
}

export function readTurns(
  part: Record<string, unknown> | null | undefined,
): SpeechTurnSpec[] {
  const raw = (part as { turns?: unknown } | null | undefined)?.turns;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((t): t is Record<string, unknown> => !!t && typeof t === "object")
    .map((t) => ({
      speaker: typeof t.speaker === "string" ? t.speaker : "",
      voice: typeof t.voice === "string" ? t.voice : null,
      text: typeof t.text === "string" ? t.text : "",
      direction: typeof t.direction === "string" ? t.direction : null,
      pause_after_ms: typeof t.pause_after_ms === "number" ? t.pause_after_ms : null,
    }));
}

export function distinctSpeakers(turns: SpeechTurnSpec[]): string[] {
  const out: string[] = [];
  for (const t of turns) {
    const name = t.speaker.trim();
    if (name && !out.includes(name)) out.push(name);
  }
  return out;
}

/** A speaker bound to two different voices — the server refuses it. */
export function conflictingSpeakers(turns: SpeechTurnSpec[]): string[] {
  const bound = new Map<string, string>();
  const conflicts = new Set<string>();
  for (const t of turns) {
    const voice = t.voice?.trim();
    if (!voice) continue;
    const prev = bound.get(t.speaker);
    if (prev && prev !== voice) conflicts.add(t.speaker);
    else bound.set(t.speaker, voice);
  }
  return [...conflicts];
}

/** Audio out, no text out — the same capability fact the server routes on. */
export function modelProducesSpeech(model: AIModelRecord | null | undefined): boolean {
  if (!model) return false;
  const caps = parseCapabilities(model.capabilities, {
    modelId: model.id,
    modelName: model.name,
  });
  return caps.output.includes("audio") && !caps.output.includes("text");
}

/**
 * The model's speaker cap, read from its catalog controls (`multi_speaker`
 * max) exactly as the server's `speaker_cap` reads the offering rule. No
 * `multi_speaker` control = one voice. `null` = uncapped.
 */
export function speakerCapFor(model: AIModelRecord | null | undefined): number | null {
  const controls = (model?.controls ?? null) as Record<string, unknown> | null;
  const ms = controls?.multi_speaker as { allowed?: boolean; max?: number } | undefined;
  if (!ms) return 1;
  if (typeof ms.max === "number" && ms.max > 0) return ms.max;
  return ms.allowed === false ? 1 : null;
}

export type ScriptCompatibility =
  | { verdict: "native" }
  | { verdict: "unknown"; reason: string }
  | { verdict: "refused"; reason: string };

function modelLabel(model: AIModelRecord | null | undefined): string {
  return model?.common_name?.trim() || model?.name?.trim() || "This model";
}

/** The honest verdict on a script for the selected model. */
export function speechScriptCompatibility(
  model: AIModelRecord | null | undefined,
  modelId: string | null | undefined,
  turns: SpeechTurnSpec[],
): ScriptCompatibility {
  if (!model) {
    return modelId
      ? { verdict: "unknown", reason: "Loading this model's voices and speaker limit." }
      : { verdict: "refused", reason: "Pick a text-to-speech model to perform this script." };
  }
  if (!modelProducesSpeech(model)) {
    return {
      verdict: "refused",
      reason: `${modelLabel(model)} does not speak. A script is performed by a text-to-speech model; any other model reads it as a plain transcript.`,
    };
  }
  const speakers = distinctSpeakers(turns);
  const cap = speakerCapFor(model);
  if (cap !== null && speakers.length > cap) {
    return {
      verdict: "refused",
      reason: `${modelLabel(model)} performs at most ${cap} speaker${cap === 1 ? "" : "s"} per request; this script has ${speakers.length}. Merge speakers or choose a model with a higher limit.`,
    };
  }
  const conflicts = conflictingSpeakers(turns);
  if (conflicts.length > 0) {
    return {
      verdict: "refused",
      reason: `${conflicts.join(", ")} ${conflicts.length === 1 ? "has" : "have"} two different voices. A speaker keeps one voice for the whole script.`,
    };
  }
  return { verdict: "native" };
}

/**
 * THE audio render-block data for a speech-script run — one function for the
 * live stream and the reloaded message, so they render identically.
 *
 * The server stamps the performed script (and, when the vendor returns it,
 * word alignment + voice segments) on the audio part's `metadata`; the live
 * `media_block` event carries that same metadata. Both paths lift the two keys
 * to the top of the block data, where the player's script panel reads them.
 * Before this, only the reload path lifted them, so a live TTS run showed the
 * player alone until the page was reloaded.
 */
export function withPerformedScript<T extends object>(
  data: T,
  metadata: Record<string, unknown> | null | undefined,
): T & { speech_script?: unknown; alignment?: unknown } {
  return {
    ...data,
    speech_script: metadata?.speech_script,
    alignment: metadata?.alignment,
  };
}
