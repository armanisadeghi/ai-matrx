/**
 * Pluggable Column-4 module contract.
 *
 * A module describes WHAT the agent extracts from the transcript and HOW the
 * resulting payload is rendered. The studio scheduler invokes the module's
 * agent on a configurable cadence, persists the output as
 * `studio_module_segments` rows, and dispatches to the module's renderer.
 *
 * The metadata file (`registry-metadata.ts`) holds the pieces that need to
 * be safe to import server-side (label, icon, defaults). The dynamic
 * runtime pieces — `buildScope` / `parseRun` — live alongside the module's
 * implementation file and are looked up at run time only.
 */

import type { LucideIcon } from "lucide-react";
import type { ApplicationScope } from "@ai-matrx/chat/agents/utils/scope-mapping";
import type {
  CleanedSegment,
  ConceptItem,
  ModuleId,
  ModuleSegment,
  RawSegment,
  StudioSession,
} from "../types";

export interface ModuleDefinitionMetadata {
  id: ModuleId;
  /** Short human-facing label shown in the module picker. */
  label: string;
  /** One-line description shown in the module picker tooltip. */
  description: string;
  icon: LucideIcon;
  /** Default shortcut id; per-session overrides land in `studio_session_settings`. */
  defaultShortcutId: string;
  /** Default tick cadence (ms). Per-session overrides clamped to MODULE_INTERVAL_{MIN,MAX}_MS. */
  defaultIntervalMs: number;
  /**
   * BlockRenderer key. Each rendered module segment dispatches through the
   * existing markdown block-registry so we don't reinvent renderers.
   * Must already exist in `BlockComponentRegistry`.
   */
  blockType: string;
}

export interface ModuleScopeInputs {
  rawSegments: RawSegment[];
  cleanedSegments: CleanedSegment[];
  conceptItems: ConceptItem[];
  /** Module segments emitted by EARLIER passes for the current module. */
  priorModuleSegments: ModuleSegment[];
  /** tEnd of the last raw covered by the most recent SUCCESSFUL pass for this module. */
  lastModuleCoverageTEnd: number;
  session: StudioSession;
}

export interface ModuleScopeResult {
  /** ApplicationScope payload for `useShortcutTrigger`. */
  scope: ApplicationScope;
  /** True iff there's enough new material to invoke the agent. */
  hasNewWindow: boolean;
  /** tStart of the new raw window, or null when none. */
  windowStartTime: number | null;
  /** tEnd of the new raw window, or null when none. */
  windowEndTime: number | null;
  /** Char-range stamped on the run row for coverage recovery. */
  inputCharRange: [number, number] | null;
}

export interface ParsedModuleSegment {
  payload: unknown;
  tStart: number | null;
  tEnd: number | null;
}

export interface ModuleDefinition extends ModuleDefinitionMetadata {
  /**
   * Build the scope object passed to the agent + decide whether the pass
   * should fire. Must be deterministic — no side effects.
   */
  buildScope(inputs: ModuleScopeInputs): ModuleScopeResult;
  /**
   * Parse the agent's response text into one or more module segments.
   * Returning an empty array marks the run "complete" with no inserts.
   * Returning null marks the run "failed" (caller surfaces the error).
   */
  parseRun(
    responseText: string,
    runContext: { passIndex: number; windowStart: number; windowEnd: number },
  ): ParsedModuleSegment[] | null;
}
