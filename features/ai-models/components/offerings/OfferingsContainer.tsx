"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { X, Save, LogOut, AlertTriangle, PanelRight } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { extractErrorMessage } from "@/utils/errors";
import { resolveSystemOrgId } from "@/lib/organizations/systemOrg";
import { aiModelService } from "../../service";
import OfferingTable from "./OfferingTable";
import OfferingForm from "./OfferingForm";
import { AdminAuditTable } from "@/features/administration/canonicalization/components/AdminAuditTable";
import type { AuditColumnDef } from "@/features/administration/canonicalization/components/AdminAuditTable";
import type {
  AiModel,
  AiModelOfferingView,
  AiOffering,
  AiOfferingFormData,
  AiService,
} from "../../types";

const EMPTY_FORM: AiOfferingFormData = {
  model_id: "",
  service_id: "",
  provider_model_id: "",
  priority: "100",
  is_available: true,
  pricing: [],
  usage_basis: "",
  token_billed: false,
  capabilities_override: {},
  controls_override: {},
  notes: "",
  visibility: "internal",
};

function rowToFormData(row: AiOffering): AiOfferingFormData {
  return {
    model_id: row.model_id,
    service_id: row.service_id,
    provider_model_id: row.provider_model_id,
    priority: String(row.priority ?? 100),
    is_available: row.is_available ?? true,
    pricing: row.pricing ?? [],
    usage_basis: row.usage_basis ?? "",
    token_billed: row.token_billed,
    capabilities_override: row.capabilities_override ?? {},
    controls_override: row.controls_override ?? {},
    notes: row.notes ?? "",
    visibility: row.visibility ?? "internal",
  };
}

