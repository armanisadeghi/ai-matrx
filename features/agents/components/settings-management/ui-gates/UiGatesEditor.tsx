"use client";

/**
 * UiGatesEditor — the dedicated editor for an agent's model-gated UI flags.
 *
 * The input-capability flags (`tools`, `image_urls`, `file_urls`,
 * `youtube_videos`) MOVED OUT of `agent.settings` into the FE-only
 * `agent.uiGates` column (see lib/redux/slices/agent-settings/ui-gates.ts).
 * They are NO LONGER settings rows; this compact section is the one place that
 * edits them. Each gate is shown ONLY when the SELECTED MODEL declares it as a
 * control (so the UI stays strictly model-gated), and writes go through
 * `setAgentUiGates` — never `setAgentSettings` (the save-time sanitizer strips
 * gate keys from settings, so writing them there silently no-ops).
 */

import { FileText, Image as ImageIcon } from "lucide-react";
import { Youtube } from "@/components/icons/brand-icons";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAppSelector, useAppDispatch } from "@/lib/redux/hooks";
import { selectAgentUiGates } from "@/features/agents/redux/agent-definition/selectors";
import { setAgentUiGates } from "@/features/agents/redux/agent-definition/slice";
import type { NormalizedControls } from "@/features/agents/hooks/useModelControls";
import {
  UI_GATE_EDITABLE_KEYS,
  type UiGateEditableKey,
} from "@/lib/redux/slices/agent-settings/ui-gates";

interface UiGatesEditorProps {
  agentId: string;
  /** The selected model's parsed controls — drives which gates are offered. */
  normalizedControls: NormalizedControls | null;
}

const GATE_META: Record<
  UiGateEditableKey,
  { label: string; description: string; Icon: typeof ImageIcon }
> = {
  image_urls: {
    label: "Image URLs",
    description: "Offer the image-URL attachment input in chat.",
    Icon: ImageIcon,
  },
  file_urls: {
    label: "File URLs",
    description: "Offer the file-URL attachment input in chat.",
    Icon: FileText,
  },
  youtube_videos: {
    label: "YouTube Videos",
    description: "Offer the YouTube-URL attachment input in chat.",
    Icon: Youtube,
  },
};

/** True when the model's controls declare a control for this gate key. */
function modelDeclaresGate(
  controls: NormalizedControls | null,
  key: UiGateEditableKey,
): boolean {
  if (!controls) return false;
  const control = (controls as unknown as Record<string, unknown>)[key];
  return (
    !!control &&
    typeof control === "object" &&
    "type" in (control as Record<string, unknown>)
  );
}

export function UiGatesEditor({
  agentId,
  normalizedControls,
}: UiGatesEditorProps) {
  const dispatch = useAppDispatch();
  const uiGates = useAppSelector((state) => selectAgentUiGates(state, agentId));

  const offeredKeys = UI_GATE_EDITABLE_KEYS.filter((key) =>
    modelDeclaresGate(normalizedControls, key),
  );

  // Only show the section when the model declares at least one gate — keeps it
  // strictly model-gated and out of the way for models that support none.
  if (offeredKeys.length === 0) return null;

  const setGate = (key: UiGateEditableKey, next: boolean) => {
    dispatch(
      setAgentUiGates({
        id: agentId,
        uiGates: { ...uiGates, [key]: next },
      }),
    );
  };

  return (
    <div className="border-t pt-2 mt-2">
      <div className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">
        Input Capabilities
      </div>
      <div className="space-y-1">
        {offeredKeys.map((key) => {
          const { label, description, Icon } = GATE_META[key];
          const checked = uiGates[key] === true;
          const switchId = `ui-gate-${key}`;
          return (
            <div
              key={key}
              className="flex items-center gap-2 rounded px-1 py-1 hover:bg-muted/20"
            >
              <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <Label
                htmlFor={switchId}
                className="text-xs text-gray-700 dark:text-gray-300 flex-1 min-w-0 cursor-pointer"
              >
                {label}
                <span className="block text-[10px] text-muted-foreground font-normal leading-tight">
                  {description}
                </span>
              </Label>
              <Switch
                id={switchId}
                checked={checked}
                onCheckedChange={(next) => setGate(key, next)}
                className="data-[state=checked]:bg-primary shrink-0"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
