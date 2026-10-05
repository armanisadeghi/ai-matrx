"use client";

// components/audio/MicDeviceMenu.tsx
//
// Standalone device caret — opens mic picker + audio settings. Prefer
// `MicWithDeviceMenu` when you also need a record toggle in the same control.

import { ChevronDown } from "lucide-react";
import { Button } from "@ai-matrx/design-system/controls";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@ai-matrx/design-system";
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
        <Button
          variant="quiet"
          disabled={disabled}
          aria-label={ariaLabel}
          icon={<ChevronDown />}
          className={className}
        />
      </PopoverTrigger>
      <PopoverContent
        sizing="content"
        align="end"
        side="bottom"
        sideOffset={6}
        className="p-1"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <MicDeviceMenuPanel onOpenSettings={() => openSettings()} />
      </PopoverContent>
    </Popover>
  );
}