export default function OfferingsContainer() {
  const [offerings, setOfferings] = useState<AiOffering[]>([]);
  const [models, setModels] = useState<AiModel[]>([]);
  const [services, setServices] = useState<AiService[]>([]);
  const [coverage, setCoverage] = useState<AiModelOfferingView[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("manage");

  const [selected, setSelected] = useState<AiOffering | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [formData, setFormData] = useState<AiOfferingFormData>(EMPTY_FORM);
  const [baseline, setBaseline] = useState<AiOfferingFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showDirtyDialog, setShowDirtyDialog] = useState(false);

  const isDirty =
    JSON.stringify(formData) !== JSON.stringify(baseline);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [fetchedOfferings, fetchedModels, fetchedServices, fetchedCoverage] =
        await Promise.all([
          aiModelService.fetchOfferings(),
          aiModelService.fetchAll(),
          aiModelService.fetchServices(),
          aiModelService.fetchModelOfferingView(),
        ]);
      setOfferings(fetchedOfferings);
      setModels(fetchedModels);
      setServices(fetchedServices);
      setCoverage(fetchedCoverage);
    } catch (err) {
      console.error("Failed to load offerings", extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const modelsWithoutOffering = useMemo(() => {
    const coveredIds = new Set(
      coverage.map((c) => c.model_id).filter(Boolean) as string[],
    );
    return models.filter((m) => !m.is_deprecated && !coveredIds.has(m.id));
  }, [models, coverage]);

  const openOffering = (offering: AiOffering) => {
    setSelected(offering);
    setIsNew(false);
    setFormData(rowToFormData(offering));
    setBaseline(rowToFormData(offering));
    setPanelOpen(true);
  };

  const openNew = () => {
    setSelected(null);
    setIsNew(true);
    setFormData(EMPTY_FORM);
    setBaseline(EMPTY_FORM);
    setPanelOpen(true);
  };

  const closePanel = () => {
    setPanelOpen(false);
    setSelected(null);
    setIsNew(false);
    setSaveError(null);
  };

  const requestClose = () => {
    if (isDirty) setShowDirtyDialog(true);
    else closePanel();
  };

  const handleDelete = async (offering: AiOffering) => {
    try {
      await aiModelService.deleteOffering(offering.id);
      setOfferings((prev) => prev.filter((o) => o.id !== offering.id));
      if (selected?.id === offering.id) closePanel();
    } catch (err) {
      console.error("Delete failed", extractErrorMessage(err));
    }
  };

  const canSave =
    formData.model_id.trim() &&
    formData.service_id.trim() &&
    formData.provider_model_id.trim();

  const handleSave = async (): Promise<AiOffering | null> => {
    setSaveError(null);
    setSaving(true);
    try {
      const payload = {
        model_id: formData.model_id,
        service_id: formData.service_id,
        provider_model_id: formData.provider_model_id.trim(),
        priority: parseInt(formData.priority, 10) || 100,
        is_available: formData.is_available,
        pricing: formData.pricing,
        usage_basis: formData.usage_basis.trim() || null,
        token_billed: formData.token_billed,
        capabilities_override: formData.capabilities_override,
        controls_override: formData.controls_override,
        notes: formData.notes.trim() || null,
        visibility: formData.visibility,
      };

      let saved: AiOffering;
      if (isNew) {
        // organization_id is required — every new offering is homed in the
        // global system org (same pattern as Providers/Services).
        const organization_id = await resolveSystemOrgId();
        saved = await aiModelService.createOffering({
          ...payload,
          organization_id,
        } as unknown as Parameters<typeof aiModelService.createOffering>[0]);
        setOfferings((prev) => [saved, ...prev]);
      } else if (selected) {
        saved = await aiModelService.updateOffering(
          selected.id,
          payload as unknown as Parameters<
            typeof aiModelService.updateOffering
          >[1],
        );
        setOfferings((prev) =>
          prev.map((o) => (o.id === saved.id ? saved : o)),
        );
      } else {
        return null;
      }
      setSelected(saved);
      setIsNew(false);
      const nextForm = rowToFormData(saved);
      setFormData(nextForm);
      setBaseline(nextForm);
      void loadData(); // refresh coverage report
      return saved;
    } catch (err) {
      setSaveError(extractErrorMessage(err));
      return null;
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAndClose = async () => {
    const saved = await handleSave();
    if (saved) closePanel();
  };

  const coverageColumns: AuditColumnDef<AiModelOfferingView>[] = [
    {
      key: "model",
      label: "Model",
      type: "text",
      getValue: (r) => r.model_common_name ?? r.model_name ?? "",
      width: "minmax(180px,1.4fr)",
    },
    {
      key: "service",
      label: "Service",
      type: "enum",
      getValue: (r) => r.service_name ?? "",
      width: "160px",
    },
    {
      key: "priority",
      label: "Priority",
      type: "number",
      getValue: (r) => r.priority,
      width: "90px",
      align: "right",
    },
    {
      key: "is_available",
      label: "Available",
      type: "enum",
      getValue: (r) => (r.is_available ? "Yes" : "No"),
      width: "100px",
    },
    {
      key: "points_in",
      label: "Pts/M Input",
      type: "number",
      getValue: (r) => r.points_per_million_input,
      width: "110px",
      align: "right",
    },
    {
      key: "points_out",
      label: "Pts/M Output",
      type: "number",
      getValue: (r) => r.points_per_million_output,
      width: "120px",
      align: "right",
    },
  ];

  const gapColumns: AuditColumnDef<AiModel>[] = [
    {
      key: "model",
      label: "Model (no offering)",
      type: "text",
      getValue: (m) => m.common_name || m.name,
      width: "minmax(200px,1.6fr)",
    },
    {
      key: "provider",
      label: "Provider",
      type: "enum",
      getValue: (m) => m.provider ?? "",
      width: "160px",
    },
  ];

  return (
    <div className="flex flex-col h-full min-h-0">
      <Tabs
        value={tab}
        onValueChange={setTab}
        className="flex-1 flex flex-col overflow-hidden min-h-0"
      >
        <div className="border-b px-3 shrink-0 bg-card">
          <TabsList className="h-10 bg-transparent p-0 gap-0">
            <TabsTrigger
              value="manage"
              className="h-10 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-sm px-4"
            >
              Manage
              <Badge variant="outline" className="ml-1.5 text-xs h-4 px-1">
                {offerings.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger
              value="coverage"
              className="h-10 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-sm px-4"
            >
              Coverage
              {modelsWithoutOffering.length > 0 && (
                <Badge
                  variant="outline"
                  className="ml-1.5 text-xs h-4 px-1 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border-amber-300"
                >
                  {modelsWithoutOffering.length} gaps
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent
          value="manage"
          className="flex-1 m-0 overflow-hidden min-h-0"
        >
          <div className="flex h-full min-h-0">
            <div
              className={`${panelOpen ? "w-1/2" : "w-full"} min-w-0 flex flex-col overflow-hidden p-2 transition-all duration-200`}
            >
              <OfferingTable
                offerings={offerings}
                models={models}
                services={services}
                loading={loading}
                onSelect={openOffering}
                onDelete={handleDelete}
                onCreate={openNew}
              />
            </div>

            {panelOpen && (
              <div className="w-1/2 border-l-2 border-l-primary/20 shrink-0 flex flex-col overflow-hidden bg-card">
                <div className="flex items-center justify-between px-3 py-2 border-b shrink-0 bg-muted/20">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground/60 shrink-0 select-none">
                      <PanelRight className="h-3 w-3" />
                      Detail
                    </span>
                    <div className="w-px h-3 bg-border shrink-0" />
                    <span className="text-sm font-semibold truncate">
                      {isNew ? "New Offering" : "Edit Offering"}
                    </span>
                    {isDirty && !saving && (
                      <span
                        className="w-2 h-2 rounded-full bg-orange-400 shrink-0"
                        title="Unsaved changes"
                      />
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 shrink-0"
                    onClick={requestClose}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                <div className="flex-1 overflow-auto p-3 min-h-0">
                  <OfferingForm
                    data={formData}
                    models={models}
                    services={services}
                    onChange={setFormData}
                  />
                </div>

                <div className="border-t bg-card shrink-0">
                  {saveError && (
                    <div className="flex items-start gap-2 px-3 py-2 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-300">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-red-500" />
                      <span className="flex-1 min-w-0 break-words">
                        {saveError}
                      </span>
                    </div>
                  )}
                  <div className="px-3 py-2 flex items-center justify-between gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-3 text-xs gap-1.5"
                      onClick={requestClose}
                    >
                      <X className="h-3.5 w-3.5" />
                      Close
                    </Button>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 px-3 text-xs gap-1.5"
                        onClick={() => handleSave()}
                        disabled={saving || !canSave}
                      >
                        <Save className="h-3.5 w-3.5" />
                        {saving ? "Saving…" : isNew ? "Create" : "Save"}
                      </Button>
                      <Button
                        size="sm"
                        className="h-8 px-3 text-xs gap-1.5 bg-primary hover:bg-primary/90"
                        onClick={handleSaveAndClose}
                        disabled={saving || !canSave}
                      >
                        <LogOut className="h-3.5 w-3.5" />
                        {saving
                          ? "Saving…"
                          : isNew
                            ? "Create & Close"
                            : "Save & Close"}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent
          value="coverage"
          className="flex-1 m-0 overflow-hidden min-h-0 p-2 flex flex-col gap-2"
        >
          <div className="min-h-0 flex-[2] flex flex-col">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 shrink-0">
              Live offerings ({coverage.length})
            </p>
            <div className="min-h-0 flex-1">
              <AdminAuditTable
                rows={coverage}
                columns={coverageColumns}
                loading={loading}
                emptyMessage="No offerings."
                csvFilename="ai_model_offering_view"
              />
            </div>
          </div>
          <div className="min-h-0 flex-1 flex flex-col">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 shrink-0">
              Models with zero offerings ({modelsWithoutOffering.length})
            </p>
            <div className="min-h-0 flex-1">
              <AdminAuditTable
                rows={modelsWithoutOffering}
                columns={gapColumns}
                loading={loading}
                emptyMessage="Every active model has at least one offering."
                onRowClick={openNew}
                csvFilename="ai_models_without_offering"
              />
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <AlertDialog open={showDirtyDialog} onOpenChange={setShowDirtyDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes to this offering. What would you like
              to do?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel onClick={() => setShowDirtyDialog(false)}>
              Keep Editing
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowDirtyDialog(false);
                closePanel();
              }}
              className="bg-destructive hover:bg-destructive/90"
            >
              Discard & Close
            </AlertDialogAction>
            <AlertDialogAction
              onClick={async () => {
                setShowDirtyDialog(false);
                await handleSaveAndClose();
              }}
              className="bg-primary hover:bg-primary/90"
            >
              Save & Close
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
