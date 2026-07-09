"use client";

import React, { useEffect, useState, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  RefreshCcw,
  Loader2,
  Settings2,
  AlertTriangle,
  EyeOff,
} from "lucide-react";
import { aiModelService } from "../service";
import type { AiModel } from "../types";
import type {
  AuditCategory,
  AuditRuleConfig,
  ModelAuditResult,
} from "./auditTypes";
import { DEFAULT_AUDIT_RULES, runAudit } from "./auditTypes";
import AuditSummaryBar from "./AuditSummaryBar";
import AuditOverviewTab from "./AuditOverviewTab";
import CapabilitiesAuditTab from "./CapabilitiesAuditTab";
import CoreFieldsAuditTab from "./CoreFieldsAuditTab";
import AuditRulesConfig from "./AuditRulesConfig";

type TabId = AuditCategory | "overview" | "settings";

const TAB_LABELS: Record<TabId, string> = {
  overview: "Overview",
  core_fields: "Core Fields",
  capabilities: "Capabilities",
  configurations: "Configurations",
  settings: "Audit Rules",
};

const TAB_ORDER: TabId[] = [
  "overview",
  "core_fields",
  "capabilities",
  "configurations",
  "settings",
];

export default function ModelAuditDashboard() {
  const [models, setModels] = useState<AiModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rules, setRules] = useState<AuditRuleConfig>(DEFAULT_AUDIT_RULES);
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [excludeDeprecated, setExcludeDeprecated] = useState(true);

  const loadModels = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await aiModelService.fetchAll();
      setModels(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load models");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadModels();
  }, [loadModels]);

  const auditModels = useMemo(
    () => (excludeDeprecated ? models.filter((m) => !m.is_deprecated) : models),
    [models, excludeDeprecated],
  );

  const auditResults: ModelAuditResult[] = useMemo(
    () => (auditModels.length > 0 ? runAudit(auditModels, rules) : []),
    [auditModels, rules],
  );

  const handleModelUpdated = useCallback(
    (id: string, patch: Partial<AiModel>) => {
      setModels((prev) =>
        prev.map((m) => (m.id === id ? { ...m, ...patch } : m)),
      );
    },
    [],
  );

  const failCount = auditResults.filter((r) => !r.pass).length;

  const getFailCountForTab = (tab: TabId): number => {
    if (tab === "overview") return auditResults.filter((r) => !r.pass).length;
    if (tab === "configurations" || tab === "settings") return 0;
    return auditResults.filter((r) => !r.categoryPass[tab as AuditCategory])
      .length;
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b shrink-0 bg-card">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <span className="text-sm font-semibold">AI Model Data Audit</span>
          {!loading && auditResults.length > 0 && (
            <>
              <span className="text-xs text-muted-foreground">
                {auditResults.length} models
              </span>
              {failCount > 0 && (
                <span className="text-xs text-destructive font-medium">
                  · {failCount} failing
                </span>
              )}
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <Checkbox
              checked={excludeDeprecated}
              onCheckedChange={(v) => setExcludeDeprecated(v === true)}
              className="shrink-0"
            />
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <EyeOff className="h-3 w-3" />
              Exclude deprecated
            </span>
          </label>
          <div className="w-px h-4 bg-border" />
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={loadModels}
            disabled={loading}
            title="Refresh models"
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCcw className="h-3.5 w-3.5" />
            )}
          </Button>
          <Button
            variant={activeTab === "settings" ? "default" : "ghost"}
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() =>
              setActiveTab(activeTab === "settings" ? "overview" : "settings")
            }
            title="Configure audit rules"
          >
            <Settings2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {error && (
        <div className="px-4 py-2 bg-destructive/10 border-b text-destructive text-xs shrink-0">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Loading models…</span>
        </div>
      ) : (
        <>
          {activeTab !== "settings" && (
            <AuditSummaryBar
              results={auditResults}
              activeCategory={activeTab}
              onCategoryClick={(cat) => setActiveTab(cat as TabId)}
            />
          )}

          {activeTab !== "settings" && (
            <div className="flex items-center gap-0.5 px-3 py-1.5 border-b shrink-0 overflow-x-auto">
              {TAB_ORDER.filter((t) => t !== "settings").map((tab) => {
                const tabFailCount = getFailCountForTab(tab);
                return (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                      activeTab === tab
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    }`}
                  >
                    {TAB_LABELS[tab]}
                    {tabFailCount > 0 && (
                      <span
                        className={`text-[10px] font-bold px-1 py-0 rounded-full leading-tight ${
                          activeTab === tab
                            ? "bg-primary-foreground/20 text-primary-foreground"
                            : "bg-destructive/15 text-destructive"
                        }`}
                      >
                        {tabFailCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex-1 min-h-0 overflow-hidden">
            {activeTab === "settings" && (
              <AuditRulesConfig rules={rules} onChange={setRules} />
            )}
            {activeTab === "overview" && (
              <AuditOverviewTab
                results={auditResults}
                allModels={auditModels}
                onJumpToCategory={(cat) => setActiveTab(cat)}
                onModelUpdated={handleModelUpdated}
              />
            )}
            {activeTab === "core_fields" && (
              <CoreFieldsAuditTab
                results={auditResults}
                allModels={auditModels}
                onModelUpdated={handleModelUpdated}
              />
            )}
            {activeTab === "capabilities" && (
              <CapabilitiesAuditTab
                results={auditResults}
                allModels={auditModels}
                onModelUpdated={handleModelUpdated}
              />
            )}
            {activeTab === "configurations" && (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                Configurations audit coming soon
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
