"use client";

/**
 * ModelRulesEditor — CONSTRAINTS-ONLY since the structured Controls editor
 * shipped (components/controls/ModelControlsEditor.tsx owns the Controls tab).
 *
 * A model's effective constraints are RESOLVED from two sources:
 *   - FAMILY rules   → ai.api.rules.constraints   (per wire contract)
 *   - PER-MODEL deltas → ai.offering.override.constraints (concatenated)
 * via ai.resolve_model_config / the ai.model_config view.
 *
 * Every successful save triggers POST /admin/ai-catalog/reload so the live
 * brain picks the change up, then re-reads the resolved view.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "@/lib/toast";

import { FullJsonViewer } from "@/components/ui/JsonComponents/JsonViewerComponent";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import ConstraintsEditor from "./ConstraintsEditor";

type ModelConfigRow = Database["ai"]["Views"]["model_config"]["Row"];

interface ModelRulesEditorProps {
  model: AiModel;
  offerings: AiOffering[];
  /** Reports unsaved edits in either constraints editor upward. */
  onDirtyChange?: (section: "family" | "override", dirty: boolean) => void;
  /** Called after any write to ai.offering so the parent refetches its copy. */
  onOfferingsChanged?: () => void;
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
  onDirtyChange,
  onOfferingsChanged,
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
      onOfferingsChanged?.();
    },
    [offering, afterRuleSave, onOfferingsChanged],
  );

  const apiEnvelope = asEnvelope(api?.rules);
  const overrideEnvelope = asEnvelope(offering?.override);
  const noOffering = liveOfferings.length === 0;

  return (
    <div className="space-y-3">
      {/* Source explanation + offering picker */}
      <div className="rounded-md border bg-muted/30 px-3 py-2 space-y-2">
        <p className="text-xs text-muted-foreground">
          Constraints are no longer stored on the model row — they resolve from
          the family rules (ai.api.rules) merged with the per-model override
          (ai.offering.override). Edits here save to those sources and reload
          the backend catalog.
        </p>
        {liveOfferings.length > 1 && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground shrink-0">Offering</span>
            <Select
              value={effectiveOfferingId ?? ""}
              onValueChange={(v) => setSelectedOfferingId(v || null)}
            >
              <SelectTrigger className="h-7 w-72 text-xs">
                <SelectValue placeholder="Select offering" />
              </SelectTrigger>
              <SelectContent>
                {liveOfferings.map((o) => (
                  <SelectItem key={o.id} value={o.id} className="text-xs">
                    {`${apis.find((a) => a.id === o.api_id)?.name ?? o.api_id} · priority ${o.priority}${o.is_available ? "" : " (unavailable)"}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {noOffering && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            This model has NO offering — it cannot route and resolves to
            capability gates only. Create an offering first; the editors below
            are disabled.
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
            Resolved constraints (ai.model_config — what users get)
          </span>
          <button
            type="button"
            className="text-xs text-primary hover:underline"
            onClick={() => void refresh()}
          >
            Refresh
          </button>
        </div>
        <div className="p-2 max-h-[45dvh] overflow-auto">
          <FullJsonViewer
            data={(resolved?.constraints ?? []) as object}
            initialExpanded
            hideControls
            disabled
          />
        </div>
      </div>

      {!noOffering && (
        <>
          <div className="border rounded-md p-2 space-y-2">
            <div className="text-sm font-medium">
              Family constraints — ai.api.rules.constraints
              {api ? ` (${api.name})` : ""}
            </div>
            <ConstraintsEditor
              constraints={apiEnvelope.constraints as ModelConstraint[]}
              onDirtyChange={(dirty) => onDirtyChange?.("family", dirty)}
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
              onDirtyChange={(dirty) => onDirtyChange?.("override", dirty)}
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
