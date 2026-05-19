"use client";

/**
 * PresetMenu
 *
 * One-click templates for the most common Settings-mode comparisons.
 * Each preset wipes the current variant list and creates a small,
 * meaningful set of pre-configured variants so the user can hit Submit
 * All and see something useful immediately.
 *
 * Presets pre-fill per-column LLM overrides via the shared
 * `instanceModelOverrides` slice — the same target the manual
 * `ColumnOverridesEditor` writes to, so the chip + popover show the
 * preset's choices correctly without any preset-aware code in the
 * editor.
 */

import { Zap, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { setOverrides } from "@/features/agents/redux/execution-system/instance-model-overrides/instance-model-overrides.slice";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  destroyInstance,
} from "@/features/agents/redux/execution-system/conversations/conversations.slice";
import { createManualInstance } from "@/features/agents/redux/execution-system/thunks/create-instance.thunk";
import { generateConversationId } from "@/features/agents/redux/execution-system/utils/ids";
import {
  addSettingsColumn,
  setSettingsColumns,
} from "../redux/slice";
import { selectLockedSetup, selectSettingsColumns } from "../redux/selectors";
import type { SettingsColumn } from "../types";

interface PresetVariant {
  label: string;
  overrides: Record<string, unknown>;
}

interface Preset {
  id: string;
  label: string;
  hint: string;
  variants: PresetVariant[];
}

const PRESETS: Preset[] = [
  {
    id: "reasoning-effort",
    label: "Reasoning effort sweep",
    hint: "Same model + temp; compare how much reasoning budget changes the answer.",
    variants: [
      { label: "Reasoning · low", overrides: { reasoning_effort: "low" } },
      { label: "Reasoning · medium", overrides: { reasoning_effort: "medium" } },
      { label: "Reasoning · high", overrides: { reasoning_effort: "high" } },
    ],
  },
  {
    id: "thinking-level",
    label: "Thinking level sweep (Anthropic)",
    hint: "For Claude models — vary the thinking budget across the four levels.",
    variants: [
      { label: "Thinking · minimal", overrides: { thinking_level: "minimal" } },
      { label: "Thinking · low", overrides: { thinking_level: "low" } },
      { label: "Thinking · medium", overrides: { thinking_level: "medium" } },
      { label: "Thinking · high", overrides: { thinking_level: "high" } },
    ],
  },
  {
    id: "temperature",
    label: "Temperature sweep",
    hint: "How tight vs creative does the same request get at 0.0, 0.7, 1.2?",
    variants: [
      { label: "T = 0.0 (tight)", overrides: { temperature: 0 } },
      { label: "T = 0.7 (balanced)", overrides: { temperature: 0.7 } },
      { label: "T = 1.2 (creative)", overrides: { temperature: 1.2 } },
    ],
  },
  {
    id: "top-p",
    label: "Top-p sweep",
    hint: "Nucleus sampling — narrow vs wide vocabulary at the same temperature.",
    variants: [
      { label: "top-p = 0.1", overrides: { top_p: 0.1 } },
      { label: "top-p = 0.5", overrides: { top_p: 0.5 } },
      { label: "top-p = 1.0", overrides: { top_p: 1 } },
    ],
  },
  {
    id: "max-tokens",
    label: "Max output tokens sweep",
    hint: "Cap the response length and watch how the model compresses.",
    variants: [
      { label: "max = 256", overrides: { max_output_tokens: 256 } },
      { label: "max = 1024", overrides: { max_output_tokens: 1024 } },
      { label: "max = 4096", overrides: { max_output_tokens: 4096 } },
    ],
  },
];

export function PresetMenu() {
  const dispatch = useAppDispatch();
  const locked = useAppSelector(selectLockedSetup);
  const existingColumns = useAppSelector(selectSettingsColumns);

  const apply = async (preset: Preset) => {
    if (!locked.agentId) {
      toast.error("Pick an agent in the Locked input section first.");
      return;
    }

    // Tear down any current variants — presets always start fresh so the
    // user doesn't get a confusing mix of preset variants + their own.
    for (const col of existingColumns) {
      dispatch(destroyInstance(col.conversationId));
    }
    dispatch(setSettingsColumns([]));

    const nextColumns: SettingsColumn[] = [];
    for (const variant of preset.variants) {
      const columnId = crypto.randomUUID();
      const conversationId = generateConversationId();
      await dispatch(
        createManualInstance({
          agentId: locked.agentId,
          conversationId,
          initialAgentVersionId: locked.agentVersionId,
          apiEndpointMode: "agent",
          sourceFeature: "agent-comparison",
        }),
      ).unwrap();
      // Apply the preset's overrides directly to the per-instance
      // overrides slice — same destination as the manual editor.
      dispatch(
        setOverrides({
          conversationId,
          changes: variant.overrides,
        }),
      );
      const column: SettingsColumn = {
        columnId,
        conversationId,
        label: variant.label,
        collapsed: false,
      };
      nextColumns.push(column);
      dispatch(
        addSettingsColumn({
          columnId,
          conversationId,
          label: variant.label,
        }),
      );
    }

    toast.success(
      `Loaded "${preset.label}" — ${preset.variants.length} variants ready`,
    );
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="h-7"
          disabled={!locked.agentId}
          title={
            locked.agentId
              ? "Quick-start with a sample comparison"
              : "Pick an agent first to use presets"
          }
        >
          <Zap className="w-3.5 h-3.5" />
          Presets
          <ChevronDown className="w-3 h-3 ml-0.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
          Quick-start sample comparisons
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {PRESETS.map((preset) => (
          <DropdownMenuItem
            key={preset.id}
            onClick={() => void apply(preset)}
            className="flex-col items-start gap-0.5 py-2"
          >
            <span className="text-xs font-medium text-foreground">
              {preset.label}
            </span>
            <span className="text-[10px] text-muted-foreground/80">
              {preset.hint}
            </span>
            <span className="text-[9px] uppercase tracking-wider text-primary mt-1">
              {preset.variants.length} variants
            </span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <div className="text-[10px] text-muted-foreground/70 px-2 py-1.5 italic">
          Loading a preset replaces the current variants. Locked input is
          preserved.
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
