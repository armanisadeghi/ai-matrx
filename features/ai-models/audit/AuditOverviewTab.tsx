"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  MatrxDataTable,
  type MatrxColumnDef,
} from "@ai-matrx/design-system/data-table";
import type { ModelAuditResult, AuditCategory } from "./auditTypes";
import type { AiModel } from "../types";
import { ProviderBadge } from "./AuditTableShell";
import ModelDetailSheet, { OpenDetailButton } from "./ModelDetailSheet";

const CATEGORY_LABELS: Record<AuditCategory, string> = {
  core_fields: "Core",
  capabilities: "Capabilities",
  configurations: "Config",
};
const CATEGORY_ORDER: AuditCategory[] = [
  "core_fields",
  "capabilities",
  "configurations",
];

interface AuditOverviewTabProps {
  results: ModelAuditResult[];
  allModels: AiModel[];
  onJumpToCategory: (cat: AuditCategory) => void;
  onModelUpdated: (id: string, patch: Partial<AiModel>) => void;
  onRefresh: () => Promise<void>;
}

function CategoryCell({ pass }: { pass: boolean }) {
  return pass ? (
    <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
  ) : (
    <XCircle className="h-3.5 w-3.5 text-destructive" />
  );
}

export default function AuditOverviewTab({
  results,
  allModels,
  onJumpToCategory,
  onModelUpdated,
  onRefresh,
}: AuditOverviewTabProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailModelId, setDetailModelId] = useState<string | null>(null);
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
      width: 220,
      frozen: true,
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
      id: "overall_status",
      accessorFn: (r) => (r.pass ? "pass" : "fail"),
      header: "Overall",
      filter: "select",
      filterOptions: [
        { value: "pass", label: "Pass" },
        { value: "fail", label: "Fail" },
      ],
      width: 120,
      cell: (r) =>
        r.pass ? (
          <span className="inline-flex items-center gap-1 text-green-600">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Pass
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-destructive">
            <XCircle className="h-3.5 w-3.5" />
            {r.issues.filter((issue) => issue.severity === "error").length}{" "}
            errors
          </span>
        ),
    },
    ...CATEGORY_ORDER.map((category): MatrxColumnDef<ModelAuditResult> => ({
      id: category,
      accessorFn: (r) => r.categoryPass[category],
      header: CATEGORY_LABELS[category],
      cell: (r) => (
        <div className="flex justify-center">
          <button
            type="button"
            className="rounded p-1 hover:bg-muted"
            onClick={() => onJumpToCategory(category)}
            title={`Go to ${CATEGORY_LABELS[category]} audit`}
          >
            <CategoryCell pass={r.categoryPass[category]} />
          </button>
        </div>
      ),
      filter: "boolean",
      align: "center",
      width: 100,
    })),
    {
      id: "issue_count",
      accessorFn: (r) => r.issues.length,
      header: "Issues",
      filter: "number",
      width: 90,
      cell: (r) =>
        r.issues.length > 0 ? (
          <Badge
            variant="outline"
            className={
              r.issues.some((issue) => issue.severity === "error")
                ? "border-destructive/30 text-destructive"
                : "border-amber-300 text-amber-600"
            }
          >
            {r.issues.length}
          </Badge>
        ) : (
          "—"
        ),
    },
  ];
  return (
    <>
      <MatrxDataTable<ModelAuditResult>
        tableId="ai-model-audit-overview"
        viewTabs={false}
        data={results}
        columns={columns}
        getRowId={(r) => r.model.id}
        defaultSort={{ id: "issue_count", direction: "desc" }}
        toolbar={{
          title: "Model audit overview",
          searchPlaceholder: "Search models, names, or providers",
          refresh: { onRefresh },
        }}
        emptyState={{ title: "No models match this audit view" }}
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
          canExpand: (r) => r.issues.length > 0,
          render: (r) => (
            <div className="flex flex-wrap gap-2 px-3 py-2">
              {r.issues.map((issue, index) => (
                <button
                  key={`${issue.category}-${issue.field}-${index}`}
                  type="button"
                  onClick={() => onJumpToCategory(issue.category)}
                  className={
                    issue.severity === "error"
                      ? "inline-flex items-center gap-1 rounded-full border border-destructive px-2 py-0.5 text-xs text-destructive"
                      : "inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs text-amber-600 dark:bg-amber-900/20"
                  }
                >
                  <AlertTriangle className="h-2.5 w-2.5" />
                  <span className="font-medium uppercase opacity-60">
                    {CATEGORY_LABELS[issue.category]}:
                  </span>
                  {issue.message}
                </button>
              ))}
            </div>
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
