"use client";

import React, { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Save,
  AlertTriangle,
  Rocket,
  FileText,
  Eye,
  Columns2,
  ExternalLink,
  ArrowRight,
  Check,
  X,
  Copy,
  RotateCcw,
  GitCompareArrows,
} from "lucide-react";
import { Button } from "@/components/ui/ButtonMine";
import { Badge } from "@/components/ui/badge";
import * as SliderPrimitive from "@radix-ui/react-slider";
import IconButton from "@/components/official/IconButton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogContentPrimitive,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import {
  NoteEditorCore,
  type EditorMode,
} from "@/features/notes/components/NoteEditorCore";
import { useOpenDiffViewerWindow } from "@/features/overlays/openers/diffViewerWindow";
import { ScopeContextTargetPicker } from "@/features/scopes/components/quick-assign/ScopeContextTargetPicker";
import { scopeHref } from "@/features/scope-system/utils/scopeRoutes";
import { useSetContextValue } from "./useSetContextValue";

export type PostSaveAction = "newTab" | "navigate" | "none";

export interface SetContextValueCoreProps {
  initialContent: string;
  /** Compact footprint (popover). */
  compact?: boolean;
  showPostSaveActions?: boolean;
  initialEditorMode?: EditorMode;
  onSaved?: (scopeId: string, action: PostSaveAction) => void;
  onCancel?: () => void;
  className?: string;
}

const VIEW_MODES: Array<{
  value: EditorMode;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { value: "plain", label: "Edit only", icon: FileText },
  { value: "split", label: "Split view", icon: Columns2 },
  { value: "preview", label: "Preview only", icon: Eye },
];

// Z-index above WindowPanel (runtime z-index ~1000+)
const ALERT_Z = "z-[2147483600]";

