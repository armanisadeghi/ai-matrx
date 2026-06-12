"use client";

/**
 * AgentSettingsModal
 *
 * A full-fidelity modal for editing agent settings — visually identical to
 * the existing ModelSettingsDialog but powered entirely by agentSettingsSlice.
 *
 * Includes:
 *   - Optional confirmation gate (for fine-tuned / sensitive settings)
 *   - Model selector row
 *   - Full LLM parameter grid (checkbox + slider/select/switch)
 *   - Tools section (fetched from DB via slice)
 *   - Variables section
 *   - Optional JSON editor flip
 *   - Conflict dialog auto-mounts when a model switch has conflicts
 */

import { useState } from "react";
import { createPortal } from "react-dom";
import {
  X,
  AlertTriangle,
  ShieldAlert,
  ArrowRight,
  Settings2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AgentSettingsContent } from "./AgentSettingsContent";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectHasPendingSwitch } from "@/lib/redux/slices/agent-settings/selectors";

const DEFAULT_CONFIRMATION_MESSAGE =
  "Changing fine-tuned settings may degrade results and cause application errors. " +
  "Only make changes if you know exactly what you're doing.";

interface AgentSettingsModalProps {
  agentId: string;
  isOpen: boolean;
  onClose: () => void;
  /**
   * When true, shows a warning gate before revealing settings.
   * The user must click "Proceed" to access the settings.
   */
  requireConfirmation?: boolean;
  confirmationMessage?: string;
  showTools?: boolean;
  showVariables?: boolean;
  showParams?: boolean;
  /** Optional content injected into the modal footer (replaces the default Close button). */
  footer?: React.ReactNode;
}

function ModalPortal({
  agentId,
  onClose,
  showTools,
  showVariables,
  showParams,
  requireConfirmation,
  confirmationMessage = DEFAULT_CONFIRMATION_MESSAGE,
  footer,
}: Omit<AgentSettingsModalProps, "isOpen">) {
  const [confirmed, setConfirmed] = useState(false);
  const hasPendingSwitch = useAppSelector((s) =>
    selectHasPendingSwitch(s, agentId),
  );

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
        className="bg-card rounded-lg shadow-xl max-w-xl w-full mx-4 max-h-[85dvh] overflow-hidden flex flex-col border border-border"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ──────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-semibold text-foreground tracking-wide uppercase">
              {showGate ? "Proceed with caution" : "Model Settings"}
            </h2>
            {hasPendingSwitch && !showGate && (
              <Badge
                variant="outline"
                className="text-[10px] h-4 px-1.5 text-amber-500 border-amber-400"
              >
                Model conflict
              </Badge>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 hover:bg-muted"
            onClick={handleClose}
          >
            <X className="w-3 h-3" />
          </Button>
        </div>

        {showGate ? (
          /* ── Confirmation Gate ────────────────────────────────── */
          <>
            <div className="flex-1 overflow-y-auto px-6 py-6 flex flex-col items-center text-center gap-5">
              <div className="relative flex items-center justify-center">
                <div className="w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                  <ShieldAlert className="w-8 h-8 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center border-2 border-background">
                  <AlertTriangle className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400" />
                </div>
              </div>

              <div className="space-y-1">
                <h3 className="text-base font-semibold text-foreground">
                  Changes may degrade results
                </h3>
              </div>

              <div className="w-full rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-left">
                <p className="text-sm text-amber-900 dark:text-amber-200 leading-relaxed">
                  {confirmationMessage}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-border bg-muted/30 shrink-0">
              <Button
                variant="outline"
                onClick={handleClose}
                size="sm"
                className="h-8 text-xs px-4"
              >
                Exit — keep original settings
              </Button>
              <Button
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
          /* ── Settings Panel ───────────────────────────────────── */
          <>
            <ScrollArea className="flex-1 overflow-auto">
              <div className="px-1 py-1">
                <AgentSettingsContent
                  agentId={agentId}
                  showTools={showTools}
                  showVariables={showVariables}
                  showParams={showParams}
                />
              </div>
            </ScrollArea>

            <div className="flex items-center justify-end gap-2 px-4 py-2.5 border-t border-border bg-muted/30 shrink-0">
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

/**
 * Controlled modal — caller manages open state.
 */
export function AgentSettingsModal({
  isOpen,
  ...rest
}: AgentSettingsModalProps) {
  if (!isOpen) return null;
  return <ModalPortal {...rest} />;
}

/**
 * Self-contained trigger button + modal — no external state needed.
 * Drop this anywhere and it handles its own open/close state.
 */
export function AgentSettingsModalButton({
  agentId,
  label = "Settings",
  requireConfirmation = false,
  confirmationMessage,
  showTools = true,
  showVariables = true,
  showParams = true,
  footer,
}: {
  agentId: string;
  label?: string;
  requireConfirmation?: boolean;
  confirmationMessage?: string;
  showTools?: boolean;
  showVariables?: boolean;
  showParams?: boolean;
  footer?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const hasPendingSwitch = useAppSelector((s) =>
    selectHasPendingSwitch(s, agentId),
  );

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-8 gap-1.5 text-xs"
        onClick={() => setOpen(true)}
      >
        <Settings2 className="w-3.5 h-3.5" />
        {label}
        {hasPendingSwitch && (
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
        )}
      </Button>

      <AgentSettingsModal
        agentId={agentId}
        isOpen={open}
        onClose={() => setOpen(false)}
        requireConfirmation={requireConfirmation}
        confirmationMessage={confirmationMessage}
        showTools={showTools}
        showVariables={showVariables}
        showParams={showParams}
        footer={footer}
      />
    </>
  );
}
