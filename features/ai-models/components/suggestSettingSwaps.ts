/**
 * Optional value swaps offered when an admin replaces one model with another.
 *
 * THIS IS AN OFFER, NEVER A GATE. Every row still pointing at the old model is
 * checked against the replacement model's controls with the same engine the
 * agent builder uses (`analyzeModelChange`), and each distinct problem value
 * becomes one line: "if an agent has <key> = <from>, change it to <to>". The
 * admin ticks the ones they want; unticked lines are ignored and the replace
 * goes ahead regardless. Nothing here can stop a replacement.
 */

import type { FeLlmParams } from "@/features/agents/types/agent-api-types";
import type { AIModelRecord } from "@/features/ai-models/redux/modelRegistrySlice";
import type { ModelConstraint } from "@/features/ai-models/types";
import { resolveModelControls } from "@/features/agents/hooks/useModelControls";
import { analyzeModelChange } from "@/features/agents/components/settings-management/reconciliation/analyze";
import type { SettingSwap } from "@/features/ai-models/server/replace-model-references";

export interface SuggestedSwap extends SettingSwap {
  /** Stable identity of the line: key + serialized `from`. */
  id: string;
  /** How many of the rows being replaced hold `from` for `key`. */
  count: number;
  /** Why the replacement model may not take `from` (the engine's sentence). */
  reason: string;
}

const IDENTITY_KEYS = new Set(["model", "model_id"]);

function asSettings(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function suggestSettingSwaps(
  rowSettings: Array<Record<string, unknown> | null | undefined>,
  replacementModelId: string,
  models: AIModelRecord[],
): SuggestedSwap[] {
  const model = models.find((m) => m.id === replacementModelId);
  if (!model) return [];
  const { normalizedControls } = resolveModelControls(models, replacementModelId);
  const constraints = Array.isArray(model.constraints)
    ? (model.constraints as ModelConstraint[])
    : null;

  const byId = new Map<string, SuggestedSwap>();
  for (const raw of rowSettings) {
    const settings = asSettings(raw);
    if (!settings) continue;
    const plan = analyzeModelChange(
      settings as FeLlmParams,
      replacementModelId,
      model,
      normalizedControls,
      constraints,
      // The catalog's offering list is not loaded here — skip the pin check
      // rather than guess (a stale pin is still written as-is, never refused).
      null,
    );
    for (const row of plan.incompatible) {
      if (IDENTITY_KEYS.has(row.key)) continue;
      if (row.currentValue === undefined) continue;
      const id = `${row.key}::${JSON.stringify(row.currentValue)}`;
      const existing = byId.get(id);
      if (existing) {
        existing.count += 1;
        continue;
      }
      const to =
        row.suggestedAction === "swap-to-default" ? row.newModelDefault : undefined;
      // Swapping a value for itself is not a suggestion.
      if (JSON.stringify(to) === JSON.stringify(row.currentValue)) continue;
      byId.set(id, {
        id,
        key: row.key,
        from: row.currentValue,
        to,
        count: 1,
        reason: row.issueMessage,
      });
    }
  }
  return [...byId.values()].sort(
    (a, b) => a.key.localeCompare(b.key) || b.count - a.count,
  );
}
