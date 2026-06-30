"use client";

import React, { useMemo, useState } from "react";
import { idMatchesQuery } from "@/utils/search-scoring";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Search,
  X,
  FilterX,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import type { ModelAuditResult, AuditCategory } from "./auditTypes";
import type { AiModel } from "../types";
import { ModelNameCell, ProviderBadge } from "./AuditTableShell";
import ModelDetailSheet, { OpenDetailButton } from "./ModelDetailSheet";

const CATEGORY_LABELS: Record<AuditCategory, string> = {
  core_fields: "Core",
  pricing: "Pricing",
  api_class: "API Class",
  capabilities: "Capabilities",
  configurations: "Config",
};

const CATEGORY_ORDER: AuditCategory[] = [
  "core_fields",
  "pricing",
  "api_class",
  "capabilities",
  "configurations",
];

interface AuditOverviewTabProps {
  results: ModelAuditResult[];
  allModels: AiModel[];
  onJumpToCategory: (cat: AuditCategory) => void;
  onModelUpdated: (id: string, patch: Partial<AiModel>) => void;
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
}: AuditOverviewTabProps) {
  const [q, setQ] = useState("");
  const [filterProvider, setFilterProvider] = useState("__all__");
  const [filterStatus, setFilterStatus] = useState<"all" | "pass" | "fail">(
    "all",
  );
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailModelId, setDetailModelId] = useState<string | null>(null);

  const providers = useMemo(
    () =>
      [
        ...new Set(
          allModels
            .map((m) => m.provider)
            .filter((p): p is string => p != null),
        ),
      ].sort(),
    [allModels],
  );

  const filtered = results.filter((r) => {
    if (filterStatus === "pass" && !r.pass) return false;
    if (filterStatus === "fail" && r.pass) return false;
    if (filterProvider !== "__all__" && r.model.provider !== filterProvider)
      return false;
    if (q) {
      const lq = q.toLowerCase();
      if (
        !r.model.name.toLowerCase().includes(lq) &&
        !(r.model.common_name ?? "").toLowerCase().includes(lq) &&
        !(r.model.provider ?? "").toLowerCase().includes(lq) &&
        !idMatchesQuery(r.model, lq)
      )
        return false;
    }
    return true;
  });

  const totalIssues = results.reduce((acc, r) => acc + r.issues.length, 0);
  const failCount = results.filter((r) => !r.pass).length;

  const hasAnyFilter = !!(
    q ||
    filterProvider !== "__all__" ||
    filterStatus !== "all"
  );

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Stats row */}
      <div className="flex items-center gap-4 px-3 py-2 border-b shrink-0 bg-muted/20 text-xs text-muted-foreground">
        <span>
          <span className="font-medium text-foreground">{results.length}</span>{" "}
          total models
        </span>
        <span>
          <span className="font-medium text-green-600">
            {results.length - failCount}
          </span>{" "}
          fully passing
        </span>
        <span>
          <span className="font-medium text-destructive">{failCount}</span> have
          issues
        </span>
        <span>
          <span className="font-medium text-amber-600">{totalIssues}</span>{" "}
          total issues
        </span>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b shrink-0 bg-muted/10">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search models…"
            className="h-7 pl-6 pr-6 text-xs w-48"
          />
          {q && (
            <button
              onClick={() => setQ("")}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
        <Select value={filterProvider} onValueChange={setFilterProvider}>
          <SelectTrigger className="h-7 text-xs w-32">
            <SelectValue placeholder="Provider" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Providers</SelectItem>
            {providers.map((p) => (
              <SelectItem key={p} value={p}>
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={filterStatus}
          onValueChange={(v) => setFilterStatus(v as "all" | "pass" | "fail")}
        >
          <SelectTrigger className="h-7 text-xs w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="fail">Failing only</SelectItem>
            <SelectItem value="pass">Passing only</SelectItem>
          </SelectContent>
        </Select>
        {hasAnyFilter && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs gap-1 text-muted-foreground"
            onClick={() => {
              setQ("");
              setFilterProvider("__all__");
              setFilterStatus("all");
            }}
          >
            <FilterX className="h-3.5 w-3.5" /> Clear
          </Button>
        )}
        <div className="flex-1" />
        <span className="text-xs text-muted-foreground">
          {filtered.length} shown
        </span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto min-h-0">
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 z-10 bg-card border-b">
            <tr className="h-8">
              <th className="px-1.5 py-2 w-6" />
              <th className="px-3 py-2 text-left font-semibold text-muted-foreground">
                Model
              </th>
              <th className="px-3 py-2 text-left font-semibold text-muted-foreground w-28">
                Provider
              </th>
              <th className="px-3 py-2 text-left font-semibold text-muted-foreground w-28 whitespace-nowrap">
                Overall
              </th>
              {CATEGORY_ORDER.map((cat) => (
                <th
                  key={cat}
                  className="px-2 py-2 text-center font-semibold text-muted-foreground w-20"
                >
                  <button
                    onClick={() => onJumpToCategory(cat)}
                    className="hover:text-primary transition-colors"
                    title={`Go to ${CATEGORY_LABELS[cat]} audit`}
                  >
                    {CATEGORY_LABELS[cat]}
                  </button>
                </th>
              ))}
              <th className="px-3 py-2 text-left font-semibold text-muted-foreground">
                Issues
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, idx) => {
              const isExpanded = expandedId === r.model.id;
              return (
                <React.Fragment key={r.model.id}>
                  <tr
                    className={`h-10 border-b border-border cursor-pointer hover:bg-muted/30 transition-colors ${
                      idx % 2 === 0 ? "" : "bg-muted/20"
                    }`}
                    onClick={() =>
                      setExpandedId(isExpanded ? null : r.model.id)
                    }
                  >
                    <td
                      className="px-1.5 py-1.5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <OpenDetailButton
                        onClick={() => setDetailModelId(r.model.id)}
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <ModelNameCell
                        name={r.model.name}
                        commonName={r.model.common_name}
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <ProviderBadge provider={r.model.provider} />
                    </td>
                    <td className="px-3 py-1.5 whitespace-nowrap">
                      {r.pass ? (
                        <span className="inline-flex items-center gap-1 text-green-600 text-xs">
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> Pass
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-destructive text-xs">
                          <XCircle className="h-3.5 w-3.5 shrink-0" />{" "}
                          {
                            r.issues.filter((i) => i.severity === "error")
                              .length
                          }{" "}
                          errors
                        </span>
                      )}
                    </td>
                    {CATEGORY_ORDER.map((cat) => (
                      <td key={cat} className="px-2 py-1.5 text-center">
                        <CategoryCell pass={r.categoryPass[cat]} />
                      </td>
                    ))}
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-1">
                        {r.issues.length > 0 ? (
                          <>
                            <Badge
                              variant="outline"
                              className={`text-xs h-4 px-1 ${
                                r.issues.some((i) => i.severity === "error")
                                  ? "text-destructive border-destructive/30"
                                  : "text-amber-600 border-amber-300"
                              }`}
                            >
                              {r.issues.length}
                            </Badge>
                            {isExpanded ? (
                              <ChevronUp className="h-3 w-3 text-muted-foreground" />
                            ) : (
                              <ChevronDown className="h-3 w-3 text-muted-foreground" />
                            )}
                          </>
                        ) : (
                          <span className="text-muted-foreground/40 text-xs">
                            —
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                  {isExpanded && r.issues.length > 0 && (
                    <tr className={idx % 2 === 0 ? "" : "bg-muted/20"}>
                      <td colSpan={10} className="px-3 py-2 border-b">
                        <div className="flex flex-wrap gap-2">
                          {r.issues.map((issue, i) => (
                            <button
                              key={i}
                              onClick={() => onJumpToCategory(issue.category)}
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border hover:opacity-80 transition-opacity ${
                                issue.severity === "error"
                                  ? "border-destructive"
                                  : "text-amber-600 border-amber-300 bg-amber-50 dark:bg-amber-900/20"
                              }`}
                            >
                              <AlertTriangle className="h-2.5 w-2.5 shrink-0" />
                              <span className="font-medium uppercase tracking-wide opacity-60 mr-0.5">
                                {CATEGORY_LABELS[issue.category]}:
                              </span>
                              {issue.message}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
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
    </div>
  );
}
