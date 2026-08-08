"use client";

/**
 * RunSettingsEditor
 *
 * Chat Options has two presentations of the same settings: the full Settings
 * tab and Quickset. `RunSettingsQuickControls` is the single stateful control
 * group shared by both. Keep explanatory copy in the reference area of the
 * full editor; the controls themselves stay scan-friendly label/control rows.
 */

import { useState } from "react";
import { Brain, FileText, PanelRight } from "lucide-react";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import { CHAT_CONTEXT_MENU_PROPS } from "@/features/agents/components/chat/agent-context/buildChatContextData";
import { buildRunControlsApplicationScope } from "@/features/agents/components/chat/agent-context/buildChatRunConfiguration";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ProInput } from "@/components/official/ProInput";
import { ProTextarea } from "@/components/official/ProTextarea";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { setPreference } from "@/lib/redux/preferences/userPreferencesSlice";
import type { DirectiveApplyPolicy } from "@/lib/redux/preferences/userPreferencesSlice";
import {
  requestMemoryToggle,
  setBuilderAdvancedSettings,
  setReuseConversationId,
  setUseBlockMode,
  setUseSnapshot,
} from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.slice";
import {
  selectBuilderAdvancedSettings,
  selectIsBlockMode,
  selectIsSnapshot,
  selectReuseConversationId,
} from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import { selectIsSuperAdmin } from "@/lib/redux/slices/userSlice";
import {
  clearApiOverrides,
  selectAiApiVersion,
  selectApiVersion,
  selectPathOverrides,
  setAiApiVersion,
  setApiVersion,
  setPathOverride,
} from "@/lib/redux/slices/apiConfigSlice";
import { ENDPOINTS } from "@/lib/api/endpoints";
import { DEFAULT_BUILDER_ADVANCED_SETTINGS } from "@/features/agents/types/instance.types";
import { parseRequestOverrides } from "@/features/agents/redux/execution-system/utils/request-overrides";
import { SurfaceSimulatorSelect } from "./SurfaceSimulatorSelect";
import { SystemInstructionModal } from "../builder/message-builders/system-instructions/SystemInstructionModal";
import { useOpenSystemInstructionWindow } from "@/features/overlays/openers/systemInstructionWindow";
import { NumberStepper } from "@/components/official-candidate/NumberStepper";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import {
  selectIsMemoryEnabledForConversation,
  selectMemoryDegraded,
} from "@/features/agents/redux/execution-system/observational-memory/observational-memory.selectors";

interface RunSettingsEditorProps {
  conversationId: string;
}

interface SettingsRowProps {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  quickset?: boolean;
}

function SettingsRow({
  id,
  label,
  checked,
  onChange,
  quickset = false,
}: SettingsRowProps) {
  return (
    <label
      htmlFor={id}
      className={cn(
        "min-h-8 cursor-pointer items-center py-0.5",
        // Quickset rows share one label-column width so every control lines
        // up — keep in sync with QuicksetPanel's Row grid.
        quickset
          ? "grid grid-cols-[9rem_minmax(0,1fr)] gap-2"
          : "flex justify-between gap-3",
      )}
    >
      <span className="truncate text-xs text-foreground" title={label}>
        {label}
      </span>
      <span>
        <Switch id={id} checked={checked} onCheckedChange={onChange} />
      </span>
    </label>
  );
}

