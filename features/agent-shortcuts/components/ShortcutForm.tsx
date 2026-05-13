"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
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
  AlertCircle,
  Copy,
  HelpCircle,
  Loader2,
  Save,
  Trash2,
  X,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import IconInputWithValidation from "@/components/official/icons/IconInputWithValidation.dynamic";
import { AgentListDropdown } from "@/features/agents/components/agent-listings/AgentListDropdown";
import { AgentVersionPicker } from "./AgentVersionPicker";
import { ScopeMappingEditor } from "./ScopeMappingEditor";
import type { AgentVariableDefinition } from "./ScopeMappingEditor";
import { ContextSlotMappingEditor } from "./ContextSlotMappingEditor";
import { DefaultVariableValuesEditor } from "./DefaultVariableValuesEditor";
import { DefaultContextSlotValuesEditor } from "./DefaultContextSlotValuesEditor";
import { ShortcutScopePicker } from "./ShortcutScopePicker";
import { ShortcutContextsPicker } from "./ShortcutContextsPicker";
import { CategorySelect } from "./CategorySelect";
import { useAgentShortcutCrud } from "../hooks/useAgentShortcutCrud";
import { RESULT_DISPLAY_OPTIONS } from "../constants";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectAgentById } from "@/features/agents/redux/agent-definition/selectors";
import { fetchAgentExecutionMinimal } from "@/features/agents/redux/agent-definition/thunks";
import type { VariableDefinition } from "@/features/agents/types/agent-definition.types";
import type { ContextSlot } from "@/features/agents/types/agent-api-types";
import type {
  AgentScope,
  AgentShortcut,
  AgentShortcutCategory,
  ScopeProps,
  ShortcutFormData,
} from "../types";

function extractErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object") {
    const e = err as Record<string, unknown>;
    const parts: string[] = [];
    if (typeof e.message === "string" && e.message) parts.push(e.message);
    if (typeof e.details === "string" && e.details)
      parts.push(`Details: ${e.details}`);
    if (typeof e.hint === "string" && e.hint) parts.push(`Hint: ${e.hint}`);
    if (typeof e.code === "string" && e.code) parts.push(`(code: ${e.code})`);
    if (parts.length > 0) return parts.join(" — ");
  }
  return fallback;
}

export interface ShortcutFormProps extends ScopeProps {
  /**
   * Rendering mode.
   * - `"dialog"` (default): wraps the form in a Dialog (desktop) / Drawer (mobile).
   * - `"inline"`: renders the form body and footer inline as a full-page editor.
   *   In this mode `isOpen` is ignored and the form is always mounted.
   */
  variant?: "dialog" | "inline";
  /**
   * Only required for `variant="dialog"`. Ignored when `variant="inline"`.
   */
  isOpen?: boolean;
  onClose: () => void;
  onSuccess?: (id: string | null) => void;
  shortcut?: AgentShortcut | null;
  categories: AgentShortcutCategory[];
  variableDefinitions?: AgentVariableDefinition[];
  allowScopeEdit?: boolean;
  onScopeChange?: (scope: AgentScope, scopeId?: string) => void;
  onDuplicate?: (shortcut: AgentShortcut) => void;
  /**
   * Only used in `variant="inline"`. Pre-fills fields on the initial (create)
   * form render. Ignored when editing an existing shortcut.
   */
  initialValues?: Partial<ShortcutFormData>;
}

// ─────────────────────────────────────────────────────────────────────────
// Section helpers — keep the form body readable when there are 12+ fields.
// ─────────────────────────────────────────────────────────────────────────

/**
 * Inline help tooltip: a tiny `?` icon next to a label that reveals the
 * explanatory copy on hover. Replaces the multi-line paragraphs that used to
 * sit under every field and turn the form into a wall of text.
 */
