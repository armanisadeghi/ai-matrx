"use client";

// components/audio/MicDeviceMenu.tsx
//
// Standalone device caret — opens mic picker + audio settings. Prefer
// `MicWithDeviceMenu` when you also need a record toggle in the same control.

import { ChevronDown } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  MicDeviceMenuPanel,
  useMicDevicePicker,
} from "@/components/audio/micDeviceMenuShared";

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
  const { handleOpenChange, openSettings } = useMicDevicePicker();

  return (
    <Popover onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={ariaLabel}
          className={cn(
            "inline-flex h-5 w-4 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-40",
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
        <MicDeviceMenuPanel onOpenSettings={() => openSettings()} />
      </PopoverContent>
    </Popover>
  );
}