/** The seven primary settings, rendered identically in Settings and Quickset. */
export function RunSettingsQuickControls({
  conversationId,
  quickset = false,
}: RunSettingsEditorProps & { quickset?: boolean }) {
  const dispatch = useAppDispatch();
  const settings =
    useAppSelector(selectBuilderAdvancedSettings(conversationId)) ??
    DEFAULT_BUILDER_ADVANCED_SETTINGS;
  const isAdmin = useAppSelector(selectIsSuperAdmin);
  const isBlockMode = useAppSelector(selectIsBlockMode);
  const isSnapshot = useAppSelector(selectIsSnapshot);
  const aiApiVersion = useAppSelector(selectAiApiVersion);
  const memoryEnabled = useAppSelector(
    selectIsMemoryEnabledForConversation(conversationId),
  );

  return (
    <div className="space-y-0.5">
      <SurfaceSimulatorSelect
        conversationId={conversationId}
        compact
        quickset={quickset}
      />
      <SettingsRow
        id={`disable-tool-injection-${conversationId}`}
        label="Disable Tool Injection"
        checked={settings.disableToolInjection ?? false}
        quickset={quickset}
        onChange={(value) =>
          dispatch(
            setBuilderAdvancedSettings({
              conversationId,
              changes: { disableToolInjection: value },
            }),
          )
        }
      />
      <SettingsRow
        id={`debug-${conversationId}`}
        label="Debug Mode"
        checked={settings.debug}
        quickset={quickset}
        onChange={(value) =>
          dispatch(
            setBuilderAdvancedSettings({
              conversationId,
              changes: { debug: value },
            }),
          )
        }
      />
      {isAdmin && (
        <>
          <SettingsRow
            id={`block-mode-${conversationId}`}
            label="Block Mode"
            checked={isBlockMode}
            quickset={quickset}
            onChange={(value) => dispatch(setUseBlockMode(value))}
          />
          <SettingsRow
            id={`snapshot-${conversationId}`}
            label="Snapshot Mode"
            checked={isSnapshot}
            quickset={quickset}
            onChange={(value) => dispatch(setUseSnapshot(value))}
          />
          <SettingsRow
            id={`conversation-memory-${conversationId}`}
            label="Conversation Memory"
            checked={memoryEnabled}
            quickset={quickset}
            onChange={(enabled) => dispatch(requestMemoryToggle({ enabled }))}
          />
          <SettingsRow
            id={`ai-api-version-${conversationId}`}
            label="V2 Spine"
            checked={aiApiVersion === "v2"}
            quickset={quickset}
            onChange={(enabled) =>
              dispatch(setAiApiVersion(enabled ? "v2" : "v1"))
            }
          />
        </>
      )}
    </div>
  );
}

