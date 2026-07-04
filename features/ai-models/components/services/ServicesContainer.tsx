"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { extractErrorMessage } from "@/utils/errors";
import { resolveSystemOrgId } from "@/lib/organizations/systemOrg";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  X,
  Save,
  LogOut,
  CheckCircle2,
  AlertTriangle,
  PanelRight,
} from "lucide-react";
import ServiceTable from "./ServiceTable";
import ServiceForm, { EMPTY_SERVICE_FORM, type ServiceFormData } from "./ServiceForm";
import { aiModelService } from "../../service";
import type { AiService, AiServiceInsert, AiServiceUpdate } from "../../types";

function rowToFormData(row: AiService): ServiceFormData {
  return {
    internal_name: row.internal_name ?? "",
    display_name: row.display_name ?? "",
    slug: row.slug ?? "",
    wire_format: row.wire_format ?? "",
    base_url: row.base_url ?? "",
    auth_ref: row.auth_ref ?? {},
    byok_secret_key: row.byok_secret_key ?? "",
    controls: row.controls ?? {},
    request_defaults: row.request_defaults ?? {},
    priority: row.priority != null ? String(row.priority) : "100",
    is_active: row.is_active ?? true,
    notes: row.notes ?? "",
    visibility: row.visibility,
  };
}

// ─── Lean single-view detail panel (no tabs — this entity is simple) ───────

interface ServiceDetailPanelProps {
  service: AiService | null;
  isNew: boolean;
  onClose: () => void;
  onSaved: (service: AiService) => void;
}

