"use client";

/**
 * ModelControlsEditor — the structured, ai.setting-driven replacement for the
 * raw-JSON Controls editing that shipped with Phase D (ModelRulesEditor
 * mode="controls"). This is the editor that restores "one click to edit one
 * control, one save":
 *
 * - rows = union of family (ai.api.rules.params) + override
 *   (ai.offering.override.params) keys, joined to ai.setting for labels,
 *   types, canonical ranges and vocabularies
 * - per-row typed inputs with provenance chips and a live resolved preview
 * - explicit save destination per row: this model's override (default) vs the
 *   whole family with its blast radius ("affects N models on {api}")
 * - drafts accumulate into ONE batch save: at most one updateOffering + one
 *   updateApi, then a single catalog reload
 * - the DB `ai.model_config` row stays displayed as ground truth; the client
 *   resolver (controls/resolveControls.ts) powers previews + provenance
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { ExternalLink, Plus } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FullJsonViewer } from "@/components/ui/JsonComponents/JsonViewerComponent";
import { useAppDispatch } from "@/lib/redux/hooks";
import { aiModelService } from "../../service";
import { reloadAiCatalog } from "../../catalogReload";
import type { Database } from "@/types/database.types";
import type {
  AiApi,
  AiModel,
  AiOffering,
  AiSetting,
  ControlRule,
  RulesEnvelope,
  RulesParams,
} from "../../types";
import { buildControlRows } from "../../controls/resolveControls";
import ControlRuleRow, { type RuleDestination } from "./ControlRuleRow";
import PendingChangesBar from "./PendingChangesBar";
import JsonFieldEditor from "../JsonFieldEditor";

type ModelConfigRow = Database["ai"]["Views"]["model_config"]["Row"];

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

type Drafts = Record<
  string,
  { destination: RuleDestination; rule: ControlRule | null }
>;

interface ModelControlsEditorProps {
  model: AiModel;
  offerings: AiOffering[];
  /** Reports whether unsaved drafts exist (feeds the panel dirty tracking). */
  onDirtyChange?: (dirty: boolean) => void;
}