export function SetContextValueCore({
  initialContent,
  compact = false,
  showPostSaveActions = true,
  initialEditorMode = "split",
  onSaved,
  onCancel,
  className,
}: SetContextValueCoreProps) {
  const safeInitialContent =
    typeof initialContent === "string" ? initialContent : "";
  const router = useRouter();

  const {
    workingContent,
    setEditedContent,
    stripThinkingEnabled,
    setStripThinkingEnabled,
    canStripThinking,
    trimStart,
    setTrimStart,
    trimEnd,
    setTrimEnd,
    maxTrim,
    target,
    setTarget,
    pickedItem,
    hasExistingValue,
    currentRow,
    updateMethod,
    setUpdateMethod,
    isSaving,
    isSaveDisabled,
    savedScopeId,
    save,
  } = useSetContextValue({ initialContent: safeInitialContent });

  const [editorMode, setEditorMode] = useState<EditorMode>(initialEditorMode);
  const [showOverwriteWarning, setShowOverwriteWarning] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const openDiff = useOpenDiffViewerWindow();

  const handlePreviewOverwrite = useCallback(() => {
    openDiff({
      original: currentRow?.value_text ?? "",
      modified: workingContent,
      originalLabel: pickedItem?.display_name ?? "Current value",
      modifiedLabel: "Incoming",
      title: "Preview overwrite",
      engine: "light",
      defaultView: "split",
    });
  }, [openDiff, currentRow, workingContent, pickedItem]);

  const handleSaveClick = useCallback(async () => {
    if (hasExistingValue && updateMethod === "overwrite") {
      setShowOverwriteWarning(true);
      return;
    }
    const ok = await save();
    if (ok && target.scopeId) onSaved?.(target.scopeId, "none");
  }, [hasExistingValue, updateMethod, save, onSaved, target.scopeId]);

  const handleOverwriteConfirm = useCallback(async () => {
    setShowOverwriteWarning(false);
    const ok = await save();
    if (ok && target.scopeId) onSaved?.(target.scopeId, "none");
  }, [save, onSaved, target.scopeId]);

  const handleCopy = useCallback(() => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(workingContent).catch(() => {});
    }
  }, [workingContent]);

  const handleResetTrim = useCallback(() => {
    setTrimStart(0);
    setTrimEnd(0);
  }, [setTrimStart, setTrimEnd]);

  const handlePostSaveAction = useCallback(
    (action: PostSaveAction) => {
      if (!savedScopeId || !target.orgId) return;
      const href = scopeHref(
        target.orgId,
        { id: target.scopeTypeId ?? "" },
        { id: savedScopeId },
      );
      if (action === "newTab") {
        window.open(href, "_blank", "noopener,noreferrer");
      } else if (action === "navigate") {
        router.push(href);
      }
      onSaved?.(savedScopeId, action);
    },
    [savedScopeId, target.orgId, target.scopeTypeId, router, onSaved],
  );

  const rawLen = safeInitialContent.length;
  const charCount = workingContent.length;
  const trimMax = Math.max(0, maxTrim);

  return (
    <TooltipProvider delayDuration={200}>
      <div
        className={cn(
          "flex flex-col min-h-0 h-full",
          compact ? "gap-1.5" : "gap-2",
          className,
        )}
      >
        {/* Post-save banner */}
        {savedScopeId && (
          <div className="shrink-0 flex items-center gap-2 rounded-md border border-green-500/30 bg-green-500/10 px-3 py-1.5 text-xs">
            <Check className="h-3.5 w-3.5 text-green-600" />
            <span className="font-medium">
              Saved to{" "}
              <span className="font-semibold">
                {pickedItem?.display_name ?? "context item"}
              </span>
            </span>
            <span className="text-muted-foreground">
              · {workingContent.length.toLocaleString()} chars
            </span>
          </div>
        )}

        {/* Toolbar */}
        {!savedScopeId && (
          <div className="flex items-center gap-1.5 flex-wrap shrink-0">
            <div className="inline-flex items-center gap-0.5 rounded-md border border-border bg-background p-0.5 h-8">
              {VIEW_MODES.map((m) => {
                const Icon = m.icon;
                const active = editorMode === m.value;
                return (
                  <Tooltip key={m.value}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => setEditorMode(m.value)}
                        className={cn(
                          "h-7 w-7 inline-flex items-center justify-center rounded-md transition-colors",
                          active
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:bg-accent hover:text-foreground",
                        )}
                        aria-label={m.label}
                        aria-pressed={active}
                      >
                        <Icon className="h-3.5 w-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="z-[9999]">
                      {m.label}
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>

            <IconButton
              icon={Rocket}
              size="md"
              variant={stripThinkingEnabled ? "default" : "outline"}
              onClick={() => setStripThinkingEnabled((v) => !v)}
              disabled={!canStripThinking}
              tooltip={
                canStripThinking
                  ? stripThinkingEnabled
                    ? "Restore <thinking> / <reasoning> blocks"
                    : "Remove <thinking> and <reasoning> blocks"
                  : "No <thinking> or <reasoning> tags detected"
              }
              className="rounded-md"
            />

            <IconButton
              icon={Copy}
              size="md"
              variant="outline"
              onClick={handleCopy}
              disabled={!workingContent}
              tooltip="Copy current content to clipboard"
              className="rounded-md"
            />

            <IconButton
              icon={RotateCcw}
              size="md"
              variant="outline"
              onClick={handleResetTrim}
              disabled={trimStart === 0 && trimEnd === 0}
              tooltip="Reset trim sliders to 0"
              className="rounded-md"
            />

            <div className="ml-auto flex items-center gap-2">
              <Badge
                variant="secondary"
                className="text-[10px] font-mono rounded-md"
              >
                {charCount.toLocaleString()} chars
                {charCount !== rawLen && (
                  <span className="ml-1 text-muted-foreground">
                    / {rawLen.toLocaleString()}
                  </span>
                )}
              </Badge>
            </div>
          </div>
        )}

        {!savedScopeId && (
          <TrimRow
            label="Trim start"
            max={Math.max(0, trimMax - trimEnd)}
            value={trimStart}
            onChange={setTrimStart}
            tooltip="Drag to trim characters from the start of the content"
          />
        )}

        <div className="flex-1 min-h-0 flex flex-col border border-border rounded-md overflow-hidden bg-background">
          <NoteEditorCore
            content={workingContent}
            onChange={setEditedContent}
            onChangeFlush={setEditedContent}
            editorMode={savedScopeId ? "preview" : editorMode}
            textareaRef={textareaRef}
            placeholder="Enter the content to save…"
            className="flex-1 min-h-0"
            resetKey={`${stripThinkingEnabled}:${trimStart}:${trimEnd}:${savedScopeId ?? "draft"}`}
          />
        </div>

        {!savedScopeId && (
          <TrimRow
            label="Trim end"
            max={Math.max(0, trimMax - trimStart)}
            value={trimEnd}
            onChange={setTrimEnd}
            tooltip="Drag to trim characters from the end of the content"
          />
        )}

        {/* Target row */}
        {!savedScopeId && (
          <div className="shrink-0 flex flex-col gap-2">
            <ScopeContextTargetPicker value={target} onChange={setTarget} />

            {target.contextItemId && (
              <div className="grid gap-1">
                <Label className="text-xs">Update Method</Label>
                {hasExistingValue ? (
                  <RadioGroup
                    value={updateMethod}
                    onValueChange={(v) =>
                      setUpdateMethod(v as "append" | "overwrite")
                    }
                    className="flex flex-wrap gap-4"
                  >
                    <div className="flex items-center gap-1.5">
                      <RadioGroupItem value="append" id="scv-append" />
                      <Label
                        htmlFor="scv-append"
                        className="cursor-pointer font-normal text-xs"
                      >
                        Append
                      </Label>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <RadioGroupItem value="overwrite" id="scv-overwrite" />
                      <Label
                        htmlFor="scv-overwrite"
                        className="cursor-pointer font-normal text-xs flex items-center gap-1.5"
                      >
                        Overwrite
                        {updateMethod === "overwrite" && (
                          <Badge
                            variant="destructive"
                            className="text-[10px] h-4 rounded-md"
                          >
                            <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
                            Warning
                          </Badge>
                        )}
                      </Label>
                    </div>
                  </RadioGroup>
                ) : (
                  <p className="text-[11px] text-muted-foreground">
                    {pickedItem?.display_name ?? "This item"} is currently empty
                    — this will set its initial value.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="shrink-0 flex items-center justify-end gap-2 pt-1 pb-safe">
          {savedScopeId && showPostSaveActions ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handlePostSaveAction("newTab")}
                className="h-8 text-xs gap-1.5 rounded-md"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">New tab</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handlePostSaveAction("navigate")}
                className="h-8 text-xs gap-1.5 rounded-md"
              >
                <ArrowRight className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Go to scope</span>
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => handlePostSaveAction("none")}
                className="h-8 text-xs rounded-md"
              >
                Done
              </Button>
            </>
          ) : (
            <>
              {onCancel && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onCancel}
                  disabled={isSaving}
                  className="h-8 text-xs gap-1.5 rounded-md"
                >
                  <X className="h-3.5 w-3.5" />
                  Cancel
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                onClick={handleSaveClick}
                disabled={isSaveDisabled}
                className="h-8 text-xs gap-1.5 rounded-md"
              >
                <Save className="h-3.5 w-3.5" />
                {isSaving
                  ? "Saving…"
                  : hasExistingValue
                    ? updateMethod === "append"
                      ? "Append"
                      : "Overwrite"
                    : "Save Value"}
              </Button>
            </>
          )}
        </div>

        {/* Overwrite confirm — raised above WindowPanel */}
        <AlertDialog
          open={showOverwriteWarning}
          onOpenChange={setShowOverwriteWarning}
        >
          <AlertDialogPortal>
            <AlertDialogOverlay className={cn(ALERT_Z)} />
            <AlertDialogContentPrimitive
              className={cn(
                "fixed left-[50%] top-[50%] grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 matrx-glass-core p-6 duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 sm:rounded-lg",
                ALERT_Z,
              )}
            >
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                  Confirm Overwrite
                </AlertDialogTitle>
                <AlertDialogDescription>
                  You are about to replace the current value of{" "}
                  <strong>{pickedItem?.display_name}</strong>. This action
                  cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <Button
                  variant="outline"
                  onClick={handlePreviewOverwrite}
                  className="gap-1.5"
                >
                  <GitCompareArrows className="h-4 w-4" />
                  Preview changes
                </Button>
                <AlertDialogAction
                  onClick={handleOverwriteConfirm}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Overwrite
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContentPrimitive>
          </AlertDialogPortal>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}

interface TrimRowProps {
  label: string;
  max: number;
  value: number;
  onChange: (value: number) => void;
  tooltip?: string;
}

function TrimRow({ label, max, value, onChange, tooltip }: TrimRowProps) {
  const safeMax = Math.max(0, max);
  const clamped = Math.min(value, safeMax);
  const disabled = safeMax === 0;

  const labelEl = (
    <span
      className={cn(
        "text-xs shrink-0 w-20 tabular-nums select-none font-medium",
        disabled ? "text-muted-foreground/60" : "text-foreground",
      )}
    >
      {label}
    </span>
  );

  return (
    <div className="flex items-center gap-3 shrink-0 w-full min-w-0 h-8">
      {tooltip ? (
        <Tooltip>
          <TooltipTrigger asChild>{labelEl}</TooltipTrigger>
          <TooltipContent side="top" className="z-[9999]">
            {tooltip}
          </TooltipContent>
        </Tooltip>
      ) : (
        labelEl
      )}

      <SliderPrimitive.Root
        min={0}
        max={safeMax || 1}
        step={1}
        value={[clamped]}
        onValueChange={(vals) => onChange(vals[0] ?? 0)}
        disabled={disabled}
        className={cn(
          "relative flex items-center select-none touch-none flex-1 min-w-0 h-5 cursor-pointer",
          disabled && "opacity-50 cursor-not-allowed",
        )}
      >
        <SliderPrimitive.Track className="relative grow h-2 rounded-full bg-neutral-200 dark:bg-neutral-800 border border-border overflow-hidden">
          <SliderPrimitive.Range className="absolute h-full bg-primary" />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb
          className="block h-4 w-4 rounded-full bg-primary border-2 border-background shadow-md transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:pointer-events-none cursor-grab active:cursor-grabbing active:scale-110"
          aria-label={label}
        />
      </SliderPrimitive.Root>

      <input
        type="number"
        min={0}
        max={safeMax}
        value={clamped}
        onChange={(e) => {
          const n = Number(e.target.value) || 0;
          onChange(Math.max(0, Math.min(n, safeMax)));
        }}
        disabled={disabled}
        className={cn(
          "h-7 w-20 shrink-0 rounded-md border border-border bg-background px-2 text-xs tabular-nums",
          "text-foreground placeholder:text-muted-foreground",
          "focus:outline-none focus:ring-2 focus:ring-ring",
          "disabled:opacity-50 disabled:cursor-not-allowed",
        )}
      />
      <span
        className={cn(
          "text-[10px] tabular-nums shrink-0 w-14 text-right",
          disabled ? "text-muted-foreground/60" : "text-muted-foreground",
        )}
      >
        / {safeMax.toLocaleString()}
      </span>
    </div>
  );
}

export default SetContextValueCore;
