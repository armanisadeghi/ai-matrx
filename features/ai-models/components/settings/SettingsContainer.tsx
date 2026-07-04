"use client";

import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
  X,
  CheckCircle2,
  Save,
  LogOut,
  PanelRight,
  AlertTriangle,
  SlidersHorizontal,
} from "lucide-react";
import SettingTable from "./SettingTable";
import SettingForm from "./SettingForm";
import { aiModelService } from "../../service";
import { resolveSystemOrgId } from "@/lib/organizations/systemOrg";
import { extractErrorMessage } from "@/utils/errors";
import type {
  AiSetting,
  AiSettingFormData,
  AiSettingInsert,
  AiSettingUpdate,
} from "../../types";

function rowToFormData(row: AiSetting): AiSettingFormData {
  return {
    key: row.key ?? "",
    value_type: row.value_type ?? "",
    canonical_min: row.canonical_min != null ? String(row.canonical_min) : "",
    canonical_max: row.canonical_max != null ? String(row.canonical_max) : "",
    canonical_values: Array.isArray(row.canonical_values)
      ? row.canonical_values
      : [],
    default_value: row.default_value ?? null,
    ui: row.ui ?? {},
    description: row.description ?? "",
    visibility: row.visibility ?? "public",
  };
}

const EMPTY_FORM: AiSettingFormData = {
  key: "",
  value_type: "",
  canonical_min: "",
  canonical_max: "",
  canonical_values: [],
  default_value: null,
  ui: {},
  description: "",
  visibility: "public",
};

function parseNumericField(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isNaN(n) ? null : n;
}

interface SettingDetailPanelProps {
  setting: AiSetting | null;
  isNew: boolean;
  onClose: () => void;
  onSaved: (setting: AiSetting) => void;
  onDeleted: (id: string) => void;
}

