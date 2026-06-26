"use client";

import { useState } from "react";
import { Brain, FileText, Wand2, Route } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
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
  selectApiVersion,
  selectPathOverrides,
  setApiVersion,
  setPathOverride,
  clearApiOverrides,
} from "@/lib/redux/slices/apiConfigSlice";
import { ENDPOINTS } from "@/lib/api/endpoints";
import { DEFAULT_BUILDER_ADVANCED_SETTINGS } from "@/features/agents/types/instance.types";
import { SurfaceSimulatorSelect } from "./SurfaceSimulatorSelect";
import { SystemInstructionModal } from "../builder/message-builders/system-instructions/SystemInstructionModal";
import { NumberStepper } from "@/components/official-candidate/NumberStepper";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import { MemoryControls } from "@/features/agents/components/observational-memory/components/MemoryControls";
import {
  selectIsMemoryEnabledForConversation,
  selectMemoryDegraded,
} from "@/features/agents/redux/execution-system/observational-memory/observational-memory.selectors";

interface RunSettingsEditorProps {
  conversationId: string;
}

function SettingRow({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-1">
      <Label
        htmlFor={id}
        className="text-xs text-muted-foreground cursor-pointer"
      >
        {label}
      </Label>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onChange}
        className="scale-75 origin-right"
      />
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
  const isBlockMode = useAppSelector(selectIsBlockMode);
  const isSnapshot = useAppSelector(selectIsSnapshot);
  const isMemoryEnabledForThisConversation = useAppSelector(
    selectIsMemoryEnabledForConversation(conversationId),
  );
  const isMemoryDegraded = useAppSelector(selectMemoryDegraded(conversationId));
  const directiveApplyPolicy = useAppSelector(
    (s) => s.userPreferences.assistant.directiveApplyPolicy,
  );
  const apiVersion = useAppSelector(selectApiVersion);
  const pathOverrides = useAppSelector(selectPathOverrides);
  const globalManualOverride = pathOverrides[ENDPOINTS.ai.manual] ?? "";
  const [sysModalOpen, setSysModalOpen] = useState(false);

  const openMemoryInspector = () =>
    dispatch(
      openOverlay({
        overlayId: "observationalMemoryWindow",
        data: { initialSelectedConversationId: conversationId },
      }),
    );

  return (
    <>
      <div className="space-y-0.5">
        <div className="px-0.5 pb-0.5 text-[10px] uppercase tracking-wide text-muted-foreground/70">
          Tool injection
        </div>
        <SettingRow
          id={`disable-tool-injection-${conversationId}`}
          label="Disable tool injection (this run)"
          checked={settings.disableToolInjection ?? false}
          onChange={(v) =>
            dispatch(
              setBuilderAdvancedSettings({
                conversationId,
                changes: { disableToolInjection: v },
              }),
            )
          }
        />
        <p className="px-0.5 pb-1 text-[10px] leading-snug text-muted-foreground/70">
          Sends no surface for this conversation, so the server adds no
          automatic tools — the agent runs with only its own saved tools.
        </p>

        <SurfaceSimulatorSelect conversationId={conversationId} />

        <Separator className="!my-1.5" />

        <SettingRow
          id={`debug-${conversationId}`}
          label="Debug mode"
          checked={settings.debug}
          onChange={(v) =>
            dispatch(
              setBuilderAdvancedSettings({
                conversationId,
                changes: { debug: v },
              }),
            )
          }
        />
        <SettingRow
          id={`store-${conversationId}`}
          label="Save to DB"
          checked={settings.store}
          onChange={(v) =>
            dispatch(
              setBuilderAdvancedSettings({
                conversationId,
                changes: { store: v },
              }),
            )
          }
        />
        <SettingRow
          id={`reuse-cid-${conversationId}`}
          label="Reuse conversation ID"
          checked={reuseConversationId}
          onChange={(v) =>
            dispatch(setReuseConversationId({ conversationId, value: v }))
          }
        />

        <Separator className="!my-1.5" />

        <SettingRow
          id={`structured-sys-${conversationId}`}
          label="Structured system prompt"
          checked={settings.useStructuredSystemInstruction}
          onChange={(v) =>
            dispatch(
              setBuilderAdvancedSettings({
                conversationId,
                changes: { useStructuredSystemInstruction: v },
              }),
            )
          }
        />

        {settings.useStructuredSystemInstruction && (
          <Button
            variant="outline"
            size="sm"
            className="w-full h-7 text-xs mt-1"
            onClick={() => setSysModalOpen(true)}
          >
            <FileText className="w-3 h-3 mr-1.5" />
            Configure instruction fields
          </Button>
        )}

        <Separator className="!my-1.5" />

        {/* User-level output-directive apply policy. Persists to user
            preferences and flows to the backend `user.apply_policy` (USER
            layer, highest priority) on every turn when not "Default". */}
        <div className="flex items-center justify-between py-1 gap-3">
          <Label
            htmlFor={`apply-policy-${conversationId}`}
            className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0"
          >
            <Wand2 className="w-3 h-3" />
            Agent actions
          </Label>
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
            <SelectTrigger
              id={`apply-policy-${conversationId}`}
              className="h-6 w-[11rem] text-xs"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default" className="text-xs">
                Ask first (default)
              </SelectItem>
              <SelectItem value="auto" className="text-xs">
                Apply automatically
              </SelectItem>
              <SelectItem value="ask" className="text-xs">
                Always ask first
              </SelectItem>
              <SelectItem value="off" className="text-xs">
                Never apply
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Separator className="!my-1.5" />

        <div className="flex items-center justify-between py-1 gap-3">
          <Label className="text-xs text-muted-foreground shrink-0">
            Max iterations
          </Label>
          <NumberStepper
            value={settings.maxIterations}
            onChange={(v) =>
              dispatch(
                setBuilderAdvancedSettings({
                  conversationId,
                  changes: { maxIterations: v },
                }),
              )
            }
            min={1}
            max={1000}
            className="h-6"
          />
        </div>

        <div className="flex items-center justify-between py-1 gap-3">
          <Label className="text-xs text-muted-foreground shrink-0">
            Retries / iteration
          </Label>
          <NumberStepper
            value={settings.maxRetriesPerIteration}
            onChange={(v) =>
              dispatch(
                setBuilderAdvancedSettings({
                  conversationId,
                  changes: { maxRetriesPerIteration: v },
                }),
              )
            }
            min={0}
            max={10}
            className="h-6"
          />
        </div>

        {isAdmin && (
          <>
            <Separator className="!my-1.5" />
            <div className="px-0.5 pt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground/70">
              Admin
            </div>
            <SettingRow
              id={`block-mode-${conversationId}`}
              label="Block mode (block_mode)"
              checked={isBlockMode}
              onChange={(v) => dispatch(setUseBlockMode(v))}
            />
            <SettingRow
              id={`snapshot-${conversationId}`}
              label="Snapshot capture (snapshot)"
              checked={isSnapshot}
              onChange={(v) => dispatch(setUseSnapshot(v))}
            />

            {/* ── API routing overrides (admin/test) ──────────────────────── */}
            <Separator className="!my-1.5" />
            <div className="flex items-center gap-1.5 px-0.5 pb-0.5 text-[10px] uppercase tracking-wide text-muted-foreground/70">
              <Route className="w-3 h-3" />
              API routing (test)
            </div>

            {/* Per-conversation manual route override — the primary
                "test THIS run against a different route" control. */}
            <div className="py-1 space-y-1">
              <Label
                htmlFor={`manual-route-${conversationId}`}
                className="text-xs text-muted-foreground"
              >
                Manual route (this run)
              </Label>
              <Input
                id={`manual-route-${conversationId}`}
                value={settings.manualEndpointOverride ?? ""}
                onChange={(e) =>
                  dispatch(
                    setBuilderAdvancedSettings({
                      conversationId,
                      changes: {
                        manualEndpointOverride: e.target.value || null,
                      },
                    }),
                  )
                }
                placeholder={ENDPOINTS.ai.manual}
                spellCheck={false}
                className="h-7 text-xs font-mono"
              />
              <p className="text-[10px] leading-snug text-muted-foreground/70">
                Overrides the Builder’s POST path for this conversation only
                (e.g. <code className="font-mono">/ai/v2/chat</code>). Same
                request body, same server — only the path changes. Empty ={" "}
                <code className="font-mono">{ENDPOINTS.ai.manual}</code>.
              </p>
            </div>

            <Separator className="!my-1.5" />

            {/* Global manual route override — applies app-wide + persists. */}
            <div className="py-1 space-y-1">
              <Label
                htmlFor={`global-manual-route-${conversationId}`}
                className="text-xs text-muted-foreground"
              >
                Global manual route
              </Label>
              <Input
                id={`global-manual-route-${conversationId}`}
                value={globalManualOverride}
                onChange={(e) =>
                  dispatch(
                    setPathOverride({
                      canonicalPath: ENDPOINTS.ai.manual,
                      replacement: e.target.value,
                    }),
                  )
                }
                placeholder={ENDPOINTS.ai.manual}
                spellCheck={false}
                className="h-7 text-xs font-mono"
              />
            </div>

            {/* Global API version prefix — applies to EVERY backend path. */}
            <div className="py-1 space-y-1">
              <Label
                htmlFor={`api-version-${conversationId}`}
                className="text-xs text-muted-foreground"
              >
                Global API version
              </Label>
              <Input
                id={`api-version-${conversationId}`}
                value={apiVersion ?? ""}
                onChange={(e) => dispatch(setApiVersion(e.target.value))}
                placeholder="(none) — e.g. v2"
                spellCheck={false}
                className="h-7 text-xs font-mono"
              />
              <p className="text-[10px] leading-snug text-muted-foreground/70">
                Prefixes every backend path app-wide (e.g.{" "}
                <code className="font-mono">v2</code> →{" "}
                <code className="font-mono">/v2/ai/manual</code>). Persists
                across reloads.
              </p>
            </div>

            {(apiVersion || Object.keys(pathOverrides).length > 0) && (
              <Button
                variant="outline"
                size="sm"
                className="w-full h-7 text-xs"
                onClick={() => dispatch(clearApiOverrides())}
              >
                Clear all API overrides
              </Button>
            )}

            {/* ── Observational Memory (admin-gated, per-conversation) ───── */}
            <Separator className="!my-1.5" />
            <div className="px-0.5 pb-0.5 text-[10px] uppercase tracking-wide text-muted-foreground/70">
              Observational Memory
            </div>
            <MemoryControls conversationId={conversationId} variant="compact" />
            <Button
              variant={
                isMemoryEnabledForThisConversation ? "default" : "outline"
              }
              size="sm"
              className="w-full h-7 text-xs mt-1.5"
              onClick={openMemoryInspector}
            >
              <Brain className="w-3 h-3 mr-1.5" />
              Open Memory Inspector
              {isMemoryDegraded && (
                <span className="ml-1.5 text-[10px] text-amber-500">
                  · degraded
                </span>
              )}
            </Button>
          </>
        )}
      </div>

      <SystemInstructionModal
        conversationId={conversationId}
        open={sysModalOpen}
        onOpenChange={setSysModalOpen}
      />
    </>
  );
}
