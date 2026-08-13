"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import {
  ADMIN_AI_MODELS_SURFACE_NAME,
  createAdminAiModelsScope,
} from "@/features/surfaces/manifests/admin-ai-models.manifest";
import { AI_MODEL_DEEP_LINK_PARAM, AI_MODEL_NEW_VALUE } from "../doors";

export default function AiModelsContainer() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const deepLinkedModelId = searchParams.get(AI_MODEL_DEEP_LINK_PARAM);
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
    const timer = setTimeout(() => void loadData(), 0);
    return () => clearTimeout(timer);
  }, [loadData]);

  const replaceModelDeepLink = useCallback(
    (modelId: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (modelId) params.set(AI_MODEL_DEEP_LINK_PARAM, modelId);
      else params.delete(AI_MODEL_DEEP_LINK_PARAM);
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    },
    [pathname, router, searchParams],
  );

  // The URL is the durable selection source for links, Back/Forward, and
  // references opened from audit/version surfaces.
  useEffect(() => {
    if (isLoading) return;
    const timer = setTimeout(() => {
      if (!deepLinkedModelId) {
        setPanelOpen(false);
        setSelectedModel(null);
        setIsNewModel(false);
        return;
      }
      if (deepLinkedModelId === AI_MODEL_NEW_VALUE) {
        setSelectedModel(null);
        setIsNewModel(true);
        setPanelOpen(true);
        return;
      }
      const linkedModel = models.find(
        (model) => model.id === deepLinkedModelId,
      );
      if (!linkedModel) return;
      setSelectedModel(linkedModel);
      setIsNewModel(false);
      setPanelOpen(true);
    }, 0);
    return () => clearTimeout(timer);
  }, [deepLinkedModelId, isLoading, models]);

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
    replaceModelDeepLink(model.id);
  };

  const openNew = () => {
    replaceModelDeepLink(AI_MODEL_NEW_VALUE);
    setSelectedModel(null);
    setIsNewModel(true);
    setPanelOpen(true);
  };

  const closePanel = () => {
    replaceModelDeepLink(null);
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
    replaceModelDeepLink(saved.id);
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

  // Surface emitter — `matrx-admin/ai-models`. Built at trigger time from live
  // state. SECURITY: public registry facts only. Serving-vendor identity,
  // endpoint base URLs, `auth_ref`, `byok_secret_key` and real-dollar pricing
  // are admin-secret and are deliberately NOT read or emitted here.
  const getSurfaceScope = () => {
    const capabilities =
      selectedModel?.capabilities &&
      typeof selectedModel.capabilities === "object" &&
      !Array.isArray(selectedModel.capabilities)
        ? (selectedModel.capabilities as Record<string, unknown>)
        : null;
    return createAdminAiModelsScope({
      model_ids: models.map((m) => m.id),
      model_count: models.length,
      deprecated_model_count: deprecatedCount,
      models_summary: models.map((m) => ({
        id: m.id,
        name: m.name ?? null,
        common_name: m.common_name ?? null,
        maker: m.maker ?? null,
        context_window: m.context_window ?? null,
        max_tokens: m.max_tokens ?? null,
        is_deprecated: m.is_deprecated ?? null,
        is_primary: m.is_primary ?? null,
        is_premium: m.is_premium ?? null,
        cost_rating: m.cost_rating ?? null,
        speed_rating: m.speed_rating ?? null,
      })),
      provider_names: providers.map((p) => p.name).filter(Boolean),
      provider_count: providers.length,
      active_tab_label: activeTab?.label ?? "",
      is_creating_model: isNewModel,
      search_query: activeTab?.q || undefined,
      active_filters:
        activeTab?.filters && Object.keys(activeTab.filters).length > 0
          ? (activeTab.filters as Record<string, unknown>)
          : undefined,
      sort_state: activeTab?.sort
        ? { sort: activeTab.sort, dir: activeTab.dir ?? "asc" }
        : undefined,
      model_id: selectedModel?.id,
      model_name: selectedModel?.name || undefined,
      model_common_name: selectedModel?.common_name || undefined,
      model_maker: selectedModel?.maker || undefined,
      model_description: selectedModel?.description || undefined,
      model_release_date: selectedModel?.release_date || undefined,
      model_summary: selectedModel
        ? {
            id: selectedModel.id,
            name: selectedModel.name ?? null,
            common_name: selectedModel.common_name ?? null,
            maker: selectedModel.maker ?? null,
            description: selectedModel.description ?? null,
            context_window: selectedModel.context_window ?? null,
            max_tokens: selectedModel.max_tokens ?? null,
            cost_rating: selectedModel.cost_rating ?? null,
            speed_rating: selectedModel.speed_rating ?? null,
            is_deprecated: selectedModel.is_deprecated ?? null,
            is_primary: selectedModel.is_primary ?? null,
            is_premium: selectedModel.is_premium ?? null,
            release_date: selectedModel.release_date ?? null,
          }
        : undefined,
      model_capabilities: capabilities ?? undefined,
      model_capability_keys: capabilities
        ? Object.entries(capabilities)
            .filter(([, v]) => v !== false && v !== null && v !== undefined)
            .map(([k]) => k)
        : undefined,
      model_context_window: selectedModel?.context_window ?? undefined,
      model_max_tokens: selectedModel?.max_tokens ?? undefined,
      model_cost_rating: selectedModel?.cost_rating ?? undefined,
      model_speed_rating: selectedModel?.speed_rating ?? undefined,
      model_is_deprecated: selectedModel?.is_deprecated ?? undefined,
      model_is_primary: selectedModel?.is_primary ?? undefined,
      model_is_premium: selectedModel?.is_premium ?? undefined,
      model_visibility: selectedModel?.visibility ?? undefined,
      model_fallback_ids: selectedModel
        ? {
            mid_fallback_id: selectedModel.mid_fallback_id ?? null,
            guest_fallback_id: selectedModel.guest_fallback_id ?? null,
            retry_fallback_id: selectedModel.retry_fallback_id ?? null,
            retry_max_attempts: selectedModel.retry_max_attempts ?? null,
          }
        : undefined,
      model_updated_at: selectedModel?.updated_at || undefined,
      selection: window.getSelection()?.toString() || undefined,
    });
  };

  return (
    <SurfaceRuntimeProvider
      surfaceName={ADMIN_AI_MODELS_SURFACE_NAME}
      getScope={getSurfaceScope}
      isEditable={false}
    >
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
            ) : (
              <ResizablePanelGroup orientation="horizontal">
                {!panelMaximized && (
                  <>
                    {/* v4: bare numbers are PIXELS — sizes must be "%" strings. */}
                    <ResizablePanel
                      defaultSize="50%"
                      minSize="25%"
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
                  defaultSize="50%"
                  minSize="30%"
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
    </SurfaceRuntimeProvider>
  );
}
