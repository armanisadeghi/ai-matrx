"use client";

import { FileText, Image as ImageIcon, RotateCcw } from "lucide-react";
import { Youtube } from "@/components/icons/brand-icons";
import { Label } from "@/components/ui/label";
import { SwitchLegacy as Switch } from "@/components/ui/switch";
import { Button } from "@ai-matrx/design-system";
import { cn } from "@/utils/cn";
import {
  UI_GATE_EDITABLE_KEYS,
  type UiGateEditableKey,
  type UiGates,
} from "@/lib/redux/slices/agent-settings/ui-gates";

interface InputCapabilitiesEditorProps {
  values: UiGates;
  onChange: (key: UiGateEditableKey, value: boolean) => void;
  overriddenKeys?: ReadonlySet<UiGateEditableKey>;
  onReset?: (key: UiGateEditableKey) => void;
  idPrefix: string;
  title?: string;
  /**
   * "settings" (default) = the agent builder's rows with a one-line
   * description. "menu" = the composer/Chat Options sizing: label + switch
   * only, 36px rows (44px on touch), text-sm, 28px Reset when overridden.
   */
  variant?: "settings" | "menu";
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
    label: "YouTube videos",
    description: "Offer the YouTube-URL attachment input in chat.",
    Icon: Youtube,
  },
};

/** Shared builder/runtime editor for frontend-only run capabilities. */
export function InputCapabilitiesEditor({
  values,
  onChange,
  overriddenKeys,
  onReset,
  idPrefix,
  title = "Input Capabilities",
  variant = "settings",
}: InputCapabilitiesEditorProps) {
  if (variant === "menu")
    return (
      <div className="border-t border-border px-3 pb-3">
        <p className="pb-1 pt-3 text-xs font-medium text-muted-foreground">{title}</p>
        {UI_GATE_EDITABLE_KEYS.map((key) => {
          const { label, Icon } = GATE_META[key];
          const overridden = overriddenKeys?.has(key) === true;
          const switchId = `${idPrefix}-${key}`;
          return (
            <div
              key={key}
              className={cn(
                "-mx-1.5 flex min-h-9 items-center gap-2.5 rounded-lg px-1.5 pointer-coarse:min-h-11",
                overridden && "bg-primary/5",
              )}
            >
              <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
              <Label
                htmlFor={switchId}
                className="min-w-0 flex-1 cursor-pointer truncate text-sm font-normal text-foreground"
              >
                {label}
              </Label>
              {overridden && onReset ? (
                <button
                  type="button"
                  aria-label={`Reset ${label} to agent default`}
                  title="Reset override"
                  onClick={() => onReset(key)}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
              ) : null}
              <Switch
                id={switchId}
                checked={values[key] === true}
                onCheckedChange={(next) => onChange(key, next)}
                className="shrink-0"
              />
            </div>
          );
        })}
      </div>
    );
  return (
    <div className="border-t pt-2 mt-2">
      <div className="mb-2 text-xs font-semibold text-foreground">{title}</div>
      <div className="space-y-1">
        {UI_GATE_EDITABLE_KEYS.map((key) => {
          const { label, description, Icon } = GATE_META[key];
          const checked = values[key] === true;
          const overridden = overriddenKeys?.has(key) === true;
          const switchId = `${idPrefix}-${key}`;
          return (
            <div
              key={key}
              className="flex items-center gap-2 rounded px-1 py-1 hover:bg-muted/20"
            >
              <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <Label
                htmlFor={switchId}
                className="min-w-0 flex-1 cursor-pointer text-xs text-foreground"
              >
                {label}
                <span className="block text-[10px] font-normal leading-tight text-muted-foreground">
                  {description}
                </span>
              </Label>
              {overridden && onReset ? (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  aria-label={`Reset ${label} to agent default`}
                  onClick={() => onReset(key)}
                >
                  <RotateCcw className="h-3 w-3" />
                </Button>
              ) : null}
              <Switch
                id={switchId}
                checked={checked}
                onCheckedChange={(next) => onChange(key, next)}
                className="shrink-0 data-[state=checked]:bg-primary"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
