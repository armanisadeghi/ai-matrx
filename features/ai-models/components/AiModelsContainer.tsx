"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import AiModelTable from "./AiModelTable";
import AiModelTabBar from "./AiModelTabBar";
import AiModelDetailPanel from "./AiModelDetailPanel";
import DeprecatedModelsAudit from "./DeprecatedModelsAudit";
import { useTabUrlState } from "../hooks/useTabUrlState";
import { aiModelService } from "../service";
import type { AiModel, AiProvider } from "../types";
import { applyFiltersForCount } from "@/features/ai-models/utils/filterUtils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, BookOpen, Maximize2, Minimize2 } from "lucide-react";
import ProviderReferenceModal from "./ProviderReferenceModal";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";

export default function AiModelsContainer() {
  const [models, setModels] = useState<AiModel[]>([]);
  const [providers, setProviders] = useState<AiProvider[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedModel, setSelectedModel] = useState<AiModel | null>(null);
  const [isNewModel, setIsNewModel] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelMaximized, setPanelMaximized] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);
  const [referenceOpen, setReferenceOpen] = useState(false);

  const {
    tabIds,
    activeTabId,
    tabStates,
    activeTab,
    setActiveTab,
    openTab,
    closeTab,
    renameTab,
    updateTabState,
  } = useTabUrlState();

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [fetchedModels, fetchedProviders] = await Promise.all([
        aiModelService.fetchAll(),
        aiModelService.fetchProviders(),
      ]);
      setModels(fetchedModels);
      setProviders(fetchedProviders);
    } catch (err) {
      console.error("Failed to load AI models", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Count badges: how many models match each tab's filters
  const tabCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const tab of tabStates) {
      counts[tab.id] = applyFiltersForCount(models, tab.q, tab.filters);
    }
    return counts;
  }, [models, tabStates]);

  const deprecatedCount = useMemo(
    () => models.filter((m) => m.is_deprecated).length,
    [models],
  );

  const openModel = (model: AiModel) => {
    setSelectedModel(model);
    setIsNewModel(false);
    setPanelOpen(true);
  };

  const openNew = () => {
    setSelectedModel(null);
    setIsNewModel(true);
    setPanelOpen(true);
  };

  const closePanel = () => {
    setPanelOpen(false);
    setSelectedModel(null);
    setIsNewModel(false);
  };

  const handleSaved = (saved: AiModel) => {
    setModels((prev) => {
      const idx = prev.findIndex((m) => m.id === saved.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = saved;
        return next;
      }
      return [saved, ...prev];
    });
    setSelectedModel(saved);
    setIsNewModel(false);
  };

  const handleDeleted = (id: string) => {
    setModels((prev) => prev.filter((m) => m.id !== id));
    closePanel();
  };

  const handleDuplicate = async (model: AiModel) => {
    try {
      const { id: _id, ...rest } = model;
      const duplicate = await aiModelService.create({
        ...rest,
        name: `${model.name}-copy`,
        common_name: model.common_name ? `${model.common_name} (Copy)` : null,
        is_primary: false,
      });
      setModels((prev) => [duplicate, ...prev]);
      openModel(duplicate);
    } catch (err) {
      console.error("Duplicate failed", err);
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Tab bar + audit button */}
      <div className="flex items-center shrink-0 bg-card">
        <div className="flex-1 min-w-0">
          <AiModelTabBar
            tabs={tabStates}
            activeTabId={activeTabId}
            counts={tabCounts}
            onSelectTab={setActiveTab}
            onCloseTab={closeTab}
            onRenameTab={renameTab}
            onAddTab={() => openTab()}
          />
        </div>
        <div className="shrink-0 px-2 border-l flex items-center gap-1">
          <Button
            variant={referenceOpen ? "secondary" : "ghost"}
            size="sm"
            className="h-7 px-2 text-xs gap-1.5"
            onClick={() => setReferenceOpen((v) => !v)}
            title="Open floating provider reference panel"
          >
            <BookOpen className="h-3.5 w-3.5" />
            Provider Ref
          </Button>
          {deprecatedCount > 0 && (
            <Button
              variant={auditOpen ? "secondary" : "ghost"}
              size="sm"
              className="h-7 px-2 text-xs gap-1.5"
              onClick={() => setAuditOpen((v) => !v)}
              title="View and fix deprecated model references"
            >
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
              Deprecated Audit
              <Badge
                variant="outline"
                className="h-4 px-1 text-[10px] bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border-amber-300"
              >
                {deprecatedCount}
              </Badge>
            </Button>
          )}
        </div>
      </div>

      {/* Deprecated audit panel (full-width, replaces table when open) */}
      {auditOpen ? (
        <div className="flex-1 min-h-0 overflow-hidden">
          <DeprecatedModelsAudit
            allModels={models}
            onClose={() => setAuditOpen(false)}
            onModelsChanged={loadData}
          />
        </div>
      ) : (
        /* Main content: table + optional detail panel (drag to resize) */
        <div className="flex flex-1 min-h-0 overflow-hidden relative">
          {!panelOpen ? (
            <div className="w-full min-w-0 flex flex-col overflow-hidden">
              <AiModelTable
                models={models}
                providers={providers}
                isLoading={isLoading}
                selectedId={selectedModel?.id ?? null}
                tabState={activeTab}
                onUpdateTabState={(patch) => updateTabState(activeTabId, patch)}
                onSelect={openModel}
                onEdit={openModel}
                onDelete={(model) => handleDeleted(model.id)}
                onDuplicate={handleDuplicate}
                onCreate={openNew}
                onRefresh={loadData}
              />
            </div>
          ) : (
            <ResizablePanelGroup orientation="horizontal">
              {!panelMaximized && (
                <>
                  <ResizablePanel
                    defaultSize={50}
                    minSize={25}
                    style={{ overflow: "hidden", height: "100%" }}
                  >
                    <div className="h-full min-w-0 flex flex-col overflow-hidden">
                      <AiModelTable
                        models={models}
                        providers={providers}
                        isLoading={isLoading}
                        selectedId={selectedModel?.id ?? null}
                        tabState={activeTab}
                        onUpdateTabState={(patch) =>
                          updateTabState(activeTabId, patch)
                        }
                        onSelect={openModel}
                        onEdit={openModel}
                        onDelete={(model) => handleDeleted(model.id)}
                        onDuplicate={handleDuplicate}
                        onCreate={openNew}
                        onRefresh={loadData}
                      />
                    </div>
                  </ResizablePanel>
                  <ResizableHandle />
                </>
              )}
              <ResizablePanel
                defaultSize={50}
                minSize={30}
                style={{ overflow: "hidden", height: "100%" }}
              >
                <div className="h-full border-l-2 border-l-primary/20 flex flex-col overflow-hidden relative">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 absolute top-2 right-10 z-10"
                    onClick={() => setPanelMaximized((v) => !v)}
                    title={
                      panelMaximized
                        ? "Restore split view"
                        : "Maximize detail panel"
                    }
                  >
                    {panelMaximized ? (
                      <Minimize2 className="h-3.5 w-3.5" />
                    ) : (
                      <Maximize2 className="h-3.5 w-3.5" />
                    )}
                  </Button>
                  <AiModelDetailPanel
                    model={selectedModel}
                    isNew={isNewModel}
                    providers={providers}
                    allModels={models}
                    onClose={closePanel}
                    onSaved={handleSaved}
                    onDeleted={handleDeleted}
                  />
                </div>
              </ResizablePanel>
            </ResizablePanelGroup>
          )}
        </div>
      )}

      {referenceOpen && providers.length > 0 && (
        <ProviderReferenceModal
          providers={providers}
          onClose={() => setReferenceOpen(false)}
        />
      )}
    </div>
  );
}
