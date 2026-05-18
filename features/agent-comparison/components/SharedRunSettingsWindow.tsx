"use client";

/**
 * SharedRunSettingsWindow
 *
 * Common server-side run-settings overrides applied to every configured
 * column. Live edits fan out via `broadcastRunSettings` so the comparison
 * is fair (every agent runs under the same caps + flags).
 *
 * Per-agent advanced bits (structured system instruction body) stay on
 * each column's own Creator Panel — that part isn't meaningfully shareable
 * across different agents.
 */

import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectBuilderAdvancedSettings } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import { DEFAULT_BUILDER_ADVANCED_SETTINGS } from "@/features/agents/types/instance.types";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { NumberStepper } from "@/components/official-candidate/NumberStepper";
import { broadcastRunSettings } from "../redux/thunks";
import { selectBattleColumns } from "../redux/selectors";

interface Props {
  id: string;
  onClose: () => void;
}

export function SharedRunSettingsWindow({ id, onClose }: Props) {
  const dispatch = useAppDispatch();
  const columns = useAppSelector(selectBattleColumns);
  const configured = columns.filter((c) => c.agentId);

  // Read from the FIRST configured column. After the user edits anything
  // the broadcast pushes the change to every column, so subsequent reads
  // converge. (Pre-broadcast, columns may have diverged from past
  // per-column edits; that's expected and not blocking.)
  const sampleConversationId = configured[0]?.conversationId ?? null;
  const settings = useAppSelector((state) =>
    sampleConversationId
      ? selectBuilderAdvancedSettings(sampleConversationId)(state)
      : null,
  );
  const eff = settings ?? DEFAULT_BUILDER_ADVANCED_SETTINGS;

  const isReady = sampleConversationId != null;

  return (
    <WindowPanel
      id={id}
      title="Shared run settings"
      width={460}
      height={420}
      onClose={onClose}
    >
      <div className="h-full flex flex-col">
        <div className="px-3 py-2 border-b border-border text-[11px] text-muted-foreground bg-muted/20">
          {isReady
            ? `Edits broadcast to all ${configured.length} configured column${
                configured.length === 1 ? "" : "s"
              }. Identical run caps + flags = fair comparison.`
            : "Configure at least one column with an agent to enable shared settings."}
        </div>

        <div
          className="flex-1 overflow-y-auto p-3 space-y-1"
          style={{ opacity: isReady ? 1 : 0.6, pointerEvents: isReady ? "auto" : "none" }}
        >
          <SettingToggle
            id="shared-debug"
            label="Debug mode"
            description="Verbose server logs for this turn."
            checked={eff.debug}
            onChange={(v) =>
              dispatch(broadcastRunSettings({ changes: { debug: v } }))
            }
          />
          <SettingToggle
            id="shared-store"
            label="Store turn in DB"
            description="When off, the turn streams but no cx_message rows are written."
            checked={eff.store}
            onChange={(v) =>
              dispatch(broadcastRunSettings({ changes: { store: v } }))
            }
          />

          <Separator />

          <StepperRow
            label="Max iterations"
            description="Cap on agent reasoning + tool loops per turn."
            value={eff.maxIterations}
            min={1}
            max={500}
            onChange={(v) =>
              dispatch(broadcastRunSettings({ changes: { maxIterations: v } }))
            }
          />
          <StepperRow
            label="Max retries / iteration"
            description="How many times one iteration may retry on transient errors."
            value={eff.maxRetriesPerIteration}
            min={0}
            max={10}
            onChange={(v) =>
              dispatch(
                broadcastRunSettings({
                  changes: { maxRetriesPerIteration: v },
                }),
              )
            }
          />

          <Separator />

          <SettingToggle
            id="shared-structured"
            label="Structured system instruction"
            description="Send the system prompt as a structured object (unlocks intro/outro/etc on the server side)."
            checked={eff.useStructuredSystemInstruction}
            onChange={(v) =>
              dispatch(
                broadcastRunSettings({
                  changes: { useStructuredSystemInstruction: v },
                }),
              )
            }
          />
        </div>

        <div className="shrink-0 border-t border-border bg-card/40 px-3 py-2 text-[10px] text-muted-foreground">
          Per-agent advanced bits (structured instruction body, system prompt
          edits) stay in each column's own Creator Panel.
        </div>
      </div>
    </WindowPanel>
  );
}

function Separator() {
  return <div className="my-2 border-t border-border" />;
}

function SettingToggle({
  id,
  label,
  description,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <div className="min-w-0">
        <Label htmlFor={id} className="text-xs text-foreground cursor-pointer">
          {label}
        </Label>
        <p className="text-[10px] text-muted-foreground/80 mt-0.5">
          {description}
        </p>
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onChange}
        className="scale-90 origin-right shrink-0"
      />
    </div>
  );
}

function StepperRow({
  label,
  description,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  description: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <div className="min-w-0">
        <div className="text-xs text-foreground">{label}</div>
        <p className="text-[10px] text-muted-foreground/80 mt-0.5">
          {description}
        </p>
      </div>
      <div className="shrink-0">
        <NumberStepper value={value} onChange={onChange} min={min} max={max} />
      </div>
    </div>
  );
}
