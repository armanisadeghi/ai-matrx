"use client";

/**
 * ModelRulesEditor — the Phase-D replacement for editing raw
 * model_definition.controls / .constraints (those columns are dead and drop
 * in Phase C).
 *
 * A model's effective controls/constraints are RESOLVED from two sources:
 *   - FAMILY rules   → ai.api.rules   {params, constraints}  (per wire contract)
 *   - PER-MODEL deltas → ai.offering.override (same envelope) on the offering
 * via ai.resolve_model_config / the ai.model_config view.
 *
 * This component renders, for one model:
 *   - an offering selector (defaults to the preferred = lowest-priority live one)
 *   - the resolved output (read-only, from ai.model_config)
 *   - mode="controls":    JSON editors for the family rules envelope and the
 *     offering override envelope
 *   - mode="constraints": structured ConstraintsEditor for each source's
 *     constraints array
 *
 * Every successful save triggers POST /admin/ai-catalog/reload so the live
 * brain picks the change up, then re-reads the resolved view.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { FullJsonViewer } from "@/components/ui/JsonComponents/JsonViewerComponent";
import { useAppDispatch } from "@/lib/redux/hooks";
import { aiModelService } from "../service";
import { reloadAiCatalog } from "../catalogReload";
import type {
  AiApi,
  AiModel,
  AiOffering,
  ModelConstraint,
  RulesEnvelope,
} from "../types";
import type { Database } from "@/types/database.types";
import JsonFieldEditor from "./JsonFieldEditor";
import ConstraintsEditor from "./ConstraintsEditor";

type ModelConfigRow = Database["ai"]["Views"]["model_config"]["Row"];

interface ModelRulesEditorProps {
  model: AiModel;
  offerings: AiOffering[];
  mode: "controls" | "constraints";
}

/** Normalize whatever is stored into the canonical envelope shape. */
function asEnvelope(value: unknown): RulesEnvelope {
  const v = (value ?? {}) as Partial<RulesEnvelope>;
  return {
    params:
      v.params && typeof v.params === "object" && !Array.isArray(v.params)
        ? v.params
        : {},
    constraints: Array.isArray(v.constraints) ? v.constraints : [],
  };
}

