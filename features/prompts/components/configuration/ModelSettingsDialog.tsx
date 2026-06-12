"use client";

import React, { useState } from "react";
import { createPortal } from "react-dom";
import { X, AlertTriangle, ShieldAlert, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ModelSettings } from "./ModelSettings";
import { PromptSettings } from "@/features/prompts/types/core";

interface ModelSettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  modelId: string;
  models: any[];
  settings: PromptSettings;
  onSettingsChange: (settings: PromptSettings) => void;
  availableTools?: any[];
  /** Show a model selector at the top of the settings panel. Default: false */
  showModelSelector?: boolean;
  /** Called when the user selects a new model via the selector. */
  onModelChange?: (modelId: string) => void;
  /**
   * When true, shows a warning gate page before revealing settings.
   * The user must explicitly click "Proceed" to access the settings.
   * Default: false
   */
  requireConfirmation?: boolean;
  /**
   * Custom warning message shown on the gate page.
   * Defaults to a generic fine-tuning warning.
   */
  confirmationMessage?: string;
  /**
   * Custom footer content rendered inside the settings panel footer.
   * When provided, replaces the default "Close" button with this content.
   */
  footer?: React.ReactNode;
}

const DEFAULT_CONFIRMATION_MESSAGE =
  "Changing fine-tuned settings may degrade results and cause application errors. " +
  "Only make changes if you know exactly what you're doing";

export function ModelSettingsDialog({
  isOpen,
  onClose,
  modelId,
  models,
  settings,
  onSettingsChange,
  availableTools = [],
  showModelSelector = false,
  onModelChange,
  requireConfirmation = false,
  confirmationMessage = DEFAULT_CONFIRMATION_MESSAGE,
  footer,
}: ModelSettingsDialogProps) {
  const [confirmed, setConfirmed] = useState(false);

  if (!isOpen) return null;

  const showGate = requireConfirmation && !confirmed;

  const handleClose = () => {
    setConfirmed(false);
    onClose();
  };

  return createPortal(
    <div
      className="fixed inset-0 bg-black/50 dark:bg-black/70 z-50 flex items-center justify-center"
      onClick={handleClose}
    >
      <div
        className="bg-textured rounded-lg shadow-xl max-w-xl w-full mx-4 max-h-[85dvh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
          <h2 className="text-xs font-semibold text-gray-900 dark:text-gray-100 tracking-wide uppercase">
            {showGate ? "Proceed with caution" : "Model Settings"}
          </h2>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 hover:bg-gray-100 dark:hover:bg-gray-800"
            onClick={handleClose}
          >
            <X className="w-3 h-3" />
          </Button>
        </div>

        {showGate ? (
          /* ── Confirmation Gate ──────────────────────────────── */
          <>
            <div className="flex-1 overflow-y-auto px-6 py-6 flex flex-col items-center text-center gap-5">
              {/* Icon cluster */}
              <div className="relative flex items-center justify-center">
                <div className="w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                  <ShieldAlert className="w-8 h-8 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center border-2 border-background">
                  <AlertTriangle className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400" />
                </div>
              </div>

              {/* Heading */}
              <div className="space-y-1">
                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                  changes may degrade results
                </h3>
              </div>

              {/* Warning body */}
              <div className="w-full rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-left">
                <p className="text-sm text-amber-900 dark:text-amber-200 leading-relaxed">
                  {confirmationMessage}
                </p>
              </div>
            </div>

            {/* Gate footer */}
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-border bg-gray-50 dark:bg-gray-900/50">
              <Button
                variant="outline"
                onClick={handleClose}
                size="sm"
                className="h-8 text-xs px-4"
              >
                Exit — keep original settings
              </Button>
              <Button
                variant="default"
                onClick={() => setConfirmed(true)}
                size="sm"
                className="h-8 text-xs px-4 gap-1.5 bg-amber-600 hover:bg-amber-700 text-white border-amber-700"
              >
                I understand — proceed
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </>
        ) : (
          /* ── Settings Panel ─────────────────────────────────── */
          <>
            <div className="overflow-y-auto px-4 py-3">
              <ModelSettings
                modelId={modelId}
                models={models}
                settings={settings}
                onSettingsChange={onSettingsChange}
                availableTools={availableTools}
                showModelSelector={showModelSelector}
                onModelChange={onModelChange}
              />
            </div>

            <div className="flex items-center justify-end gap-2 px-4 py-2.5 border-t border-border bg-gray-50 dark:bg-gray-900/50">
              {footer ?? (
                <Button
                  variant="ghost"
                  onClick={handleClose}
                  size="sm"
                  className="h-7 text-xs"
                >
                  Close
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
