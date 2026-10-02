/**
 * Scribe tool registry — the dispatcher uses this to (1) look up the Zod schema
 * to validate args and (2) look up the handler to run. One entry per scribe
 * tool, populated statically at module load. Mirrors the war-room registries.
 */

import type { z } from "zod";
import type { ScribeToolHandler } from "../handlers/types";
import { scribePlayAudioArgsSchema } from "./schemas";
import { playAudioHandler } from "../handlers/play-audio.handler";

export interface ScribeToolRegistryEntry {
  schema: z.ZodTypeAny;
  handler: ScribeToolHandler<unknown, unknown>;
}

const registry: Record<string, ScribeToolRegistryEntry> = {
  scribe_play_audio: {
    schema: scribePlayAudioArgsSchema,
    handler: playAudioHandler as ScribeToolHandler<unknown, unknown>,
  },
};

export function getScribeToolEntry(
  name: string,
): ScribeToolRegistryEntry | undefined {
  return registry[name];
}

export function getAllScribeTools(): readonly ScribeToolRegistryEntry[] {
  return Object.values(registry);
}
