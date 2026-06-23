"use client";

// components/audio/MicDeviceMenu.tsx
//
// The reusable "device caret" — a small chevron that sits next to a mic icon
// (Anthropic-style) and opens a compact popover for choosing the input device,
// plus a link to the full Audio devices settings. Drop it next to any mic
// affordance; it consumes the canonical `useAudioDevices()` hook, so the choice
// it makes is global, persisted, and applied to the next recording.
//
// Intentionally tiny: device selection + a "More settings" link. No recording
// controls of its own.

import { useCallback } from "react";
import { Check, ChevronDown, Mic, SlidersHorizontal } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useAudioDevices } from "@/features/audio/useAudioDevices";
import { useOpenAudioDevices } from "@/features/overlays/openers/audioDevices";

const SYSTEM_DEFAULT = "__system_default__";

interface MicDeviceMenuProps {
  /** Extra classes for the caret trigger button. */
  className?: string;
  /** Disable the caret (e.g. while audio is unavailable). */
  disabled?: boolean;
  /** Tooltip-ish aria label. Default: "Choose microphone". */
  ariaLabel?: string;
}

export function MicDeviceMenu({
  className,
  disabled,
  ariaLabel = "Choose microphone",
}: MicDeviceMenuProps) {
  const { inputs, selectedInputId, setInput, requestPermission } =
    useAudioDevices();
  const openSettings = useOpenAudioDevices();

  // Opening the menu is a fine moment to unlock labels if not granted yet.
  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (open) void requestPermission();
    },
    [requestPermission],
  );

  const choose = useCallback(
    (deviceId: string) => {
      if (deviceId === SYSTEM_DEFAULT) {
        setInput("", "");
        return;
      }
      const dev = inputs.find((d) => d.deviceId === deviceId);
      setInput(deviceId, dev?.label ?? "");
    },
    [inputs, setInput],
  );

  const currentValue = selectedInputId || SYSTEM_DEFAULT;

  return (
    <Popover onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={ariaLabel}
          className={cn(
            "inline-flex h-5 w-4 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40 disabled:pointer-events-none",
            className,
          )}
        >
          <ChevronDown className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="bottom"
        sideOffset={6}
        className="w-60 p-1"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="px-2 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Microphone
        </div>
        <DeviceRow
          label="System default"
          icon={<Mic className="h-3.5 w-3.5" />}
          selected={currentValue === SYSTEM_DEFAULT}
          onClick={() => choose(SYSTEM_DEFAULT)}
        />
        {inputs
          .filter((d) => d.deviceId)
          .map((d) => (
            <DeviceRow
              key={d.deviceId}
              label={d.label || `Microphone (${d.deviceId.slice(0, 6)})`}
              icon={<Mic className="h-3.5 w-3.5" />}
              selected={currentValue === d.deviceId}
              onClick={() => choose(d.deviceId)}
            />
          ))}
        <div className="my-1 h-px bg-border" />
        <button
          type="button"
          onClick={() => openSettings()}
          className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
          Audio settings…
        </button>
      </PopoverContent>
    </Popover>
  );
}

function DeviceRow({
  label,
  icon,
  selected,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground",
        selected ? "text-foreground" : "text-muted-foreground",
      )}
    >
      <span className="shrink-0 text-muted-foreground">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {selected && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
    </button>
  );
}