function HelpTooltip({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="Help"
            className="inline-flex items-center justify-center h-4 w-4 rounded-full text-muted-foreground/70 hover:text-foreground transition-colors"
          >
            <HelpCircle className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs">
          {children}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** Label + inline HelpTooltip. Used for section headers that previously had
 *  a paragraph of explanatory copy underneath them. */
function LabelWithHelp({
  children,
  help,
  className = "text-sm",
}: {
  children: React.ReactNode;
  help: React.ReactNode;
  className?: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Label className={className}>{children}</Label>
      <HelpTooltip>{help}</HelpTooltip>
    </div>
  );
}

function ToggleRow({
  id,
  label,
  help,
  checked,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  help?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-2 px-3 py-2 border border-border rounded-md bg-muted/30">
      <div className="min-w-0 flex-1">
        <Label htmlFor={id} className="text-xs font-normal cursor-pointer">
          {label}
        </Label>
        {help && (
          <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
            {help}
          </p>
        )}
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
      />
    </div>
  );
}

function JsonEditorRow({
  id,
  label,
  help,
  value,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  help?: string;
  value: Record<string, unknown> | null;
  onChange: (next: Record<string, unknown> | null) => void;
  disabled?: boolean;
}) {
  const [text, setText] = useState(() =>
    value ? JSON.stringify(value, null, 2) : "",
  );
  const [parseError, setParseError] = useState<string | null>(null);

  // Sync external value changes (e.g. shortcut reload) back into the textarea.
  useEffect(() => {
    setText(value ? JSON.stringify(value, null, 2) : "");
    setParseError(null);
  }, [value]);

  const handleBlur = () => {
    const trimmed = text.trim();
    if (trimmed === "") {
      onChange(null);
      setParseError(null);
      return;
    }
    try {
      const parsed = JSON.parse(trimmed);
      if (
        parsed === null ||
        typeof parsed !== "object" ||
        Array.isArray(parsed)
      ) {
        setParseError('Must be a JSON object (e.g. { "key": "value" })');
        return;
      }
      setParseError(null);
      onChange(parsed as Record<string, unknown>);
    } catch (e) {
      setParseError(e instanceof Error ? e.message : "Invalid JSON");
    }
  };

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Textarea
        id={id}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={handleBlur}
        rows={3}
        placeholder="{}"
        spellCheck={false}
        disabled={disabled}
        className="text-[12px] font-mono"
      />
      {help && <p className="text-[10px] text-muted-foreground">{help}</p>}
      {parseError && (
        <p className="text-[10px] text-destructive">{parseError}</p>
      )}
    </div>
  );
}

function emptyFormData(): ShortcutFormData {
  return {
    categoryId: "",
    label: "",
    description: null,
    iconName: "Frown",
    keyboardShortcut: null,
    sortOrder: 0,
    agentId: null,
    agentVersionId: null,
    useLatest: false,
    resolvedId: null,
    isVersion: false,
    agentName: null,
    variableDefinitions: [],
    contextSlots: [],
    enabledFeatures: [],
    scopeMappings: null,
    contextMappings: null,
    // AgentExecutionConfig bundle (matches DEFAULT_AGENT_EXECUTION_CONFIG)
    displayMode: "modal-full",
    showVariablePanel: false,
    variablesPanelStyle: "inline",
    autoRun: true,
    allowChat: true,
    showDefinitionMessages: false,
    showDefinitionMessageContent: false,
    hideReasoning: false,
    hideToolResults: false,
    responseDensity: "comfortable",
    showPreExecutionGate: false,
    preExecutionMessage: null,
    bypassGateSeconds: 3,
    defaultUserInput: null,
    defaultVariables: null,
    contextOverrides: null,
    llmOverrides: null,
    jsonExtraction: null,
    isActive: true,
    userId: null,
    organizationId: null,
    projectId: null,
    taskId: null,
  };
}

function fromShortcut(shortcut: AgentShortcut): ShortcutFormData {
  const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = shortcut;
  return rest;
}

export function ShortcutForm({
  scope,
  scopeId,
  variant = "dialog",
  isOpen,
  onClose,
  onSuccess,
  shortcut,
  categories,
  variableDefinitions: variableDefinitionsProp = [],
  allowScopeEdit = false,
  onScopeChange,
  onDuplicate,
  initialValues,
}: ShortcutFormProps) {
  const isMobile = useIsMobile();
  const isInline = variant === "inline";
  // Inline editor is always "open" — the parent route controls its lifecycle.
  const open = isInline ? true : !!isOpen;
  const isEditing = !!shortcut;
  const crud = useAgentShortcutCrud({ scope, scopeId });
  const { toast } = useToast();
  const dispatch = useAppDispatch();

  const [formData, setFormData] = useState<ShortcutFormData>(() => {
    if (shortcut) return fromShortcut(shortcut);
    return { ...emptyFormData(), ...(initialValues ?? {}) };
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // ── Load the agent's variable definitions + context slots from Redux ────
  // When the selected agent changes, fetch its minimal execution payload so
  // the mapping + default editors below can render real dropdowns / rows.
  const selectedAgentId = formData.agentId;
  const agentRecord = useAppSelector((state) =>
    selectedAgentId ? selectAgentById(state, selectedAgentId) : undefined,
  );
  useEffect(() => {
    if (!open) return;
    if (!selectedAgentId) return;
    dispatch(fetchAgentExecutionMinimal(selectedAgentId));
  }, [open, selectedAgentId, dispatch]);

  const variableDefinitions: VariableDefinition[] = useMemo(() => {
    if (agentRecord?.variableDefinitions) {
      return agentRecord.variableDefinitions;
    }
    // Fallback to the prop form (external callers may still pass their own).
    return (variableDefinitionsProp as VariableDefinition[]) ?? [];
  }, [agentRecord?.variableDefinitions, variableDefinitionsProp]);

  const contextSlots: ContextSlot[] = useMemo(
    () => agentRecord?.contextSlots ?? [],
    [agentRecord?.contextSlots],
  );

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (shortcut) {
      setFormData(fromShortcut(shortcut));
    } else {
      setFormData({
        ...emptyFormData(),
        categoryId: categories[0]?.id ?? "",
        ...(initialValues ?? {}),
      });
    }
    // `initialValues` is intentionally omitted — it should only seed on mount
    // or when switching between edit/create targets.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, shortcut, categories]);

  const handleChange = <K extends keyof ShortcutFormData>(
    field: K,
    value: ShortcutFormData[K],
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!formData.label.trim()) {
      setError("Label is required");
      return;
    }
    if (!formData.categoryId) {
      setError("Category is required");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      if (isEditing && shortcut) {
        await crud.updateShortcut(shortcut.id, formData);
        toast({ title: "Success", description: "Shortcut updated" });
        onSuccess?.(shortcut.id);
      } else {
        const newId = await crud.createShortcut(formData);
        toast({ title: "Success", description: "Shortcut created" });
        onSuccess?.(newId);
      }
      onClose();
    } catch (err) {
      const message = extractErrorMessage(err, "Failed to save shortcut");
      setError(message);
      toast({
        title: "Save failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!shortcut) return;
    setDeleting(true);
    try {
      await crud.deleteShortcut(shortcut.id);
      toast({ title: "Success", description: "Shortcut deleted" });
      setShowDeleteConfirm(false);
      onSuccess?.(null);
      onClose();
    } catch (err) {
      const message = extractErrorMessage(err, "Failed to delete shortcut");
      toast({
        title: "Delete failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  const body = (
    <div className="space-y-4">
      {allowScopeEdit && onScopeChange && (
        <>
          <ShortcutScopePicker
            scope={scope}
            scopeId={scopeId}
            onScopeChange={onScopeChange}
            disabled={saving}
          />
          <Separator />
        </>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="shortcut-label" className="text-sm">
            Label <span className="text-destructive">*</span>
          </Label>
          <Input
            id="shortcut-label"
            value={formData.label}
            onChange={(e) => handleChange("label", e.target.value)}
            placeholder="Shortcut name"
            className="h-9 text-[16px]"
            disabled={saving}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="shortcut-category" className="text-sm">
            Category <span className="text-destructive">*</span>
          </Label>
          <CategorySelect
            id="shortcut-category"
            categories={categories}
            value={formData.categoryId}
            onValueChange={(value) => handleChange("categoryId", value)}
            placeholder="Select category..."
            className="h-9"
            disabled={saving}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="keyboard-shortcut" className="text-sm">
            Keyboard Shortcut
          </Label>
          <Input
            id="keyboard-shortcut"
            value={formData.keyboardShortcut ?? ""}
            onChange={(e) =>
              handleChange("keyboardShortcut", e.target.value || null)
            }
            placeholder="Ctrl+Shift+K"
            className="h-9 text-[16px]"
            disabled={saving}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sort-order" className="text-sm">
            Sort Order
          </Label>
          <Input
            id="sort-order"
            type="number"
            value={formData.sortOrder}
            onChange={(e) =>
              handleChange("sortOrder", parseInt(e.target.value, 10) || 0)
            }
            className="h-9 text-[16px]"
            disabled={saving}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="shortcut-description" className="text-sm">
          Description
        </Label>
        <Textarea
          id="shortcut-description"
          value={formData.description ?? ""}
          onChange={(e) => handleChange("description", e.target.value || null)}
          placeholder="Optional description"
          rows={3}
          className="resize-none text-[16px]"
          disabled={saving}
        />
      </div>

      <div className="space-y-1.5">
        <LabelWithHelp help="Pick the surfaces this shortcut appears in. Leave empty to show everywhere. When a host sets a feature filter, the shortcut must include that tag (or stay empty) to appear.">
          Enabled features
        </LabelWithHelp>
        <ShortcutContextsPicker
          value={formData.enabledFeatures}
          onChange={(value) => handleChange("enabledFeatures", value)}
          disabled={saving}
        />
      </div>

      <div className="flex items-center justify-between px-3 py-2 border border-border rounded-md bg-muted/30">
        <Label
          htmlFor="is-active"
          className="text-sm font-normal cursor-pointer"
        >
          Active (visible in menus)
        </Label>
        <Switch
          id="is-active"
          checked={formData.isActive}
          onCheckedChange={(checked) => handleChange("isActive", checked)}
          disabled={saving}
        />
      </div>

      <Separator />

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <Label className="text-sm font-semibold">Agent &amp; Version</Label>
          <AgentListDropdown
            onSelect={(id) => {
              if (id === formData.agentId) return;
              handleChange("agentId", id);
              // Drop any pinned version — the picker will auto-pin to the
              // new agent's current version once its history loads.
              handleChange("agentVersionId", null);
            }}
            label={formData.agentId ? "Change agent…" : "Select agent…"}
          />
        </div>
        <AgentVersionPicker
          agentId={formData.agentId}
          agentVersionId={formData.agentVersionId}
          useLatest={formData.useLatest}
          onAgentVersionIdChange={(next) =>
            handleChange("agentVersionId", next)
          }
          onUseLatestChange={(next) => handleChange("useLatest", next)}
          disabled={saving}
        />
      </div>

      <Separator />

      <div className="space-y-2">
        <LabelWithHelp
          className="text-sm font-semibold"
          help={
            <>
              Route a surface-provided scope key (selection, content, file path,
              …) into one of the agent&apos;s{" "}
              <span className="font-mono">{`{{variables}}`}</span>.
            </>
          }
        >
          Scope → Variable Mappings
        </LabelWithHelp>
        <ScopeMappingEditor
          scopeMappings={formData.scopeMappings}
          variableDefinitions={variableDefinitions as AgentVariableDefinition[]}
          onChange={(mappings) => handleChange("scopeMappings", mappings)}
          compact
        />
      </div>

      <div className="space-y-2">
        <LabelWithHelp
          className="text-sm font-semibold"
          help="Same as variable mappings, but routes a scope key into a context slot instead. Takes precedence over default slot values and ad-hoc context at launch."
        >
          Scope → Context Slot Mappings
        </LabelWithHelp>
        <ContextSlotMappingEditor
          contextSlots={contextSlots}
          contextMappings={formData.contextMappings}
          onChange={(v) => handleChange("contextMappings", v)}
          compact
        />
      </div>

      <Separator />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="shortcut-icon" className="text-sm">
            Icon Name
          </Label>
          <IconInputWithValidation
            id="shortcut-icon"
            value={formData.iconName ?? ""}
            onChange={(value) => handleChange("iconName", value || null)}
            placeholder="e.g., Star"
            className="h-9 text-[16px]"
            disabled={saving}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="display-mode" className="text-sm">
            Display Mode
          </Label>
          <Select
            value={formData.displayMode}
            onValueChange={(value) =>
              handleChange(
                "displayMode",
                value as ShortcutFormData["displayMode"],
              )
            }
            disabled={saving}
          >
            <SelectTrigger id="display-mode" className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RESULT_DISPLAY_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ── Execution flow ──────────────────────────────────────── */}
      <div className="space-y-2">
        <Label className="text-sm font-semibold">Execution Flow</Label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <ToggleRow
            id="auto-run"
            label="Auto Run"
            help="Execute immediately without waiting for input."
            checked={formData.autoRun}
            onChange={(v) => handleChange("autoRun", v)}
            disabled={saving}
          />
          <ToggleRow
            id="allow-chat"
            label="Allow Chat"
            help="Let the user send follow-up messages."
            checked={formData.allowChat}
            onChange={(v) => handleChange("allowChat", v)}
            disabled={saving}
          />
        </div>
      </div>

      {/* ── Variable panel ──────────────────────────────────────── */}
      <div className="space-y-2">
        <Label className="text-sm font-semibold">Variable Panel</Label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <ToggleRow
            id="show-variable-panel"
            label="Show panel"
            help="Let the user see and edit variable values before run."
            checked={formData.showVariablePanel}
            onChange={(v) => handleChange("showVariablePanel", v)}
            disabled={saving}
          />
          <div className="space-y-1.5">
            <Label htmlFor="variables-panel-style" className="text-xs">
              Panel Style
            </Label>
            <Select
              value={formData.variablesPanelStyle}
              onValueChange={(value) =>
                handleChange(
                  "variablesPanelStyle",
                  value as ShortcutFormData["variablesPanelStyle"],
                )
              }
              disabled={saving || !formData.showVariablePanel}
            >
              <SelectTrigger id="variables-panel-style" className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["inline", "wizard", "form", "compact", "guided", "cards"].map(
                  (style) => (
                    <SelectItem key={style} value={style}>
                      {style}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* ── Pre-execution gate ──────────────────────────────────── */}
      <div className="space-y-2">
        <Label className="text-sm font-semibold">Pre-Execution Gate</Label>
        <ToggleRow
          id="show-pre-execution-gate"
          label="Show gate"
          help="Pause before executing so the user can add instructions."
          checked={formData.showPreExecutionGate}
          onChange={(v) => handleChange("showPreExecutionGate", v)}
          disabled={saving}
        />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="pre-execution-message" className="text-xs">
              Gate Message
            </Label>
            <Input
              id="pre-execution-message"
              value={formData.preExecutionMessage ?? ""}
              onChange={(e) =>
                handleChange(
                  "preExecutionMessage",
                  e.target.value.length > 0 ? e.target.value : null,
                )
              }
              placeholder="Any special instructions?"
              disabled={saving || !formData.showPreExecutionGate}
              className="h-9 text-[16px]"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bypass-gate-seconds" className="text-xs">
              Auto-bypass (s)
            </Label>
            <Input
              id="bypass-gate-seconds"
              type="number"
              min="0"
              step="1"
              value={formData.bypassGateSeconds}
              onChange={(e) =>
                handleChange(
                  "bypassGateSeconds",
                  Math.max(0, Number.parseInt(e.target.value, 10) || 0),
                )
              }
              disabled={saving || !formData.showPreExecutionGate}
              className="h-9 text-[16px]"
            />
            <p className="text-[10px] text-muted-foreground">
              0 = wait for user
            </p>
          </div>
        </div>
      </div>

      {/* ── Transparency / privacy ──────────────────────────────── */}
      <div className="space-y-2">
        <Label className="text-sm font-semibold">Transparency</Label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <ToggleRow
            id="show-definition-messages"
            label="Show definition messages"
            help="Reveal the agent's pre-written messages to the user."
            checked={formData.showDefinitionMessages}
            onChange={(v) => handleChange("showDefinitionMessages", v)}
            disabled={saving}
          />
          <ToggleRow
            id="show-definition-message-content"
            label="Reveal interpolated content"
            help="Show variable values inside revealed messages."
            checked={formData.showDefinitionMessageContent}
            onChange={(v) => handleChange("showDefinitionMessageContent", v)}
            disabled={saving || !formData.showDefinitionMessages}
          />
          <ToggleRow
            id="hide-reasoning"
            label="Hide reasoning"
            help="Suppress thinking/reasoning blocks in output."
            checked={formData.hideReasoning}
            onChange={(v) => handleChange("hideReasoning", v)}
            disabled={saving}
          />
          <ToggleRow
            id="hide-tool-results"
            label="Hide tool results"
            help="Suppress tool-call result blocks in output."
            checked={formData.hideToolResults}
            onChange={(v) => handleChange("hideToolResults", v)}
            disabled={saving}
          />
        </div>
      </div>

      {/* ── Defaults & overrides ────────────────────────────────── */}
      <div className="space-y-3">
        <Label className="text-sm font-semibold">
          Defaults &amp; Overrides
        </Label>

        <div className="space-y-1.5">
          <Label htmlFor="default-user-input" className="text-xs">
            Default user input{" "}
            <span className="text-muted-foreground font-normal">
              (designer-only, never shown to user)
            </span>
          </Label>
          <Textarea
            id="default-user-input"
            value={formData.defaultUserInput ?? ""}
            onChange={(e) =>
              handleChange(
                "defaultUserInput",
                e.target.value.length > 0 ? e.target.value : null,
              )
            }
            rows={2}
            placeholder="Extra instructions appended to the template…"
            disabled={saving}
            className="text-[16px]"
          />
        </div>

        <div className="space-y-1.5">
          <LabelWithHelp
            className="text-xs"
            help="Agent-defined defaults show as placeholders; your overrides are saved per-shortcut. Scope-mapped values and the user's runtime edits still win."
          >
            Default Variable Values
          </LabelWithHelp>
          <DefaultVariableValuesEditor
            variableDefinitions={variableDefinitions}
            values={formData.defaultVariables}
            onChange={(v) => handleChange("defaultVariables", v)}
            disabled={saving}
            compact
          />
        </div>

        <div className="space-y-1.5">
          <LabelWithHelp
            className="text-xs"
            help="Pre-seed a value for any declared context slot on launch. Scope → Context Slot mappings and runtime context entries still override."
          >
            Default Context Slot Values
          </LabelWithHelp>
          <DefaultContextSlotValuesEditor
            contextSlots={contextSlots}
            values={formData.contextOverrides}
            onChange={(v) => handleChange("contextOverrides", v)}
            disabled={saving}
            compact
          />
        </div>

        <JsonEditorRow
          id="llm-overrides"
          label="LLM Overrides (JSON)"
          help='Partial LLMParams delta — e.g. {"temperature": 0.2}. Only keys provided are sent.'
          value={formData.llmOverrides as Record<string, unknown> | null}
          onChange={(v) =>
            handleChange("llmOverrides", v as ShortcutFormData["llmOverrides"])
          }
          disabled={saving}
        />
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );

  const leftButtons =
    isEditing && shortcut ? (
      <div className="flex gap-2">
        {onDuplicate && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onDuplicate(shortcut)}
            disabled={saving || deleting}
          >
            <Copy className="h-4 w-4 mr-1.5" />
            Duplicate
          </Button>
        )}
        <Button
          variant="destructive"
          size="sm"
          onClick={() => setShowDeleteConfirm(true)}
          disabled={saving || deleting}
        >
          <Trash2 className="h-4 w-4 mr-1.5" />
          Delete
        </Button>
      </div>
    ) : (
      <div />
    );

  const rightButtons = (
    <div className="flex gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={onClose}
        disabled={saving || deleting}
      >
        <X className="h-4 w-4 mr-1.5" />
        Cancel
      </Button>
      <Button
        size="sm"
        onClick={handleSave}
        disabled={saving || deleting || !formData.label || !formData.categoryId}
      >
        {saving ? (
          <>
            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            Saving...
          </>
        ) : (
          <>
            <Save className="h-4 w-4 mr-1.5" />
            {isEditing ? "Save" : "Create"}
          </>
        )}
      </Button>
    </div>
  );

  const footer = (
    <>
      {leftButtons}
      {rightButtons}
    </>
  );

  const deleteConfirm = (
    <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Shortcut</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete &quot;{shortcut?.label}&quot;? This
            cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={deleting}
          >
            {deleting ? "Deleting..." : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  if (isInline) {
    return (
      <>
        <div className="flex flex-col h-full min-h-0 overflow-hidden">
          <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 pt-4 pb-6">
            <div className="mx-auto w-full max-w-3xl">{body}</div>
          </div>
          <div className="shrink-0 border-t border-border bg-card px-4 sm:px-6 py-3">
            <div className="mx-auto w-full max-w-3xl flex items-center justify-between gap-2 flex-col sm:flex-row">
              {footer}
            </div>
          </div>
        </div>
        {deleteConfirm}
      </>
    );
  }

  if (isMobile) {
    return (
      <>
        <Drawer open={open} onOpenChange={(next) => !next && onClose()}>
          <DrawerContent className="max-h-[92dvh] pb-safe">
            <DrawerHeader>
              <DrawerTitle>
                {isEditing ? `Edit "${shortcut?.label}"` : "Create Shortcut"}
              </DrawerTitle>
              <DrawerDescription>
                {isEditing
                  ? "Update shortcut details"
                  : "Wire an agent into the UI at the selected scope"}
              </DrawerDescription>
            </DrawerHeader>
            <div className="px-4 pb-3 overflow-y-auto">{body}</div>
            <DrawerFooter className="flex-col sm:flex-row gap-2 sm:justify-between">
              {footer}
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
        {deleteConfirm}
      </>
    );
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0">
          <DialogHeader className="px-4 pt-4 pb-2 border-b border-border">
            <DialogTitle>
              {isEditing ? `Edit "${shortcut?.label}"` : "Create Shortcut"}
            </DialogTitle>
            <DialogDescription>
              {isEditing
                ? "Update shortcut details"
                : "Wire an agent into the UI at the selected scope"}
            </DialogDescription>
          </DialogHeader>
          <div className="px-4 pt-2 pb-2 overflow-y-auto flex-1">{body}</div>
          <DialogFooter className="px-4 py-3 border-t border-border flex items-center justify-between gap-2">
            {footer}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {deleteConfirm}
    </>
  );
}
