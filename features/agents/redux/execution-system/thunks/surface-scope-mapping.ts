"use client";

/**
 * Shared surface value-mapping resolution for launch-time seeding and
 * submit-time live-scope refresh.
 *
 * Layers are merged weakest → strongest per target: inherited/global binding,
 * organization bindings, user binding, then shortcut mappings. Required
 * values fail loudly; prompt_user mappings use the canonical prompt host only
 * when the execution display is interactive.
 */

import {
  promptForValues,
  type ValuePromptField,
} from "@/components/dialogs/value-prompts/ValuePromptsDialogHost";
import { toast } from "@/lib/toast";
import { resolveShortcutMappings } from "@/features/agent-shortcuts/utils/resolveShortcutMappings";
import { registerSurfaceWritePolicies } from "@/features/surfaces/runtime/surface-writeback";
import { fetchSurfaceBindingLayers } from "@/features/surfaces/services/bind-agent-to-surface.service";
import type {
  ValueMapping,
  ValueMappingMap,
  WritePolicyMap,
} from "@/features/surfaces/types";
import {
  mergeValueMappingLayers,
  type MappingLayer,
  type MergedValueMappings,
} from "@/features/surfaces/utils/merge-value-mappings";

export type { MergedValueMappings } from "@/features/surfaces/utils/merge-value-mappings";

export interface ShortcutMappingSource {
  valueMappings: ValueMappingMap | null;
  scopeMappings: Record<string, string> | null;
  contextMappings: Record<string, string> | null;
  /** The shortcut's per-write-target overrides — strongest merge layer. */
  writePolicies?: WritePolicyMap | null;
}

export async function resolveLaunchMappingLayers(
  agentId: string,
  surfaceName: string | undefined,
  shortcut: ShortcutMappingSource | null,
): Promise<MergedValueMappings | null> {
  const layers: MappingLayer[] = [];
  if (surfaceName) {
    layers.push(...(await fetchSurfaceBindingLayers(agentId, surfaceName)));
  }
  if (shortcut) {
    const shortcutMappings = resolveShortcutMappings(shortcut);
    const shortcutPolicies = shortcut.writePolicies ?? null;
    if (
      Object.keys(shortcutMappings).length > 0 ||
      (shortcutPolicies && Object.keys(shortcutPolicies).length > 0)
    ) {
      layers.push({
        name: "shortcut",
        mappings: shortcutMappings,
        writePolicies: shortcutPolicies,
      });
    }
  }
  if (layers.length === 0) return null;

  const result = mergeValueMappingLayers(layers);
  if (
    Object.keys(result.merged).length === 0 &&
    Object.keys(result.writePolicies).length === 0
  ) {
    return null;
  }

  for (const inert of result.inertLayers) {
    console.warn(
      `[surfaces] mapping layer "${inert}" for (agent=${agentId}, surface=${surfaceName ?? "none"}) exists but contributed no keys — fully shadowed by more specific layers`,
      { provenance: result.provenance },
    );
  }
  return result;
}

/** Register the binding-resolved write-policy overrides for this run. */
export function applyLaunchWritePolicies(
  resolved: MergedValueMappings | null,
  agentId: string,
  surfaceName: string | null | undefined,
): void {
  if (!surfaceName || !resolved) return;
  registerSurfaceWritePolicies(
    resolved.writePolicies,
    `${agentId}::${surfaceName}`,
    surfaceName,
  );
}

export async function prepareLaunchMappings(args: {
  merged: ValueMappingMap;
  applicationScope: Record<string, unknown>;
  /** False for direct/background — no UI may interrupt those executions. */
  interactive: boolean;
  /** Dialog title — the shortcut/agent label. */
  title: string;
}): Promise<ValueMappingMap> {
  const { merged, applicationScope, interactive, title } = args;

  const missingRequired: string[] = [];
  for (const [key, mapping] of Object.entries(merged)) {
    if (
      mapping.mapType === "surface_value" &&
      mapping.required &&
      applicationScope[mapping.target] === undefined
    ) {
      missingRequired.push(`"${key}" needs surface value "${mapping.target}"`);
    }
  }
  if (missingRequired.length > 0) {
    const message = `Cannot run "${title}" — required values are missing from this page: ${missingRequired.join("; ")}`;
    toast.error(message);
    throw new Error(message);
  }

  const promptEntries = Object.entries(merged).filter(
    (
      entry,
    ): entry is [string, Extract<ValueMapping, { mapType: "prompt_user" }>] =>
      entry[1].mapType === "prompt_user",
  );
  if (promptEntries.length === 0) return merged;

  const out: ValueMappingMap = { ...merged };
  if (!interactive) {
    const requiredNames = promptEntries
      .filter(([, mapping]) => mapping.required)
      .map(([key]) => `"${key}"`);
    if (requiredNames.length > 0) {
      const message = `Cannot run "${title}" in the background — required input(s) ${requiredNames.join(", ")} must be entered by a user. Use an interactive display mode.`;
      toast.error(message);
      throw new Error(message);
    }
    for (const [key] of promptEntries) {
      console.warn(
        `[surfaces] optional prompt_user mapping "${key}" skipped — non-interactive display mode`,
      );
      delete out[key];
    }
    return out;
  }

  const fields: ValuePromptField[] = promptEntries.map(([name, mapping]) => ({
    name,
    prompt: mapping.prompt,
    defaultValue: mapping.defaultValue,
    required: mapping.required,
  }));
  const answers = await promptForValues({ title, fields });
  if (answers === null) {
    for (const [key] of promptEntries) delete out[key];
    return out;
  }
  for (const [key] of promptEntries) {
    out[key] = { mapType: "direct_value", target: answers[key] ?? "" };
  }
  return out;
}
