"use client";

import React, { useState } from "react";
import { cn } from "@/lib/utils";
import {
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
} from "lucide-react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectInstanceUIState } from "../instance-ui-state.selectors";
import {
  selectInstanceAgentName,
  selectInstanceTitle,
} from "../instance-ui-state.selectors";
import type {
  InstanceUIState,
  BuilderAdvancedSettings,
} from "@/features/agents/types/instance.types";

// ─── Copy helpers ─────────────────────────────────────────────────────────────

function useCopyText(text: string) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return { copied, copy };
}

// ─── Shared label width ───────────────────────────────────────────────────────
// "showDefinitionMessageContent" is 30 chars — the widest label we have.
// w-52 = 208px gives it comfortable room without being wasteful.
const LABEL_W = "w-52 min-w-[13rem]";

// ─── UUID field ───────────────────────────────────────────────────────────────

function UuidField({ value, label }: { value: string; label: string }) {
  const { copied, copy } = useCopyText(value);
  return (
    <div className="flex items-center gap-3 py-1 border-b border-border/40 last:border-0">
      <span
        className={cn(
          "text-xs text-muted-foreground shrink-0 text-right",
          LABEL_W,
        )}
      >
        {label}
      </span>
      <span className="flex-1 min-w-0 flex items-center gap-1.5">
        <span className="text-[11px] font-mono text-foreground break-all">
          {value}
        </span>
        <button
          type="button"
          onClick={copy}
          className="shrink-0 h-5 w-5 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          title="Copy UUID"
        >
          {copied ? (
            <Check className="h-3 w-3 text-emerald-500" />
          ) : (
            <Copy className="h-3 w-3" />
          )}
        </button>
      </span>
    </div>
  );
}

// ─── Key-value row ────────────────────────────────────────────────────────────

function KVRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-3 py-1 border-b border-border/40 last:border-0">
      <span
        className={cn(
          "text-xs text-muted-foreground shrink-0 text-right",
          LABEL_W,
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          "flex-1 min-w-0 text-sm text-foreground break-all",
          mono && "font-mono text-xs",
        )}
      >
        {value}
      </span>
    </div>
  );
}

// ─── Boolean row ──────────────────────────────────────────────────────────────

function BoolBadge({ value, label }: { value: boolean; label: string }) {
  return (
    <div className="flex items-center gap-3 py-1 border-b border-border/40 last:border-0">
      <span
        className={cn(
          "text-xs text-muted-foreground shrink-0 text-right",
          LABEL_W,
        )}
      >
        {label}
      </span>
      <div className="flex items-center gap-1.5">
        <span
          className={cn(
            "h-2.5 w-2.5 rounded-full shrink-0",
            value ? "bg-emerald-500" : "bg-muted-foreground/30",
          )}
        />
        <span className="text-sm text-foreground">
          {value ? "true" : "false"}
        </span>
      </div>
    </div>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({
  title,
  open,
  onToggle,
  copyValue,
  count,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  copyValue?: string;
  count?: number;
}) {
  const { copied, copy } = useCopyText(copyValue ?? "");
  return (
    // div with role=button avoids nested <button> — copy button lives inside
    <div
      role="button"
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onToggle();
      }}
      className="flex items-center gap-1.5 w-full px-2 py-1.5 text-left hover:bg-accent/40 transition-colors group cursor-pointer select-none"
    >
      {open ? (
        <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
      ) : (
        <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
      )}
      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex-1">
        {title}
      </span>
      {count !== undefined && (
        <span className="text-[11px] text-muted-foreground/60 shrink-0 mr-1">
          {count}
        </span>
      )}
      {copyValue && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            copy();
          }}
          className="opacity-0 group-hover:opacity-100 h-5 w-5 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-all shrink-0"
          title="Copy section as JSON"
        >
          {copied ? (
            <Check className="h-3 w-3 text-emerald-500" />
          ) : (
            <Copy className="h-3 w-3" />
          )}
        </button>
      )}
    </div>
  );
}

