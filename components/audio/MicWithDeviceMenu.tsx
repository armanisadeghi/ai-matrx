"use client";

// components/audio/MicWithDeviceMenu.tsx
//
// Combined mic toggle + device picker in one compact split capsule, used by
// ProTextarea / ProInput. The chevron hides while recording or transcribing.

import { ChevronDown, Loader2, Mic } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@ai-matrx/design-system";
import { cn } from "@/lib/utils";
import {
  MicDeviceMenuPanel,
  useMicDevicePicker,
} from "@/components/audio/micDeviceMenuShared";

// ONE compact capsule (owner, 2026-10-04: "the down chevron taking up an
// entire icon space is horrible"). The mic and a 12px device chevron share a
// ~40px pill, where the old pair took two full 44px touch boxes (~90px). The
// outer padding is equal on both ends so the ink sits centred in the pill
// (tap-target guard); on a touch screen both ends pad out a little more.
// The glyphs match the tap buttons beside them (16px mic, 14px chevron at full
// ink): at 14px/12px-and-70% the row read as three grey dots (Arman, 2026-10-09).
const SEGMENT =
  "relative z-[1] inline-flex h-full touch-manipulation items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-40 " +
  // Touch: an invisible strip grows each segment's hit area to 44px tall
  // without growing the layout (the tap-target system's own trick).
  "pointer-coarse:before:absolute pointer-coarse:before:inset-x-0 pointer-coarse:before:-inset-y-1 pointer-coarse:before:content-['']";
const MIC_ALONE = "px-1.5 pointer-coarse:px-3";
const MIC_SPLIT = "pl-1.5 pr-0.5 pointer-coarse:pl-3 pointer-coarse:pr-1.5";
const CHEVRON_SPLIT = "pl-0 pr-1.5 pointer-coarse:pl-1 pointer-coarse:pr-3";

export interface MicWithDeviceMenuProps {
  onMicClick: () => void;
  disabled?: boolean;
  isRecording?: boolean;
  isTranscribing?: boolean;
  audioLevel?: number;
  /**
   * Show the device chevron. Defaults to true only when idle (not recording /
   * transcribing); a host short on room passes false and offers the device
   * choice elsewhere.
   */
  showDeviceMenu?: boolean;
  micAriaLabel?: string;
  deviceMenuAriaLabel?: string;
  iconClassName?: string;
  tabIndex?: number;
}

export function MicWithDeviceMenu({
  onMicClick,
  disabled,
  isRecording = false,
  isTranscribing = false,
  audioLevel = 0,
  showDeviceMenu,
  micAriaLabel = "Start voice input",
  deviceMenuAriaLabel = "Choose microphone",
  iconClassName,
  tabIndex,
}: MicWithDeviceMenuProps) {
  const deviceMenuVisible = showDeviceMenu ?? (!isRecording && !isTranscribing);
  const { handleOpenChange, openSettings } = useMicDevicePicker();

  const micLabel = isRecording
    ? "Stop recording"
    : isTranscribing
      ? "Transcribing"
      : micAriaLabel;

  const stateColor = isRecording
    ? "text-primary"
    : isTranscribing
      ? "text-blue-600 dark:text-blue-400"
      : "text-muted-foreground";

  return (
    // Plain ink, no glass border: the hosts pair it with a transparent "…"
    // tap button, so the row is all non-glass (tap-target placement rule 2)
    // and reads as two quiet icons, not a stack of pills.
    <div className="relative mx-[3px] inline-flex h-7 shrink-0 items-center pointer-coarse:h-10">
      <div className="relative flex h-7 items-stretch rounded-full pointer-coarse:h-9">
        {isRecording && (
          <>
            <span
              className="pointer-events-none absolute inset-0 rounded-full bg-primary/20 animate-ping"
              style={{ animationDuration: "1.5s" }}
            />
            <span
              className="pointer-events-none absolute inset-0 rounded-full bg-primary/15"
              style={{
                transform: `scale(${1 + audioLevel / 200})`,
                transition: "transform 75ms",
              }}
            />
          </>
        )}

        <button
          tabIndex={tabIndex}
          type="button"
          onClick={onMicClick}
          disabled={disabled}
          aria-label={micLabel}
          title={micLabel}
          className={cn(
            SEGMENT,
            deviceMenuVisible
              ? cn(MIC_SPLIT, "rounded-l-full")
              : cn(MIC_ALONE, "rounded-full"),
            "hover:bg-muted/60 active:bg-muted-foreground/15",
            stateColor,
            iconClassName,
          )}
        >
          {isTranscribing && !isRecording ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Mic className="h-4 w-4" />
          )}
        </button>

        {deviceMenuVisible && (
          <Popover onOpenChange={handleOpenChange}>
            <PopoverTrigger asChild>
              <button
                tabIndex={tabIndex}
                type="button"
                disabled={disabled}
                aria-label={deviceMenuAriaLabel}
                title="Microphone"
                className={cn(
                  SEGMENT,
                  CHEVRON_SPLIT,
                  "rounded-r-full text-muted-foreground hover:bg-muted/60 hover:text-foreground active:bg-muted-foreground/15",
                )}
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
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
        )}
      </div>
    </div>
  );
}