export function RunSettingsEditor({ conversationId }: RunSettingsEditorProps) {
  const dispatch = useAppDispatch();
  const settings =
    useAppSelector(selectBuilderAdvancedSettings(conversationId)) ??
    DEFAULT_BUILDER_ADVANCED_SETTINGS;
  const reuseConversationId = useAppSelector(
    selectReuseConversationId(conversationId),
  );
  const isAdmin = useAppSelector(selectIsSuperAdmin);
  const directiveApplyPolicy = useAppSelector(
    (state) => state.userPreferences.assistant.directiveApplyPolicy,
  );
  const apiVersion = useAppSelector(selectApiVersion);
  const pathOverrides = useAppSelector(selectPathOverrides);
  const globalManualOverride = pathOverrides[ENDPOINTS.ai.manual] ?? "";
  const memoryDegraded = useAppSelector(selectMemoryDegraded(conversationId));
  const [sysModalOpen, setSysModalOpen] = useState(false);
  const openSystemInstructionWindow = useOpenSystemInstructionWindow();
  const overridesError = parseRequestOverrides(settings.requestOverrides).error;
  const store = useAppStore();

  // Live chat-surface scope for the Pro fields' agent menu. Plain fn — React
  // Compiler memoizes; reads the store at call time.
  const getApplicationScope = () =>
    buildRunControlsApplicationScope(store.getState(), conversationId);

  const openMemoryInspector = () =>
    dispatch(
      openOverlay({
        overlayId: "observationalMemoryWindow",
        data: { initialSelectedConversationId: conversationId },
      }),
    );

  return (
    <>
      <div className="space-y-4">
        <RunSettingsQuickControls conversationId={conversationId} />

        <Separator />

        <section className="space-y-1.5">
          <h3 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Additional controls
          </h3>
          <SettingsRow
            id={`store-${conversationId}`}
            label="Save to DB"
            checked={settings.store}
            onChange={(value) =>
              dispatch(
                setBuilderAdvancedSettings({
                  conversationId,
                  changes: { store: value },
                }),
              )
            }
          />
          <SettingsRow
            id={`reuse-cid-${conversationId}`}
            label="Reuse Conversation ID"
            checked={reuseConversationId}
            onChange={(value) =>
              dispatch(setReuseConversationId({ conversationId, value }))
            }
          />
          <SettingsRow
            id={`structured-sys-${conversationId}`}
            label="Structured System Prompt"
            checked={settings.useStructuredSystemInstruction}
            onChange={(value) =>
              dispatch(
                setBuilderAdvancedSettings({
                  conversationId,
                  changes: { useStructuredSystemInstruction: value },
                }),
              )
            }
          />
          {settings.useStructuredSystemInstruction && (
            <div className="flex gap-2 pl-0">
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setSysModalOpen(true)}
              >
                <FileText className="mr-1.5 h-3 w-3" /> Edit
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => openSystemInstructionWindow({ conversationId })}
              >
                <PanelRight className="mr-1.5 h-3 w-3" /> Open window
              </Button>
            </div>
          )}
          <div className="flex items-center gap-3 py-1">
            <Label className="flex-1 text-xs text-foreground">Agent actions</Label>
            <Select
              value={directiveApplyPolicy}
              onValueChange={(value) =>
                dispatch(
                  setPreference({
                    module: "assistant",
                    preference: "directiveApplyPolicy",
                    value: value as DirectiveApplyPolicy,
                  }),
                )
              }
            >
              <SelectTrigger className="h-7 w-44 border-0 bg-transparent px-1 text-xs shadow-none dark:bg-transparent">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Ask first</SelectItem>
                <SelectItem value="auto">Apply automatically</SelectItem>
                <SelectItem value="ask">Always ask first</SelectItem>
                <SelectItem value="off">Never apply</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-3 py-1">
            <Label className="flex-1 text-xs text-foreground">Max iterations</Label>
            <NumberStepper
              value={settings.maxIterations}
              onChange={(value) =>
                dispatch(
                  setBuilderAdvancedSettings({
                    conversationId,
                    changes: { maxIterations: value },
                  }),
                )
              }
              min={1}
              max={1000}
              className="h-7"
            />
          </div>
          <div className="flex items-center gap-3 py-1">
            <Label className="flex-1 text-xs text-foreground">Retries / iteration</Label>
            <NumberStepper
              value={settings.maxRetriesPerIteration}
              onChange={(value) =>
                dispatch(
                  setBuilderAdvancedSettings({
                    conversationId,
                    changes: { maxRetriesPerIteration: value },
                  }),
                )
              }
              min={0}
              max={10}
              className="h-7"
            />
          </div>
        </section>

        {isAdmin && (
          <>
            <Separator />
            <section className="space-y-1.5">
              <h3 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Admin controls
              </h3>
              <SettingsRow
                id={`agent-fs-${conversationId}`}
                label="Agent Filesystem"
                checked={settings.agentFs ?? false}
                onChange={(value) =>
                  dispatch(
                    setBuilderAdvancedSettings({
                      conversationId,
                      changes: { agentFs: value },
                    }),
                  )
                }
              />
              <div className="flex items-center gap-3 py-1">
                <Label htmlFor={`manual-route-${conversationId}`} className="w-1/3 text-xs text-foreground">
                  Manual route
                </Label>
                <ProInput
                  id={`manual-route-${conversationId}`}
                  value={settings.manualEndpointOverride ?? ""}
                  onChange={(event) =>
                    dispatch(
                      setBuilderAdvancedSettings({
                        conversationId,
                        changes: { manualEndpointOverride: event.target.value || null },
                      }),
                    )
                  }
                  placeholder={ENDPOINTS.ai.manual}
                  spellCheck={false}
                  enableVoice={false}
                  wrapperClassName="flex-1"
                  className="h-7 font-mono"
                />
              </div>
              <div className="flex items-center gap-3 py-1">
                <Label htmlFor={`global-manual-route-${conversationId}`} className="w-1/3 text-xs text-foreground">
                  Global manual route
                </Label>
                <ProInput
                  id={`global-manual-route-${conversationId}`}
                  value={globalManualOverride}
                  onChange={(event) =>
                    dispatch(
                      setPathOverride({
                        canonicalPath: ENDPOINTS.ai.manual,
                        replacement: event.target.value,
                      }),
                    )
                  }
                  placeholder={ENDPOINTS.ai.manual}
                  spellCheck={false}
                  enableVoice={false}
                  wrapperClassName="flex-1"
                  className="h-7 font-mono"
                />
              </div>
              <div className="flex items-center gap-3 py-1">
                <Label htmlFor={`api-version-${conversationId}`} className="w-1/3 text-xs text-foreground">
                  API version
                </Label>
                <ProInput
                  id={`api-version-${conversationId}`}
                  value={apiVersion ?? ""}
                  onChange={(event) => dispatch(setApiVersion(event.target.value))}
                  spellCheck={false}
                  enableVoice={false}
                  wrapperClassName="flex-1"
                  className="h-7 font-mono"
                />
              </div>
              {(apiVersion || Object.keys(pathOverrides).length > 0) && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 w-full text-xs"
                  onClick={() => dispatch(clearApiOverrides())}
                >
                  Clear API overrides
                </Button>
              )}
              <Label htmlFor={`request-overrides-${conversationId}`} className="pt-1 text-xs text-foreground">
                Request overrides
              </Label>
              <ProTextarea
                id={`request-overrides-${conversationId}`}
                value={settings.requestOverrides ?? ""}
                onChange={(event) =>
                  dispatch(
                    setBuilderAdvancedSettings({
                      conversationId,
                      changes: { requestOverrides: event.target.value || null },
                    }),
                  )
                }
                placeholder='{ "key": "value" }'
                spellCheck={false}
                rows={4}
                enableVoice={false}
                // JSON body — an AI "clean up" pass would mangle it.
                enableCleanup={false}
                surfaceName={CHAT_CONTEXT_MENU_PROPS.surfaceName}
                getApplicationScope={getApplicationScope}
                className="font-mono text-xs"
              />
              {overridesError && (
                <p className="text-[11px] text-destructive">Invalid JSON — {overridesError}</p>
              )}
              <Button
                variant="outline"
                size="sm"
                className="h-7 w-full text-xs"
                onClick={openMemoryInspector}
              >
                <Brain className="mr-1.5 h-3 w-3" /> Open Memory Inspector
                {memoryDegraded ? " (degraded)" : ""}
              </Button>
            </section>
          </>
        )}

        <Separator />
        <section className="space-y-1.5 rounded-md bg-muted/35 p-2.5 text-[11px] leading-relaxed text-muted-foreground">
          <h3 className="text-[10px] font-semibold uppercase tracking-wide text-foreground">
            Reference
          </h3>
          <p>Surface Simulator changes the surface reported for this run, which changes the available surface tools.</p>
          <p>Disable Tool Injection prevents automatic surface and capability tools; the agent&apos;s saved tools remain available.</p>
          <p>Conversation Memory is queued for the next turn. Configure and inspect its persisted details from Memory Inspector.</p>
          {isAdmin && <p>Block, Snapshot, V2 Spine, routes, and request overrides are advanced admin/test controls.</p>}
        </section>
      </div>

      <SystemInstructionModal
        conversationId={conversationId}
        open={sysModalOpen}
        onOpenChange={setSysModalOpen}
      />
    </>
  );
}
