"use client";

/**
 * Shared surface value-mapping resolution for launch-time seeding and
 * submit-time live-scope refresh.
 *
 * Layers are merged weakest → strongest per target: inherited/global binding,
 * organization bindings, user binding, then shortcut mappings.
 *
 * A REQUIRED VALUE THE PAGE CANNOT FILL OFFERS, NEVER BLOCKS (Arman,
 * 2026-09-27; `common-docs/policies/validation-offers-never-blocks.md`). When
 * a required surface value is absent (e.g. "Translate to Spanish" with nothing
 * selected) or a required prompt_user value cannot be asked for:
 *   - interactive display → ONE small dialog names the missing value, lets the
 *     person type it, run without it (leave it blank), or cancel. Cancel stops
 *     the launch with `LaunchCancelledByPerson` — an answer, not a failure: no
 *     error toast, no Error Inspector row.
 *   - direct/background (no UI may interrupt) → the run proceeds and a toast
 *     names what it ran without. Never silent, never refused.
 */

import {
  promptForValues,
  type ValuePromptField,
} from "@/components/dialogs/value-prompts/ValuePromptsDialogHost";
import { toast } from "@/lib/toast";
import {
  readSurfaceScopeValue,
  resolveValueMappings,
} from "@/features/surfaces/utils/value-mapping-resolver";
import { getManifest } from "@/features/surfaces/manifests/registry";
import type { VariableDefinition } from "@/features/agents/types/agent-definition.types";
import type { InstanceContextEntry } from "@/features/agents/types/instance.types";
import type { ApplicationScope } from "@/features/agents/types/scope.types";
import type { ContextObjectType } from "@/features/agents/types/agent-api-types";
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
    Object.keys(result.writePolicies).length === 0 &&
    result.autoRun === null
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

/**
 * The person cancelled a launch at the missing-value dialog. THIS IS AN
 * ANSWER, NOT A FAILURE: the message is empty so every `toast.error(err.message)`
 * boundary drops it (`lib/toast.ts` never raises a wordless error toast), and
 * the name is `AbortError` so the rejected-thunk capture
 * (`lib/diagnostics/reduxErrorCaptureMiddleware.ts`) files nothing. The reason
 * stays readable for developers on `.reason`.
 */
export class LaunchCancelledByPerson extends Error {
  override name = "AbortError" as const;
  readonly reason: string;
  constructor(title: string) {
    super("");
    this.reason = `"${title}" was cancelled at the missing-value prompt; nothing ran.`;
  }
}

function isBlank(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    (typeof value === "string" && value.trim() === "")
  );
}