function SettingDetailPanel({
  setting,
  isNew,
  onClose,
  onSaved,
  onDeleted,
}: SettingDetailPanelProps) {
  const [formData, setFormData] = useState<AiSettingFormData>(
    isNew ? EMPTY_FORM : setting ? rowToFormData(setting) : EMPTY_FORM,
  );
  const [baseline, setBaseline] = useState<AiSettingFormData>(
    isNew ? EMPTY_FORM : setting ? rowToFormData(setting) : EMPTY_FORM,
  );
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showDirtyDialog, setShowDirtyDialog] = useState(false);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isDirty = (
    Object.keys({ ...formData, ...baseline }) as Array<keyof AiSettingFormData>
  ).some((k) => JSON.stringify(formData[k]) !== JSON.stringify(baseline[k]));

  useEffect(() => {
    const base = isNew
      ? EMPTY_FORM
      : setting
        ? rowToFormData(setting)
        : EMPTY_FORM;
    setFormData(base);
    setBaseline(base);
    setSavedFlash(false);
    setSaveError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setting?.id, isNew]);

  useEffect(
    () => () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    },
    [],
  );

  const requestClose = useCallback(() => {
    if (isDirty) {
      setShowDirtyDialog(true);
    } else {
      onClose();
    }
  }, [isDirty, onClose]);

  const displayName = isNew ? "New Setting" : setting?.key || "Setting";
  const isSystem = setting?.is_system ?? false;

  // Concrete (non-union) shape so `key`/`value_type` stay required — spreading
  // a `AiSettingInsert | AiSettingUpdate` union loses that guarantee because
  // AiSettingUpdate makes every field optional.
  type SettingFieldsPayload = {
    key: string;
    value_type: string;
    canonical_min: AiSettingInsert["canonical_min"];
    canonical_max: AiSettingInsert["canonical_max"];
    canonical_values: AiSettingInsert["canonical_values"];
    default_value: AiSettingInsert["default_value"];
    ui: AiSettingInsert["ui"];
    description: string | null;
    visibility: AiSettingFormData["visibility"];
  };

  const buildPayload = (): SettingFieldsPayload => ({
    key: formData.key.trim(),
    value_type: formData.value_type.trim(),
    canonical_min: parseNumericField(formData.canonical_min),
    canonical_max: parseNumericField(formData.canonical_max),
    canonical_values:
      formData.canonical_values.length > 0
        ? (formData.canonical_values as AiSettingInsert["canonical_values"])
        : null,
    default_value: (formData.default_value ??
      null) as AiSettingInsert["default_value"],
    ui: formData.ui as AiSettingInsert["ui"],
    description: formData.description.trim() || null,
    visibility: formData.visibility,
  });

  const handleSave = async (): Promise<AiSetting | null> => {
    setSaveError(null);
    setSaving(true);
    try {
      let saved: AiSetting;
      if (isNew) {
        const organization_id = await resolveSystemOrgId();
        const payload: AiSettingInsert = {
          ...buildPayload(),
          organization_id,
        };
        saved = await aiModelService.createSetting(payload);
      } else if (setting) {
        const payload: AiSettingUpdate = buildPayload();
        saved = await aiModelService.updateSetting(setting.id, payload);
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
      console.error("Save setting failed:", msg, err);
      return null;
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAndClose = async () => {
    const saved = await handleSave();
    if (saved) onClose();
  };

  const handleDelete = async () => {
    if (!setting) return;
    try {
      await aiModelService.deleteSetting(setting.id);
      onDeleted(setting.id);
    } catch (err) {
      console.error("Delete setting failed", err);
      setSaveError(extractErrorMessage(err));
    }
  };

  const canSave =
    formData.key.trim().length > 0 &&
    formData.value_type.trim().length > 0 &&
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
            <span className="text-sm font-semibold truncate font-mono">
              {displayName}
            </span>
            {isNew && (
              <Badge
                variant="outline"
                className="text-xs bg-blue-50 dark:bg-blue-900/20 text-blue-600 shrink-0"
              >
                New
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
          <SettingForm
            data={formData}
            isNew={isNew}
            isSystem={isSystem}
            saving={saving}
            isDirty={isDirty}
            onChange={setFormData}
            onDelete={!isNew ? handleDelete : undefined}
          />
        </div>

        {/* Persistent footer */}
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

export default function SettingsContainer() {
  const [settings, setSettings] = useState<AiSetting[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedSetting, setSelectedSetting] = useState<AiSetting | null>(
    null,
  );
  const [isNewSetting, setIsNewSetting] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const fetched = await aiModelService.fetchSettings();
      setSettings(fetched);
    } catch (err) {
      console.error("Failed to load AI settings", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openSetting = (setting: AiSetting) => {
    setSelectedSetting(setting);
    setIsNewSetting(false);
    setPanelOpen(true);
  };

  const openNew = () => {
    setSelectedSetting(null);
    setIsNewSetting(true);
    setPanelOpen(true);
  };

  const closePanel = () => {
    setPanelOpen(false);
    setSelectedSetting(null);
    setIsNewSetting(false);
  };

  const handleSaved = (saved: AiSetting) => {
    setSettings((prev) => {
      const idx = prev.findIndex((s) => s.id === saved.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = saved;
        return next;
      }
      return [...prev, saved].sort((a, b) => a.key.localeCompare(b.key));
    });
    setSelectedSetting(saved);
    setIsNewSetting(false);
  };

  const handleDeleted = (id: string) => {
    setSettings((prev) => prev.filter((s) => s.id !== id));
    if (selectedSetting?.id === id) closePanel();
  };

  /** Row-level delete from the table (outside the detail panel) — the
   *  detail panel's own delete flow already calls the service itself
   *  before invoking `onDeleted`, so this is only for table rows. */
  const handleRowDelete = async (setting: AiSetting) => {
    try {
      await aiModelService.deleteSetting(setting.id);
      handleDeleted(setting.id);
    } catch (err) {
      console.error("Failed to delete setting", err);
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Page header */}
      <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b bg-card">
        <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
        <div className="min-w-0">
          <span className="text-sm font-semibold">Settings Vocabulary</span>
          <span className="ml-2 text-xs text-muted-foreground">
            Canonical control settings (temperature, reasoning_effort, top_p,
            …) that models and offerings reference.
          </span>
        </div>
      </div>

      {/* Table + optional detail panel */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <div
          className={`${panelOpen ? "w-1/2" : "w-full"} min-w-0 flex flex-col transition-all duration-200 overflow-hidden`}
        >
          <SettingTable
            settings={settings}
            isLoading={isLoading}
            selectedId={selectedSetting?.id ?? null}
            onSelect={openSetting}
            onEdit={openSetting}
            onDelete={handleRowDelete}
            onCreate={openNew}
          />
        </div>

        {panelOpen && (
          <div className="w-1/2 border-l-2 border-l-primary/20 shrink-0 flex flex-col overflow-hidden">
            <SettingDetailPanel
              setting={selectedSetting}
              isNew={isNewSetting}
              onClose={closePanel}
              onSaved={handleSaved}
              onDeleted={handleDeleted}
            />
          </div>
        )}
      </div>
    </div>
  );
}
