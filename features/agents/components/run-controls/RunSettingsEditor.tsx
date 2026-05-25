"use client";

import { useState } from "react";
import { Brain, FileText } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
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
