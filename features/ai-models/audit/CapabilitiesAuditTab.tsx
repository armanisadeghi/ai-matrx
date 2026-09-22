"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Circle, Loader2, Save, Zap } from "lucide-react";
import {
  MatrxDataTable,
  type MatrxColumnDef,
} from "@ai-matrx/design-system/data-table";
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
import { IssueList, ProviderBadge, StatusBadge } from "./AuditTableShell";
import ModelDetailSheet, { OpenDetailButton } from "./ModelDetailSheet";

interface CapabilitiesAuditTabProps {
  results: ModelAuditResult[];
  allModels: AiModel[];
  onModelUpdated: (id: string, patch: Partial<AiModel>) => void;
  onRefresh: () => Promise<void>;
}

function CapabilityToggle({
  capKey,
  value,
  onChange,
  isRequired,
}: {
  capKey: CapabilityKey;
  value: boolean;
  onChange: (value: boolean) => void;
  isRequired: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      aria-pressed={value}
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium transition-colors ${value ? "border-green-300 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" : "border-border bg-muted text-muted-foreground hover:border-primary/30"} ${isRequired && !value ? "ring-1 ring-destructive" : ""}`}
    >
      {value ? (
        <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
      ) : (
        <Circle className="h-3 w-3" aria-hidden="true" />
      )}
      {CAPABILITY_LABELS[capKey]}
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
  const setAll = (keys: CapabilityKey[], value: boolean) =>
    setCaps((previous) => {
      const next = { ...previous };
      keys.forEach((key) => {
        next[key] = value;
      });
      return next;
    });
  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      // The canonical table owns expansion; this domain editor keeps its merge
      // invariant so unmodeled capability fields can never be silently erased.
      const merged = mergeAuditRecordIntoCapabilities(
        model.capabilities,
        caps,
        { modelId: model.id },
      );
      await aiModelService.patchField(model.id, "capabilities", merged);
      onSaved(caps);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="m-2 space-y-3 rounded-md border bg-muted/30 p-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground">
          {trueCount} / {ALL_CAPABILITY_KEYS.length} capabilities enabled
        </span>
        <div className="flex gap-1">
          <Button
            variant="outline"
            size="sm"
            className="h-5 px-1.5 text-[10px]"
            onClick={() => setAll(ALL_CAPABILITY_KEYS, true)}
          >
            All On
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-5 px-1.5 text-[10px]"
            onClick={() => setAll(ALL_CAPABILITY_KEYS, false)}
          >
            All Off
          </Button>
        </div>
      </div>
      {Object.entries(CAPABILITY_GROUPS).map(([groupName, keys]) => (
        <div key={groupName}>
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {groupName}
          </div>
          <div className="flex flex-wrap gap-1">
            {keys.map((key) => (
              <CapabilityToggle
                key={key}
                capKey={key}
                value={caps[key] ?? false}
                onChange={(value) =>
                  setCaps((previous) => ({ ...previous, [key]: value }))
                }
                isRequired={requiredKeys.includes(key)}
              />
            ))}
          </div>
        </div>
      ))}
      <div className="flex items-center gap-2 border-t pt-1">
        <Button
          size="sm"
          className="h-6 gap-1 px-2 text-[11px]"
          onClick={() => void handleSave()}
          disabled={saving}
        >
          {saving ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Save className="h-3 w-3" />
          )}
          Save capabilities
        </Button>
        {error && <span className="text-[10px] text-destructive">{error}</span>}
        {requiredKeys.length > 0 && (
          <span className="text-[10px] text-muted-foreground">
            Required:{" "}
            {requiredKeys.map((key) => CAPABILITY_LABELS[key]).join(", ")}
          </span>
        )}
      </div>
    </div>
  );
}

function CapabilityChips({ caps }: { caps: CapabilitiesRecord }) {
  const enabled = ALL_CAPABILITY_KEYS.filter((key) => caps[key]);
  return enabled.length === 0 ? (
    <span className="text-xs italic text-muted-foreground/50">none</span>
  ) : (
    <div className="flex flex-wrap gap-0.5">
      {enabled.map((key) => (
        <Badge
          key={key}
          variant="outline"
          className="h-4 border-green-300 px-1 py-0 text-[9px] font-normal text-green-700"
        >
          {CAPABILITY_LABELS[key]}
        </Badge>
      ))}
    </div>
  );
}

export default function CapabilitiesAuditTab({
  results,
  allModels,
  onModelUpdated,
  onRefresh,
}: CapabilitiesAuditTabProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [showPassingModels, setShowPassingModels] = useState(false);
  const [savedCaps, setSavedCaps] = useState<
    Record<string, CapabilitiesRecord>
  >({});
  const [detailModelId, setDetailModelId] = useState<string | null>(null);
  const requiredKeys: CapabilityKey[] =
    results.length > 0
      ? results[0].issues
          .filter(
            (issue) =>
              issue.category === "capabilities" &&
              issue.field.startsWith("capabilities."),
          )
          .map(
            (issue) =>
              issue.field.replace("capabilities.", "") as CapabilityKey,
          )
          .filter((key) => ALL_CAPABILITY_KEYS.includes(key))
      : [];
  const capResults = results.map((result) => ({
    ...result,
    issues: result.issues.filter((issue) => issue.category === "capabilities"),
    pass: result.categoryPass.capabilities,
  }));
  const failingResults = capResults.filter((result) => !result.pass);
  const passingResults = capResults.filter((result) => result.pass);
  const displayResults = showPassingModels ? capResults : failingResults;
  const getCaps = (result: ModelAuditResult) =>
    savedCaps[result.model.id] ??
    parseCapabilities(result.model.capabilities, { modelId: result.model.id });
  const handleSaved = (modelId: string, caps: CapabilitiesRecord) => {
    onModelUpdated(modelId, {
      capabilities: caps as unknown as AiModel["capabilities"],
    });
    setSavedIds((previous) => new Set([...previous, modelId]));
    setSavedCaps((previous) => ({ ...previous, [modelId]: caps }));
    setExpandedId(null);
  };
  const columns: MatrxColumnDef<ModelAuditResult>[] = [
    {
      id: "model_id",
      accessorFn: (r) => r.model.id,
      header: "Model ID",
      hidden: true,
    },
    {
      id: "model_name",
      accessorFn: (r) => r.model.name,
      header: "API name",
      cell: (r) => (
        <span className="font-mono text-xs text-muted-foreground">
          {r.model.name}
        </span>
      ),
      frozen: true,
      width: 220,
    },
    {
      id: "common_name",
      accessorFn: (r) => r.model.common_name ?? "",
      header: "Common name",
      cell: (r) => r.model.common_name ?? "—",
      width: 180,
    },
    {
      id: "provider",
      accessorFn: (r) => r.model.maker ?? "",
      header: "Provider",
      cell: (r) => <ProviderBadge provider={r.model.maker} />,
      filter: "select",
      width: 130,
    },
    {
      id: "status",
      accessorFn: (r) => (r.pass ? "pass" : "fail"),
      header: "Status",
      filter: "select",
      filterOptions: [
        { value: "pass", label: "Pass" },
        { value: "fail", label: "Fail" },
      ],
      width: 110,
      cell: (r) =>
        savedIds.has(r.model.id) ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Saved
          </span>
        ) : (
          <StatusBadge pass={r.pass} />
        ),
    },
    {
      id: "capability_count",
      accessorFn: (r) => Object.values(getCaps(r)).filter(Boolean).length,
      header: "Enabled",
      filter: "number",
      width: 100,
      cell: (r) => (
        <Badge variant="outline">
          {Object.values(getCaps(r)).filter(Boolean).length}
        </Badge>
      ),
    },
    {
      id: "capabilities",
      accessorFn: (r) =>
        ALL_CAPABILITY_KEYS.filter((key) => getCaps(r)[key])
          .map((key) => CAPABILITY_LABELS[key])
          .join(" "),
      header: "Capabilities",
      cell: (r) => <CapabilityChips caps={getCaps(r)} />,
      width: 360,
    },
    {
      id: "issues",
      accessorFn: (r) => r.issues.map((issue) => issue.message).join(" "),
      header: "Issues",
      cell: (r) => <IssueList issues={r.issues} />,
      width: 280,
    },
  ];
  return (
    <>
      <MatrxDataTable<ModelAuditResult>
        tableId="ai-model-audit-capabilities"
        viewTabs={false}
        data={displayResults}
        columns={columns}
        getRowId={(r) => r.model.id}
        defaultSort={{ id: "model_name", direction: "asc" }}
        toolbar={{
          title: "Capability audit",
          searchPlaceholder: "Search capability audit",
          refresh: { onRefresh },
          actions: (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Zap className="h-3.5 w-3.5" />
              <span>
                <span className="font-medium text-destructive">
                  {failingResults.length} failing
                </span>{" "}
                ·{" "}
                <span className="font-medium text-green-600">
                  {passingResults.length} passing
                </span>
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setShowPassingModels((value) => !value)}
              >
                {showPassingModels ? "Hide passing" : "Show all"}
              </Button>
            </div>
          ),
        }}
        emptyState={{
          title: showPassingModels
            ? "No models match this audit view"
            : "All models pass capabilities audit",
          icon: <CheckCircle2 className="h-10 w-10 text-green-500" />,
        }}
        detail={{ enabled: false }}
        copy={{
          label: "AI model audit",
          location: "AI Model Data Audit",
          rowKind: "ai-model-audit",
          listKind: "ai-model-audit-list",
          humanRow: (result) => result.model.common_name ?? result.model.name,
          agentRow: (result) => result.model,
        }}
        expandedDetail={{
          expandedId,
          onExpandedIdChange: setExpandedId,
          canExpand: () => true,
          render: (r) => (
            <InlineCapabilitiesEditor
              model={r.model}
              requiredKeys={requiredKeys}
              onSaved={(caps) => handleSaved(r.model.id, caps)}
            />
          ),
        }}
        rowActions={(r) => (
          <OpenDetailButton onClick={() => setDetailModelId(r.model.id)} />
        )}
      />
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
