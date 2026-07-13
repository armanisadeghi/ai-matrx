"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Save,
  Loader2,
  CheckCircle2,
  Zap,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { aiModelService } from "../service";
import type { AiModel } from "../types";
import type {
  ModelAuditResult,
  CapabilitiesRecord,
  CapabilityKey,
} from "./auditTypes";
import {
  parseCapabilities,
  ALL_CAPABILITY_KEYS,
  CAPABILITY_LABELS,
  CAPABILITY_GROUPS,
} from "./auditTypes";
import { mergeAuditRecordIntoCapabilities } from "../capabilities/parse";
import {
  AuditTableShell,
  Th,
  StatusBadge,
  IssueList,
  ProviderBadge,
  ModelNameCell,
} from "./AuditTableShell";
import ModelDetailSheet, { OpenDetailButton } from "./ModelDetailSheet";

interface CapabilitiesAuditTabProps {
  results: ModelAuditResult[];
  allModels: AiModel[];
  onModelUpdated: (id: string, patch: Partial<AiModel>) => void;
}

function CapabilityToggle({
  capKey,
  value,
  onChange,
  isRequired,
}: {
  capKey: CapabilityKey;
  value: boolean;
  onChange: (v: boolean) => void;
  isRequired: boolean;
}) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border transition-colors ${
        value
          ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-300"
          : "bg-muted text-muted-foreground border-border hover:border-primary/30"
      } ${isRequired && !value ? "ring-1 ring-destructive" : ""}`}
    >
      {value ? "✓" : "○"} {CAPABILITY_LABELS[capKey]}
    </button>
  );
}

function InlineCapabilitiesEditor({
  model,
  requiredKeys,
  onSaved,
}: {
  model: AiModel;
  requiredKeys: CapabilityKey[];
  onSaved: (caps: CapabilitiesRecord) => void;
}) {
  const [caps, setCaps] = useState<CapabilitiesRecord>(
    parseCapabilities(model.capabilities, { modelId: model.id }),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trueCount = Object.values(caps).filter(Boolean).length;

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      // NEVER write the flat 20-boolean projection over the column — that
      // wipes interaction/output/multilingual/extended features (the TASK-003
      // silent-drop class). Merge each toggled flag back into the canonical
      // shape, preserving everything the editor doesn't model verbatim.
      const merged = mergeAuditRecordIntoCapabilities(model.capabilities, caps, {
        modelId: model.id,
      });
      await aiModelService.patchField(model.id, "capabilities", merged);
      onSaved(caps);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleSetAll = (keys: CapabilityKey[], value: boolean) => {
    setCaps((prev) => {
      const next = { ...prev };
      keys.forEach((k) => {
        next[k] = value;
      });
      return next;
    });
  };

  return (
    <div className="mt-1 space-y-3 bg-muted/30 rounded-md p-3 border">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground">
          {trueCount} / {ALL_CAPABILITY_KEYS.length} capabilities enabled
        </span>
        <div className="flex gap-1">
          <Button
            variant="outline"
            size="sm"
            className="h-5 px-1.5 text-[10px]"
            onClick={() => handleSetAll(ALL_CAPABILITY_KEYS, true)}
          >
            All On
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-5 px-1.5 text-[10px]"
            onClick={() => handleSetAll(ALL_CAPABILITY_KEYS, false)}
          >
            All Off
          </Button>
        </div>
      </div>

      {Object.entries(CAPABILITY_GROUPS).map(([groupName, keys]) => (
        <div key={groupName}>
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
            {groupName}
          </div>
          <div className="flex flex-wrap gap-1">
            {keys.map((k) => (
              <CapabilityToggle
                key={k}
                capKey={k}
                value={caps[k] ?? false}
                onChange={(v) => setCaps((prev) => ({ ...prev, [k]: v }))}
                isRequired={requiredKeys.includes(k)}
              />
            ))}
          </div>
        </div>
      ))}

      <div className="flex items-center gap-2 pt-1 border-t">
        <Button
          size="sm"
          className="h-6 px-2 text-[11px] gap-1"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Save className="h-3 w-3" />
          )}
          Save Capabilities
        </Button>
        {error && <span className="text-destructive text-[10px]">{error}</span>}
        {requiredKeys.length > 0 && (
          <span className="text-[10px] text-muted-foreground">
            Required: {requiredKeys.map((k) => CAPABILITY_LABELS[k]).join(", ")}
          </span>
        )}
      </div>
    </div>
  );
}

function CapabilitiesSummaryChips({ caps }: { caps: CapabilitiesRecord }) {
  const trueKeys = ALL_CAPABILITY_KEYS.filter((k) => caps[k]);
  if (trueKeys.length === 0) {
    return (
      <span className="text-muted-foreground/50 text-xs italic">none</span>
    );
  }
  return (
    <div className="flex flex-wrap gap-0.5 max-w-xs">
      {trueKeys.slice(0, 5).map((k) => (
        <Badge
          key={k}
          variant="outline"
          className="text-[9px] h-3.5 px-1 py-0 font-normal text-green-700 border-green-300"
        >
          {CAPABILITY_LABELS[k]}
        </Badge>
      ))}
      {trueKeys.length > 5 && (
        <Badge
          variant="outline"
          className="text-[9px] h-3.5 px-1 py-0 font-normal text-muted-foreground"
        >
          +{trueKeys.length - 5}
        </Badge>
      )}
    </div>
  );
}

export default function CapabilitiesAuditTab({
  results,
  allModels,
  onModelUpdated,
}: CapabilitiesAuditTabProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [showPassingModels, setShowPassingModels] = useState(false);
  const [savedCaps, setSavedCaps] = useState<
    Record<string, CapabilitiesRecord>
  >({});
  const [detailModelId, setDetailModelId] = useState<string | null>(null);

  // Pull required keys from the first result's issues (they share the same rules config)
  const requiredKeys: CapabilityKey[] =
    results.length > 0
      ? results[0].issues
          .filter(
            (i) =>
              i.category === "capabilities" &&
              i.field.startsWith("capabilities."),
          )
          .map((i) => i.field.replace("capabilities.", "") as CapabilityKey)
          .filter((k) => ALL_CAPABILITY_KEYS.includes(k))
      : [];

  const capResults = results.map((r) => ({
    ...r,
    issues: r.issues.filter((i) => i.category === "capabilities"),
    pass: r.categoryPass.capabilities,
  }));

  const failingResults = capResults.filter((r) => !r.pass);
  const passingResults = capResults.filter((r) => r.pass);
  const displayResults = showPassingModels ? capResults : failingResults;

  const handleSaved = (modelId: string, caps: CapabilitiesRecord) => {
    onModelUpdated(modelId, {
      capabilities: caps as unknown as AiModel["capabilities"],
    });
    setSavedIds((prev) => new Set([...prev, modelId]));
    setSavedCaps((prev) => ({ ...prev, [modelId]: caps }));
    setExpandedId(null);
  };

  return (
    <>
      <div className="flex flex-col h-full min-h-0">
        <div className="flex items-center gap-3 px-3 py-2 border-b shrink-0 bg-muted/20">
          <Zap className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">
            <span className="font-medium text-destructive">
              {failingResults.length} failing
            </span>
            {" · "}
            <span className="font-medium text-green-600">
              {passingResults.length} passing
            </span>
          </span>
          <div className="flex-1" />
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[11px]"
            onClick={() => setShowPassingModels((v) => !v)}
          >
            {showPassingModels ? "Hide passing" : "Show all"}
          </Button>
        </div>

        <AuditTableShell
          isEmpty={displayResults.length === 0}
          empty={
            <div className="flex flex-col items-center gap-2">
              <CheckCircle2 className="h-10 w-10 text-green-500 opacity-60" />
              <p className="text-sm">All models pass capabilities audit</p>
            </div>
          }
          headers={
            <>
              <Th className="w-6" />
              <Th>Model</Th>
              <Th className="w-28">Provider</Th>
              <Th className="w-16">Status</Th>
              <Th>Capabilities</Th>
              <Th className="w-48">Issues</Th>
              <Th className="w-20 text-right">Action</Th>
            </>
          }
        >
          {displayResults.map((r, idx) => {
            const { model } = r;
            const isExpanded = expandedId === model.id;
            const wasSaved = savedIds.has(model.id);
            const caps =
              savedCaps[model.id] ??
              parseCapabilities(model.capabilities, { modelId: model.id });
            const trueCount = Object.values(caps).filter(Boolean).length;

            return (
              <React.Fragment key={model.id}>
                <tr
                  className={`h-10 border-b border-border ${idx % 2 === 0 ? "" : "bg-muted/20"}`}
                >
                  <td className="px-1.5 py-1.5">
                    <OpenDetailButton
                      onClick={() => setDetailModelId(model.id)}
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <ModelNameCell
                      name={model.name}
                      commonName={model.common_name}
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <ProviderBadge provider={model.maker} />
                  </td>
                  <td className="px-3 py-1.5">
                    {wasSaved ? (
                      <span className="inline-flex items-center gap-1 text-green-600 text-xs font-medium">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Saved
                      </span>
                    ) : (
                      <StatusBadge pass={r.pass} />
                    )}
                  </td>
                  <td className="px-3 py-1.5">
                    {trueCount === 0 ? (
                      <span className="text-muted-foreground/50 text-xs italic">
                        none set
                      </span>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <Badge
                          variant="outline"
                          className="text-[10px] h-4 px-1"
                        >
                          {trueCount} set
                        </Badge>
                        <CapabilitiesSummaryChips caps={caps} />
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-1.5">
                    <IssueList issues={r.issues} />
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <Button
                      variant={isExpanded ? "default" : "outline"}
                      size="sm"
                      className="h-6 px-2 text-[11px] gap-1"
                      onClick={() =>
                        setExpandedId(isExpanded ? null : model.id)
                      }
                    >
                      {isExpanded ? (
                        <>
                          <ChevronUp className="h-3 w-3" /> Collapse
                        </>
                      ) : (
                        <>
                          <ChevronDown className="h-3 w-3" /> Edit
                        </>
                      )}
                    </Button>
                  </td>
                </tr>
                {isExpanded && (
                  <tr className={idx % 2 === 0 ? "" : "bg-muted/20"}>
                    <td colSpan={7} className="px-3 pb-3">
                      <InlineCapabilitiesEditor
                        model={model}
                        requiredKeys={requiredKeys}
                        onSaved={(caps) => handleSaved(model.id, caps)}
                      />
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </AuditTableShell>
      </div>

      <ModelDetailSheet
        modelId={detailModelId}
        allModels={allModels}
        onClose={() => setDetailModelId(null)}
        onSaved={(saved) => {
          onModelUpdated(saved.id, saved);
          setDetailModelId(null);
        }}
      />
    </>
  );
}