export default function ModelControlsEditor({
  model,
  offerings,
  onDirtyChange,
}: ModelControlsEditorProps) {
  const dispatch = useAppDispatch();

  const liveOfferings = useMemo(
    () => offerings.filter((o) => !o.deleted_at),
    [offerings],
  );

  const [selectedOfferingId, setSelectedOfferingId] = useState<string | null>(
    null,
  );
  const effectiveOfferingId =
    selectedOfferingId ??
    (liveOfferings.find((o) => o.is_available) ?? liveOfferings[0])?.id ??
    null;
  const offering =
    liveOfferings.find((o) => o.id === effectiveOfferingId) ?? null;

  const [apis, setApis] = useState<AiApi[]>([]);
  const [settings, setSettings] = useState<AiSetting[]>([]);
  const [allOfferings, setAllOfferings] = useState<AiOffering[]>([]);
  const [resolved, setResolved] = useState<ModelConfigRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [drafts, setDrafts] = useState<Drafts>({});
  const [addKeyFilter, setAddKeyFilter] = useState("");
  const [showAddPicker, setShowAddPicker] = useState(false);

  const api = useMemo(
    () => apis.find((a) => a.id === offering?.api_id) ?? null,
    [apis, offering?.api_id],
  );

  const refresh = useCallback(async () => {
    try {
      const [apiRows, settingRows, offeringRows, resolvedRow] =
        await Promise.all([
          aiModelService.fetchApis(),
          aiModelService.fetchSettings(),
          aiModelService.fetchOfferings(),
          aiModelService.fetchModelConfig(model.id),
        ]);
      setApis(apiRows);
      setSettings(settingRows);
      setAllOfferings(offeringRows);
      setResolved(resolvedRow);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [model.id]);

  useEffect(() => {
    const t = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(t);
  }, [refresh]);

  // Model switch / offering switch = new editing context → drop drafts.
  // Render-adjust pattern (not an effect) per react.dev/you-might-not-need-an-effect.
  const editCtxKey = `${model.id}:${effectiveOfferingId ?? ""}`;
  const [prevEditCtxKey, setPrevEditCtxKey] = useState(editCtxKey);
  if (prevEditCtxKey !== editCtxKey) {
    setPrevEditCtxKey(editCtxKey);
    setDrafts({});
  }

  const dirty = Object.keys(drafts).length > 0;
  useEffect(() => {
    onDirtyChange?.(dirty);
    return () => onDirtyChange?.(false);
  }, [dirty, onDirtyChange]);

  const familyEnvelope = useMemo(() => asEnvelope(api?.rules), [api?.rules]);
  const overrideEnvelope = useMemo(
    () => asEnvelope(offering?.override),
    [offering?.override],
  );

  // Apply drafts on top of stored params to build the working envelopes.
  const { workingFamilyParams, workingOverrideParams } = useMemo(() => {
    const fam: RulesParams = { ...familyEnvelope.params };
    const ovr: RulesParams = { ...overrideEnvelope.params };
    for (const [key, d] of Object.entries(drafts)) {
      const target = d.destination === "family" ? fam : ovr;
      if (d.rule === null) delete target[key];
      else target[key] = d.rule;
    }
    return { workingFamilyParams: fam, workingOverrideParams: ovr };
  }, [drafts, familyEnvelope, overrideEnvelope]);

  const rows = useMemo(
    () =>
      buildControlRows(
        workingFamilyParams,
        workingOverrideParams,
        settings,
        model.max_tokens,
      ),
    [workingFamilyParams, workingOverrideParams, settings, model.max_tokens],
  );

  // Distinct models served by this offering's wire contract (React Compiler
  // memoizes derived computations — no manual useMemo needed).
  const offeringApiId = offering?.api_id ?? null;
  const familyModelCount = offeringApiId
    ? new Set(
        allOfferings
          .filter((o) => o.api_id === offeringApiId && !o.deleted_at)
          .map((o) => o.model_id),
      ).size
    : 0;

  const unusedSettings = useMemo(() => {
    const used = new Set(rows.map((r) => r.key));
    const filter = addKeyFilter.trim().toLowerCase();
    return settings
      .filter((s) => !used.has(s.key))
      .filter(
        (s) =>
          !filter ||
          s.key.toLowerCase().includes(filter) ||
          (s.description ?? "").toLowerCase().includes(filter),
      )
      .sort((a, b) => a.key.localeCompare(b.key));
  }, [settings, rows, addKeyFilter]);

  const setDraft = useCallback(
    (key: string, destination: RuleDestination, rule: ControlRule | null) => {
      setDrafts((prev) => ({ ...prev, [key]: { destination, rule } }));
    },
    [],
  );
  const discardDraft = useCallback((key: string) => {
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const overrideDraftKeys = Object.entries(drafts)
    .filter(([, d]) => d.destination === "override")
    .map(([k]) => k);
  const familyDraftKeys = Object.entries(drafts)
    .filter(([, d]) => d.destination === "family")
    .map(([k]) => k);

  const handleBatchSave = useCallback(async () => {
    if (!dirty) return;
    setSaving(true);
    try {
      if (overrideDraftKeys.length > 0) {
        if (!offering) throw new Error("No offering selected for this model");
        await aiModelService.updateOffering(offering.id, {
          override: {
            ...overrideEnvelope,
            params: workingOverrideParams,
          } as unknown as Database["ai"]["Tables"]["offering"]["Update"]["override"],
        });
      }
      if (familyDraftKeys.length > 0) {
        if (!api)
          throw new Error("No API (wire contract) resolved for this offering");
        await aiModelService.updateApi(api.id, {
          rules: {
            ...familyEnvelope,
            params: workingFamilyParams,
          } as unknown as Database["ai"]["Tables"]["api"]["Update"]["rules"],
        });
      }
      setDrafts({});
      await dispatch(reloadAiCatalog());
      await refresh();
      toast.success(
        [
          overrideDraftKeys.length
            ? `${overrideDraftKeys.length} override change(s) saved`
            : null,
          familyDraftKeys.length
            ? `${familyDraftKeys.length} family change(s) saved (${familyModelCount} models)`
            : null,
        ]
          .filter(Boolean)
          .join(" · "),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }, [
    dirty,
    offering,
    api,
    overrideDraftKeys,
    familyDraftKeys,
    workingOverrideParams,
    workingFamilyParams,
    dispatch,
    refresh,
    familyModelCount,
  ]);

  const hasOffering = liveOfferings.length > 0;

  return (
    <div className="flex flex-col gap-3 h-full min-h-0">
      {/* Context bar: offering picker + family badge */}
      <div className="rounded-md border bg-muted/30 px-3 py-2 space-y-2 shrink-0">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">Offering</span>
          <Select
            value={effectiveOfferingId ?? ""}
            onValueChange={(v) => setSelectedOfferingId(v || null)}
            disabled={!hasOffering}
          >
            <SelectTrigger className="h-7 w-72 text-xs">
              <SelectValue
                placeholder={hasOffering ? "Select offering" : "No offerings"}
              />
            </SelectTrigger>
            <SelectContent>
              {liveOfferings.map((o) => {
                const a = apis.find((x) => x.id === o.api_id);
                return (
                  <SelectItem key={o.id} value={o.id} className="text-xs">
                    {`${a?.name ?? o.api_id} · priority ${o.priority}${o.is_available ? "" : " (unavailable)"}`}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          {api && (
            <span className="text-[10px] text-muted-foreground">
              Family <span className="font-mono">{api.name}</span> serves{" "}
              <span className="font-medium text-foreground">
                {familyModelCount}
              </span>{" "}
              model{familyModelCount === 1 ? "" : "s"} — family edits affect all
              of them.
            </span>
          )}
        </div>
        {!hasOffering && (
          <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
            This model has NO offering — it cannot route; controls resolve to
            capability gates only. Create one on the
            <a
              href="/administration/ai-models/offerings"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-0.5 text-primary hover:underline"
            >
              Offerings page
              <ExternalLink className="h-3 w-3" />
            </a>
          </p>
        )}
        {loadError && (
          <p className="text-xs text-red-600 dark:text-red-400 break-words">
            Failed to load rule sources: {loadError}
          </p>
        )}
      </div>

      {/* Rows */}
      <div className="space-y-1.5">
        {loading && (
          <p className="text-xs text-muted-foreground px-1">Loading settings…</p>
        )}
        {!loading && rows.length === 0 && (
          <p className="text-xs text-muted-foreground px-1">
            No rules on this family or offering yet — add a setting below.
          </p>
        )}
        {rows.map((row) => (
          <ControlRuleRow
            key={row.key}
            row={row}
            modelMaxTokens={model.max_tokens}
            familyModelCount={familyModelCount}
            apiName={api?.name ?? null}
            draft={drafts[row.key] ?? null}
            onDraftChange={setDraft}
            onDiscardDraft={discardDraft}
            readOnly={!hasOffering}
          />
        ))}

        {/* Add setting */}
        {hasOffering && (
          <div className="pt-1">
            {!showAddPicker ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs gap-1.5"
                onClick={() => setShowAddPicker(true)}
              >
                <Plus className="h-3.5 w-3.5" />
                Add setting
              </Button>
            ) : (
              <div className="border rounded-md p-2 space-y-1.5">
                <Input
                  autoFocus
                  className="h-7 text-xs"
                  placeholder="Search the settings dictionary…"
                  value={addKeyFilter}
                  onChange={(e) => setAddKeyFilter(e.target.value)}
                />
                <div className="max-h-48 overflow-auto space-y-0.5">
                  {unusedSettings.slice(0, 40).map((s) => (
                    <button
                      key={s.key}
                      type="button"
                      className="w-full text-left px-2 py-1 rounded hover:bg-muted text-xs flex items-baseline gap-2"
                      onClick={() => {
                        setDraft(s.key, "override", {});
                        setShowAddPicker(false);
                        setAddKeyFilter("");
                      }}
                    >
                      <span className="font-mono shrink-0">{s.key}</span>
                      <span className="text-[10px] text-muted-foreground truncate">
                        {s.value_type}
                        {s.description ? ` — ${s.description}` : ""}
                      </span>
                    </button>
                  ))}
                  {unusedSettings.length === 0 && (
                    <p className="text-[10px] text-muted-foreground px-2 py-1">
                      No unused settings match.
                    </p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[10px]"
                  onClick={() => {
                    setShowAddPicker(false);
                    setAddKeyFilter("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Resolved ground truth */}
      <div className="border rounded-md overflow-hidden shrink-0">
        <div className="px-3 py-2 bg-muted/50 flex items-center justify-between">
          <span className="text-sm font-medium">
            Resolved controls (ai.model_config — preferred offering, ground
            truth)
          </span>
          <button
            type="button"
            className="text-xs text-primary hover:underline"
            onClick={() => void refresh()}
          >
            Refresh
          </button>
        </div>
        <div className="p-2 max-h-[45vh] overflow-auto">
          <FullJsonViewer
            data={(resolved?.controls ?? {}) as object}
            initialExpanded
            hideControls
            disabled
          />
        </div>
      </div>

      {/* Raw sources — advanced escape hatch */}
      <details className="shrink-0">
        <summary className="text-xs text-muted-foreground cursor-pointer select-none px-1 py-1">
          Raw sources (advanced) — full envelopes incl. constraints
        </summary>
        <div className="space-y-2 pt-1.5">
          <JsonFieldEditor
            title={`Family rules — ai.api.rules${api ? ` (${api.name})` : ""}`}
            description={`Shared wire-contract envelope — affects ${familyModelCount} models`}
            data={api?.rules ?? null}
            onSave={async (data) => {
              if (!api)
                throw new Error(
                  "No API (wire contract) resolved for this offering",
                );
              await aiModelService.updateApi(api.id, {
                rules:
                  asEnvelope(data) as unknown as Database["ai"]["Tables"]["api"]["Update"]["rules"],
              });
              toast.success(`Family rules saved on ai.api "${api.name}"`);
              await dispatch(reloadAiCatalog());
              await refresh();
            }}
          />
          <JsonFieldEditor
            title="Per-model override — ai.offering.override"
            description="Same envelope; per-key merge, override wins per field"
            data={offering?.override ?? null}
            onSave={async (data) => {
              if (!offering)
                throw new Error("No offering selected for this model");
              await aiModelService.updateOffering(offering.id, {
                override:
                  asEnvelope(data) as unknown as Database["ai"]["Tables"]["offering"]["Update"]["override"],
              });
              toast.success("Per-model override saved on ai.offering");
              await dispatch(reloadAiCatalog());
              await refresh();
            }}
          />
        </div>
      </details>

      <PendingChangesBar
        overrideKeys={overrideDraftKeys}
        familyKeys={familyDraftKeys}
        familyModelCount={familyModelCount}
        apiName={api?.name ?? null}
        saving={saving}
        onSave={() => void handleBatchSave()}
        onDiscardAll={() => setDrafts({})}
      />
    </div>
  );
}