// ─── Builder advanced settings section ───────────────────────────────────────

function BuilderSettingsSection({
  settings,
}: {
  settings: BuilderAdvancedSettings;
}) {
  const [open, setOpen] = useState(true);
  const json = JSON.stringify(settings, null, 2);

  return (
    <div className="border border-border rounded-sm overflow-hidden">
      <SectionHeader
        title="Builder Advanced Settings"
        open={open}
        onToggle={() => setOpen((v) => !v)}
        copyValue={json}
      />
      {open && (
        <div className="px-4 pb-2">
          <BoolBadge value={settings.debug} label="debug" />
          <BoolBadge value={settings.store} label="store" />
          <KVRow label="maxIterations" value={String(settings.maxIterations)} />
          <KVRow
            label="maxRetriesPerIteration"
            value={String(settings.maxRetriesPerIteration)}
          />
          <BoolBadge
            value={settings.useStructuredSystemInstruction}
            label="structuredSystemInstr"
          />
          {settings.structuredInstruction != null && (
            <div className="flex items-start gap-3 py-1 border-b border-border/40 last:border-0">
              <span
                className={cn(
                  "text-xs text-muted-foreground shrink-0 text-right pt-1",
                  LABEL_W,
                )}
              >
                structuredInstruction
              </span>
              <pre className="flex-1 min-w-0 text-xs font-mono text-foreground bg-muted/30 rounded px-2 py-1.5 overflow-x-auto">
                {JSON.stringify(settings.structuredInstruction, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Full state JSON viewer ───────────────────────────────────────────────────

function RawJsonSection({ data }: { data: InstanceUIState }) {
  const [open, setOpen] = useState(false);
  const json = JSON.stringify(data, null, 2);
  const { copied, copy } = useCopyText(json);

  return (
    <div className="border border-border rounded-sm overflow-hidden">
      <div className="flex items-center gap-1.5 px-2 py-1.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1.5 flex-1 text-left hover:text-foreground transition-colors"
        >
          {open ? (
            <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
          )}
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Raw JSON
          </span>
        </button>
        <button
          type="button"
          onClick={copy}
          className="h-5 w-5 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0"
          title="Copy full JSON"
        >
          {copied ? (
            <Check className="h-3 w-3 text-emerald-500" />
          ) : (
            <Copy className="h-3 w-3" />
          )}
        </button>
        {open ? (
          <EyeOff className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        ) : (
          <Eye className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        )}
      </div>
      {open && (
        <pre className="text-xs font-mono text-foreground bg-muted/30 px-3 py-2 overflow-x-auto border-t border-border/40">
          {json}
        </pre>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface InstanceUIStateCoreProps {
  conversationId: string;
  className?: string;
}

export function InstanceUIStateCore({
  conversationId,
  className,
}: InstanceUIStateCoreProps) {
  const state = useAppSelector(selectInstanceUIState(conversationId));
  const agentName = useAppSelector(selectInstanceAgentName(conversationId));
  const instanceTitle = useAppSelector(selectInstanceTitle(conversationId));

  const [displayOpen, setDisplayOpen] = useState(true);
  const [visibilityOpen, setVisibilityOpen] = useState(true);
  const [behaviorOpen, setBehaviorOpen] = useState(true);
  const [contentOpen, setContentOpen] = useState(true);

  if (!state) {
    return (
      <div
        className={cn(
          "flex items-center justify-center py-8 text-sm text-muted-foreground",
          className,
        )}
      >
        No instance UI state for this conversation.
      </div>
    );
  }

  const instanceJson = JSON.stringify(state, null, 2);

  return (
    <div className={cn("flex flex-col min-h-0 h-full", className)}>
      {/* Header */}
      <div className="px-3 py-2 border-b border-border shrink-0 flex items-center justify-between gap-2">
        <div className="flex-1 min-w-0">
          {instanceTitle && (
            <p className="text-sm font-medium text-foreground truncate">
              {instanceTitle}
            </p>
          )}
          {agentName && instanceTitle !== agentName && (
            <p className="text-xs text-muted-foreground truncate">
              {agentName}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium border shrink-0",
              state.displayMode === "direct"
                ? "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20"
                : "bg-muted text-muted-foreground border-border",
            )}
          >
            {state.displayMode}
          </span>
          <CopyEntireButton json={instanceJson} />
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="px-4 py-3 space-y-2">
          {/* Identity */}
          <div className="border border-border rounded-sm overflow-hidden">
            <div className="px-2 py-1.5 bg-muted/20">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Identity
              </span>
            </div>
            <div className="px-4 pb-2">
              <UuidField value={state.conversationId} label="conversationId" />
              {state.widgetHandleId && (
                <UuidField
                  value={state.widgetHandleId}
                  label="widgetHandleId"
                />
              )}
              {state.expandedVariableId && (
                <UuidField
                  value={state.expandedVariableId}
                  label="expandedVariableId"
                />
              )}
            </div>
          </div>

          {/* Display & Mode */}
          <div className="border border-border rounded-sm overflow-hidden">
            <SectionHeader
              title="Display & Mode"
              open={displayOpen}
              onToggle={() => setDisplayOpen((v) => !v)}
              copyValue={JSON.stringify(
                {
                  displayMode: state.displayMode,
                  isExpanded: state.isExpanded,
                  variablesPanelStyle: state.variablesPanelStyle,
                  modeState: state.modeState,
                },
                null,
                2,
              )}
            />
            {displayOpen && (
              <div className="px-4 pb-2">
                <KVRow label="displayMode" value={state.displayMode} />
                <BoolBadge value={state.isExpanded} label="isExpanded" />
                <KVRow
                  label="variablesPanelStyle"
                  value={state.variablesPanelStyle}
                />
                {state.modeState && Object.keys(state.modeState).length > 0 && (
                  <div className="flex items-start gap-3 py-1 border-b border-border/40 last:border-0">
                    <span
                      className={cn(
                        "text-xs text-muted-foreground shrink-0 text-right pt-1",
                        LABEL_W,
                      )}
                    >
                      modeState
                    </span>
                    <pre className="flex-1 min-w-0 text-xs font-mono text-foreground bg-muted/30 rounded px-2 py-1.5 overflow-x-auto">
                      {JSON.stringify(state.modeState, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Visibility */}
          <div className="border border-border rounded-sm overflow-hidden">
            <SectionHeader
              title="Visibility"
              open={visibilityOpen}
              onToggle={() => setVisibilityOpen((v) => !v)}
              copyValue={JSON.stringify(
                {
                  showVariablePanel: state.showVariablePanel,
                  showDefinitionMessages: state.showDefinitionMessages,
                  showDefinitionMessageContent:
                    state.showDefinitionMessageContent,
                  hideReasoning: state.hideReasoning,
                  hideToolResults: state.hideToolResults,
                  hiddenMessageCount: state.hiddenMessageCount,
                },
                null,
                2,
              )}
            />
            {visibilityOpen && (
              <div className="px-4 pb-2">
                <BoolBadge
                  value={state.showVariablePanel}
                  label="showVariablePanel"
                />
                <BoolBadge
                  value={state.showDefinitionMessages}
                  label="showDefinitionMessages"
                />
                <BoolBadge
                  value={state.showDefinitionMessageContent}
                  label="showDefinitionMessageContent"
                />
                <BoolBadge value={state.hideReasoning} label="hideReasoning" />
                <BoolBadge
                  value={state.hideToolResults}
                  label="hideToolResults"
                />
                <KVRow
                  label="hiddenMessageCount"
                  value={String(state.hiddenMessageCount)}
                />
              </div>
            )}
          </div>

          {/* Behavior */}
          <div className="border border-border rounded-sm overflow-hidden">
            <SectionHeader
              title="Behavior"
              open={behaviorOpen}
              onToggle={() => setBehaviorOpen((v) => !v)}
              copyValue={JSON.stringify(
                {
                  autoRun: state.autoRun,
                  allowChat: state.allowChat,
                  submitOnEnter: state.submitOnEnter,
                  autoClearConversation: state.autoClearConversation,
                  reuseConversationId: state.reuseConversationId,
                },
                null,
                2,
              )}
            />
            {behaviorOpen && (
              <div className="px-4 pb-2">
                <BoolBadge value={state.autoRun} label="autoRun" />
                <BoolBadge value={state.allowChat} label="allowChat" />
                <BoolBadge value={state.submitOnEnter} label="submitOnEnter" />
                <BoolBadge
                  value={state.autoClearConversation}
                  label="autoClearConversation"
                />
                <BoolBadge
                  value={state.reuseConversationId}
                  label="reuseConversationId"
                />
              </div>
            )}
          </div>

          {/* Pre-execution */}
          <div className="border border-border rounded-sm overflow-hidden">
            <SectionHeader
              title="Pre-Execution"
              open={contentOpen}
              onToggle={() => setContentOpen((v) => !v)}
              copyValue={JSON.stringify(
                {
                  showPreExecutionGate: state.showPreExecutionGate,
                  preExecutionSatisfied: state.preExecutionSatisfied,
                  preExecutionMessage: state.preExecutionMessage,
                },
                null,
                2,
              )}
            />
            {contentOpen && (
              <div className="px-4 pb-2">
                <BoolBadge
                  value={state.showPreExecutionGate}
                  label="showPreExecutionGate"
                />
                <BoolBadge
                  value={state.preExecutionSatisfied}
                  label="preExecutionSatisfied"
                />
                {state.preExecutionMessage != null ? (
                  <KVRow
                    label="preExecutionMessage"
                    value={state.preExecutionMessage}
                  />
                ) : (
                  <KVRow
                    label="preExecutionMessage"
                    value={
                      <span className="text-muted-foreground italic">null</span>
                    }
                  />
                )}
              </div>
            )}
          </div>

          {/* Creator / debug */}
          <div className="border border-border rounded-sm overflow-hidden">
            <div className="px-3 py-1.5 bg-muted/20 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Creator / Debug
              </span>
            </div>
            <div className="px-4 pb-2">
              <BoolBadge value={state.isCreator} label="isCreator" />
              <BoolBadge
                value={state.showCreatorDebug}
                label="showCreatorDebug"
              />
            </div>
          </div>

          {/* Builder advanced settings */}
          {state.builderAdvancedSettings && (
            <BuilderSettingsSection settings={state.builderAdvancedSettings} />
          )}

          {/* JSON extraction */}
          {state.jsonExtraction != null && (
            <div className="border border-border rounded-sm overflow-hidden">
              <div className="px-2 py-1.5 bg-muted/20">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  JSON Extraction
                </span>
              </div>
              <pre className="text-xs font-mono text-foreground bg-muted/30 px-3 py-2 overflow-x-auto">
                {JSON.stringify(state.jsonExtraction, null, 2)}
              </pre>
            </div>
          )}

          {/* Original text */}
          {state.originalText != null && (
            <div className="border border-border rounded-sm overflow-hidden">
              <div className="px-2 py-1.5 bg-muted/20">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Original Text
                </span>
              </div>
              <p className="text-sm text-foreground px-3 py-2">
                {state.originalText}
              </p>
            </div>
          )}

          {/* Raw JSON */}
          <RawJsonSection data={state} />
        </div>
      </div>
    </div>
  );
}

// ─── Copy entire button ───────────────────────────────────────────────────────

function CopyEntireButton({ json }: { json: string }) {
  const { copied, copy } = useCopyText(json);
  return (
    <button
      type="button"
      onClick={copy}
      className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
      title="Copy full state as JSON"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-emerald-500" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </button>
  );
}