export default function ModelRulesEditor({
  model,
  offerings,
  mode,
}: ModelRulesEditorProps) {
  const dispatch = useAppDispatch();

  const liveOfferings = useMemo(
    () => offerings.filter((o) => !o.deleted_at),
    [offerings],
  );

  const [selectedOfferingId, setSelectedOfferingId] = useState<string | null>(
    null,
  );
  // Preferred offering = lowest priority among available ones (list arrives
  // priority-sorted from fetchOfferingsForModel).
  const effectiveOfferingId =
    selectedOfferingId ??
    (liveOfferings.find((o) => o.is_available) ?? liveOfferings[0])?.id ??
    null;
  const offering =
    liveOfferings.find((o) => o.id === effectiveOfferingId) ?? null;

  const [apis, setApis] = useState<AiApi[]>([]);
  const [resolved, setResolved] = useState<ModelConfigRow | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const api = useMemo(
    () => apis.find((a) => a.id === offering?.api_id) ?? null,
    [apis, offering?.api_id],
  );

  const refresh = useCallback(async () => {
    try {
      const [apiRows, resolvedRow] = await Promise.all([
        aiModelService.fetchApis(),
        aiModelService.fetchModelConfig(model.id),
      ]);
      setApis(apiRows);
      setResolved(resolvedRow);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    }
  }, [model.id]);

  useEffect(() => {
    // Defer to a microtask so the effect body itself stays setState-free
    // (react-hooks/set-state-in-effect) — refresh only writes after awaits.
    const t = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(t);
  }, [refresh]);

  const afterRuleSave = useCallback(async () => {
    await dispatch(reloadAiCatalog());
    await refresh();
  }, [dispatch, refresh]);

  const saveApiRules = useCallback(
    async (envelope: RulesEnvelope) => {
      if (!api) throw new Error("No API (wire contract) resolved for this offering");
      await aiModelService.updateApi(api.id, {
        rules: envelope as unknown as Database["ai"]["Tables"]["api"]["Update"]["rules"],
      });
      toast.success(`Family rules saved on ai.api "${api.name}"`);
      await afterRuleSave();
    },
    [api, afterRuleSave],
  );

  const saveOverride = useCallback(
    async (envelope: RulesEnvelope) => {
      if (!offering) throw new Error("No offering selected for this model");
      await aiModelService.updateOffering(offering.id, {
        override:
          envelope as unknown as Database["ai"]["Tables"]["offering"]["Update"]["override"],
      });
      toast.success("Per-model override saved on ai.offering");
      await afterRuleSave();
    },
    [offering, afterRuleSave],
  );

  const apiEnvelope = asEnvelope(api?.rules);
  const overrideEnvelope = asEnvelope(offering?.override);

  const resolvedData =
    mode === "controls" ? resolved?.controls : resolved?.constraints;

  return (
    <div className="space-y-3">
      {/* Source explanation + offering picker */}
      <div className="rounded-md border bg-muted/30 px-3 py-2 space-y-2">
        <p className="text-xs text-muted-foreground">
          {mode === "controls" ? "Controls" : "Constraints"} are no longer
          stored on the model row — they resolve from the family rules
          (ai.api.rules) merged with the per-model override (ai.offering
          .override). Edits here save to those sources and reload the backend
          catalog.
        </p>
        {liveOfferings.length > 1 && (
          <label className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground shrink-0">Offering</span>
            <select
              className="h-7 rounded border bg-background px-2 text-xs"
              value={effectiveOfferingId ?? ""}
              onChange={(e) => setSelectedOfferingId(e.target.value || null)}
            >
              {liveOfferings.map((o) => (
                <option key={o.id} value={o.id}>
                  {`priority ${o.priority}${o.is_available ? "" : " (unavailable)"} — ${
                    apis.find((a) => a.id === o.api_id)?.name ?? o.api_id
                  }`}
                </option>
              ))}
            </select>
          </label>
        )}
        {liveOfferings.length === 0 && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            This model has NO offering — it cannot route and resolves to
            capability gates only. Create an offering first.
          </p>
        )}
        {loadError && (
          <p className="text-xs text-red-600 dark:text-red-400 break-words">
            Failed to load rule sources: {loadError}
          </p>
        )}
      </div>

      {/* Resolved output (read-only) */}
      <div className="border rounded-md overflow-hidden">
        <div className="px-3 py-2 bg-muted/50 flex items-center justify-between">
          <span className="text-sm font-medium">
            Resolved {mode} (ai.model_config — what users get)
          </span>
          <button
            type="button"
            className="text-xs text-primary hover:underline"
            onClick={() => void refresh()}
          >
            Refresh
          </button>
        </div>
        <div className="p-2 max-h-72 overflow-auto">
          <FullJsonViewer
            data={(resolvedData ?? (mode === "controls" ? {} : [])) as object}
            initialExpanded
            hideControls
            disabled
          />
        </div>
      </div>

      {mode === "controls" ? (
        <>
          <JsonFieldEditor
            title={`Family rules — ai.api.rules${api ? ` (${api.name})` : ""}`}
            description='Wire-contract envelope {"params": {key: ControlRule}, "constraints": [...]}'
            data={api?.rules ?? null}
            defaultExpanded
            onSave={async (data) => {
              await saveApiRules(asEnvelope(data));
            }}
          />
          <JsonFieldEditor
            title="Per-model override — ai.offering.override"
            description="Same envelope; per-key merge, override wins per field"
            data={offering?.override ?? null}
            defaultExpanded
            onSave={async (data) => {
              await saveOverride(asEnvelope(data));
            }}
          />
        </>
      ) : (
        <>
          <div className="border rounded-md p-2 space-y-2">
            <div className="text-sm font-medium">
              Family constraints — ai.api.rules.constraints
              {api ? ` (${api.name})` : ""}
            </div>
            <ConstraintsEditor
              constraints={apiEnvelope.constraints as ModelConstraint[]}
              onSave={async (constraints) => {
                await saveApiRules({ ...apiEnvelope, constraints });
              }}
            />
          </div>
          <div className="border rounded-md p-2 space-y-2">
            <div className="text-sm font-medium">
              Per-model constraints — ai.offering.override.constraints
            </div>
            <ConstraintsEditor
              constraints={overrideEnvelope.constraints as ModelConstraint[]}
              onSave={async (constraints) => {
                await saveOverride({ ...overrideEnvelope, constraints });
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}
