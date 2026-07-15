"use client";

// components/audio/MicWithDeviceMenu.tsx
//
// Combined mic toggle + device picker in one split pill (Anthropic-style).
// Replaces the awkward "full tap target + tiny orphan chevron" pairing in
// ProTextarea / ProInput. The chevron hides while recording or transcribing.

import { ChevronDown, Loader2, Mic } from "lucide-react";
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

const SEGMENT_TOUCH =
  "inline-flex min-h-[2.75rem] -my-[9px] touch-manipulation items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:pointer-events-none disabled:opacity-40";

export interface MicWithDeviceMenuProps {
  onMicClick: () => void;
  disabled?: boolean;
  isRecording?: boolean;
  isTranscribing?: boolean;
  audioLevel?: number;
  /** Defaults to true only when idle (not recording / transcribing). */
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
    <div className="relative inline-flex h-10 items-center">
      <div
        className={cn(
          "relative flex h-7 items-stretch overflow-hidden rounded-full matrx-glass-thin-border",
          deviceMenuVisible ? "pr-0" : "px-0",
        )}
      >
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
          className={cn(
            SEGMENT_TOUCH,
            "relative z-[1]",
            deviceMenuVisible
              ? "rounded-l-full pl-2.5 pr-2 hover:bg-muted/60 active:bg-muted-foreground/15"
              : "rounded-full px-2.5 hover:bg-muted/60 active:bg-muted-foreground/15",
            stateColor,
            iconClassName,
          )}
        >
          {isTranscribing && !isRecording ? (
            <Loader2 className="matrx-tap-icon animate-spin" />
          ) : (
            <Mic className="matrx-tap-icon" />
          )}
        </button>

        {deviceMenuVisible && (
          <>
            <span
              className="my-1.5 w-px shrink-0 self-stretch bg-border/70"
              aria-hidden
            />
            <Popover onOpenChange={handleOpenChange}>
              <PopoverTrigger asChild>
                <button
                  tabIndex={tabIndex}
                  type="button"
                  disabled={disabled}
                  aria-label={deviceMenuAriaLabel}
                  className={cn(
                    SEGMENT_TOUCH,
                    "relative z-[1]",
                    "rounded-r-full pl-1 pr-1.5 text-muted-foreground hover:bg-muted/60 hover:text-foreground active:bg-muted-foreground/15",
                  )}
                >
                  <ChevronDown className="matrx-tap-icon opacity-70" />
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
          </>
        )}
      </div>
    </div>
  );
}