function ServiceDetailPanel({
  service,
  isNew,
  onClose,
  onSaved,
}: ServiceDetailPanelProps) {
  const [formData, setFormData] = useState<ServiceFormData>(
    isNew ? EMPTY_SERVICE_FORM : service ? rowToFormData(service) : EMPTY_SERVICE_FORM,
  );
  const [baseline, setBaseline] = useState<ServiceFormData>(formData);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showDirtyDialog, setShowDirtyDialog] = useState(false);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const base = isNew
      ? EMPTY_SERVICE_FORM
      : service
        ? rowToFormData(service)
        : EMPTY_SERVICE_FORM;
    setFormData(base);
    setBaseline(base);
    setSaveError(null);
    setSavedFlash(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service?.id, isNew]);

  useEffect(
    () => () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    },
    [],
  );

  const isDirty = (
    Object.keys({ ...formData, ...baseline }) as Array<keyof ServiceFormData>
  ).some((k) => JSON.stringify(formData[k]) !== JSON.stringify(baseline[k]));

  const displayName = isNew ? "New Service" : service?.display_name || "Service";
  const isSystem = !isNew && !!service?.is_system;

  const requestClose = useCallback(() => {
    if (isDirty) {
      setShowDirtyDialog(true);
    } else {
      onClose();
    }
  }, [isDirty, onClose]);

  const buildPayload = () => ({
    internal_name: formData.internal_name.trim(),
    display_name: formData.display_name.trim(),
    slug: formData.slug.trim(),
    wire_format: formData.wire_format.trim(),
    base_url: formData.base_url.trim() || null,
    auth_ref: formData.auth_ref,
    byok_secret_key: formData.byok_secret_key.trim() || null,
    controls: formData.controls,
    request_defaults: formData.request_defaults,
    priority: formData.priority ? parseInt(formData.priority, 10) : 100,
    is_active: formData.is_active,
    notes: formData.notes.trim() || null,
    visibility: formData.visibility,
  });

  const handleSave = async (): Promise<AiService | null> => {
    setSaveError(null);
    setSaving(true);
    try {
      let saved: AiService;
      if (isNew) {
        // organization_id is required (NOT NULL, no DB default) — every new
        // service catalog row is homed in the global system org.
        const organization_id = await resolveSystemOrgId();
        saved = await aiModelService.createService({
          ...buildPayload(),
          organization_id,
        } as unknown as AiServiceInsert);
      } else if (service) {
        saved = await aiModelService.updateService(
          service.id,
          buildPayload() as unknown as AiServiceUpdate,
        );
      } else {
        return null;
      }

      const newBase = rowToFormData(saved);
      setBaseline(newBase);
      setFormData(newBase);
      setSaveError(null);
      setSavedFlash(true);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setSavedFlash(false), 2500);
      onSaved(saved);
      return saved;
    } catch (err) {
      const msg = extractErrorMessage(err);
      setSaveError(msg);
      console.error("Service save failed:", msg, err);
      return null;
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAndClose = async () => {
    const saved = await handleSave();
    if (saved) onClose();
  };

  const canSave =
    formData.internal_name.trim().length > 0 &&
    formData.display_name.trim().length > 0 &&
    formData.slug.trim().length > 0 &&
    formData.wire_format.trim().length > 0 &&
    (isNew || isDirty);

  return (
    <>
      <div className="h-full flex flex-col overflow-hidden bg-card">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b shrink-0 bg-muted/20">
          <div className="flex items-center gap-2 min-w-0">
            <span className="flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground/60 shrink-0 select-none">
              <PanelRight className="h-3 w-3" />
              Detail
            </span>
            <div className="w-px h-3 bg-border shrink-0" />
            <span className="text-sm font-semibold truncate">{displayName}</span>
            {isNew && (
              <Badge
                variant="outline"
                className="text-xs bg-blue-50 dark:bg-blue-900/20 text-blue-600 shrink-0"
              >
                New
              </Badge>
            )}
            {isSystem && (
              <Badge
                variant="outline"
                className="text-xs bg-muted text-muted-foreground shrink-0"
              >
                System
              </Badge>
            )}
            {isDirty && !saving && (
              <span
                className="w-2 h-2 rounded-full bg-orange-400 shrink-0"
                title="Unsaved changes"
              />
            )}
            {savedFlash && !isDirty && (
              <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 shrink-0">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Saved
              </span>
            )}
          </div>
          <TooltipProvider delayDuration={400}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 shrink-0"
                  onClick={requestClose}
                >
                  <X className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left" className="text-xs">
                Close panel
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-auto p-3 min-h-0">
          <ServiceForm data={formData} isSystem={isSystem} onChange={setFormData} />
        </div>

        {/* Footer */}
        <div className="border-t bg-card shrink-0">
          {saveError && (
            <div className="flex items-start gap-2 px-3 py-2 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-300">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-red-500" />
              <span className="flex-1 min-w-0 break-words">{saveError}</span>
              <button
                type="button"
                onClick={() => setSaveError(null)}
                className="shrink-0 text-red-400 hover:text-red-600 dark:hover:text-red-200"
              >
                <X className="h-3.5 w-3.5" />
              </button>
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
              Cancel
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
                {saving ? "Saving…" : isNew ? "Create & Close" : "Save & Close"}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Dirty-check confirmation dialog */}
      <AlertDialog open={showDirtyDialog} onOpenChange={setShowDirtyDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes to <strong>{displayName}</strong>. What
              would you like to do?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel onClick={() => setShowDirtyDialog(false)}>
              Keep Editing
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowDirtyDialog(false);
                onClose();
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
    </>
  );
}

// ─── Container ──────────────────────────────────────────────────────────────

export default function ServicesContainer() {
  const [services, setServices] = useState<AiService[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedService, setSelectedService] = useState<AiService | null>(null);
  const [isNewService, setIsNewService] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const fetched = await aiModelService.fetchServices();
      setServices(fetched);
    } catch (err) {
      console.error("Failed to load services", extractErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openService = (service: AiService) => {
    setSelectedService(service);
    setIsNewService(false);
    setPanelOpen(true);
  };

  const openNew = () => {
    setSelectedService(null);
    setIsNewService(true);
    setPanelOpen(true);
  };

  const closePanel = () => {
    setPanelOpen(false);
    setSelectedService(null);
    setIsNewService(false);
  };

  const handleSaved = (saved: AiService) => {
    setServices((prev) => {
      const idx = prev.findIndex((s) => s.id === saved.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = saved;
        return next;
      }
      return [...prev, saved].sort((a, b) =>
        a.display_name.localeCompare(b.display_name),
      );
    });
    setSelectedService(saved);
    setIsNewService(false);
  };

  const handleDelete = async (service: AiService) => {
    if (service.is_system) return;
    try {
      await aiModelService.deleteService(service.id);
      setServices((prev) => prev.filter((s) => s.id !== service.id));
      if (selectedService?.id === service.id) closePanel();
    } catch (err) {
      console.error("Failed to delete service", extractErrorMessage(err));
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Table panel */}
        <div
          className={`${panelOpen ? "w-1/2" : "w-full"} min-w-0 flex flex-col transition-all duration-200 overflow-hidden`}
        >
          <ServiceTable
            services={services}
            isLoading={isLoading}
            selectedId={selectedService?.id ?? null}
            onSelect={openService}
            onEdit={openService}
            onDelete={handleDelete}
            onCreate={openNew}
          />
        </div>

        {/* Detail panel */}
        {panelOpen && (
          <div className="w-1/2 border-l-2 border-l-primary/20 shrink-0 flex flex-col overflow-hidden">
            <ServiceDetailPanel
              service={selectedService}
              isNew={isNewService}
              onClose={closePanel}
              onSaved={handleSaved}
            />
          </div>
        )}
      </div>
    </div>
  );
}