/** The person-facing name of a surface value: its manifest label, else the key in words. */
function surfaceValueLabel(
  surfaceName: string | null | undefined,
  target: string,
): string {
  const label = surfaceName
    ? getManifest(surfaceName)?.values.find((v) => v.name === target)?.label
    : undefined;
  return label ?? target.replace(/^.*\./, "").replace(/[_-]+/g, " ").trim();
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export async function prepareLaunchMappings(args: {
  merged: ValueMappingMap;
  applicationScope: Record<string, unknown>;
  /** False for direct/background — no UI may interrupt those executions. */
  interactive: boolean;
  /** Dialog title — the shortcut/agent label. */
  title: string;
  /** The launching surface — names missing values by their manifest label. */
  surfaceName?: string | null;
}): Promise<ValueMappingMap> {
  const { applicationScope, interactive, title, surfaceName } = args;
  const out: ValueMappingMap = { ...args.merged };

  // ── Required surface values the page did not provide ────────────────────
  // Same read as the resolver (`readSurfaceScopeValue`), so the two never
  // disagree about what is missing; a blank string counts as missing here
  // (no selection is not a selection).
  const missing: Array<{
    key: string;
    label: string;
    mapping: Extract<ValueMapping, { mapType: "surface_value" }>;
  }> = [];
  for (const [key, mapping] of Object.entries(out)) {
    if (
      mapping.mapType === "surface_value" &&
      mapping.required &&
      isBlank(
        readSurfaceScopeValue(
          applicationScope as ApplicationScope,
          mapping.target,
        ),
      )
    ) {
      missing.push({
        key,
        label: surfaceValueLabel(surfaceName, mapping.target),
        mapping,
      });
    }
  }
  if (missing.length > 0) {
    const names = joinNames(missing.map((m) => m.label));
    // Proceeding without a value = the mapping stops being required, so the
    // resolver neither errors nor invents one.
    const runWithout = (m: (typeof missing)[number]) => {
      out[m.key] = { ...m.mapping, required: false };
    };
    if (!interactive) {
      toast.info(`"${title}" ran without ${names} — this page had none.`);
      missing.forEach(runWithout);
    } else {
      const answers = await promptForValues({
        title,
        description: `This page has no ${names}, which "${title}" needs. Type ${missing.length === 1 ? "it" : "them"} below, or leave blank to run without ${missing.length === 1 ? "it" : "them"}.`,
        submitLabel: "Run",
        fields: missing.map((m) => ({
          name: m.key,
          prompt: m.label.charAt(0).toUpperCase() + m.label.slice(1),
          required: false,
        })),
      });
      if (answers === null) throw new LaunchCancelledByPerson(title);
      for (const m of missing) {
        const typed = answers[m.key]?.trim();
        if (typed) out[m.key] = { mapType: "direct_value", target: typed };
        else runWithout(m);
      }
    }
  }

  // ── prompt_user mappings ────────────────────────────────────────────────
  const promptEntries = Object.entries(out).filter(
    (
      entry,
    ): entry is [string, Extract<ValueMapping, { mapType: "prompt_user" }>] =>
      entry[1].mapType === "prompt_user",
  );
  if (promptEntries.length === 0) return out;

  if (!interactive) {
    const requiredNames = promptEntries
      .filter(([, mapping]) => mapping.required)
      .map(([, mapping]) => mapping.prompt || "a value");
    if (requiredNames.length > 0) {
      // Nobody can be asked in a direct/background run — say so, and run.
      toast.info(
        `"${title}" ran without ${joinNames(requiredNames.map((n) => `"${n}"`))} — it runs without a window, so nobody could be asked.`,
      );
    }
    for (const [key] of promptEntries) {
      console.warn(
        `[surfaces] prompt_user mapping "${key}" skipped — non-interactive display mode`,
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

/**
 * THE PER-LAUNCH MAPPING (`runtime.valueMappings`). A mapping chosen for one
 * launch — by a person on the Custom Agent screen, or by a caller — is
 * resolved ONCE against that launch's scope by the same resolver shortcuts
 * and surface bindings use. The caller pins the result with its host values,
 * so a later per-turn surface refresh never re-reads it from the live page.
 * Mapped values win over the caller's own `variables`.
 */
export function resolvePerLaunchMappings(args: {
  mappings: ValueMappingMap | null | undefined;
  applicationScope: ApplicationScope | null | undefined;
  variableDefinitions: VariableDefinition[] | null | undefined;
  contextPolicies:
    | Array<{ key: string; type?: ContextObjectType; label?: string }>
    | null
    | undefined;
  variables: Record<string, unknown> | undefined;
}): {
  variables: Record<string, unknown> | undefined;
  contextEntries: InstanceContextEntry[];
} {
  const { mappings, variables } = args;
  if (!mappings || Object.keys(mappings).length === 0) {
    return { variables, contextEntries: [] };
  }
  const mapped = resolveValueMappings(
    args.applicationScope ?? {},
    mappings,
    args.variableDefinitions ?? [],
    args.contextPolicies ?? [],
    { autoNameMatch: false },
  );
  for (const warning of mapped.warnings) {
    console.warn("[launch mapping]", warning);
  }
  for (const error of mapped.errors) {
    console.error("[launch mapping]", error);
  }
  return {
    variables: { ...(variables ?? {}), ...mapped.variableValues },
    contextEntries: mapped.contextEntries,
  };
}
