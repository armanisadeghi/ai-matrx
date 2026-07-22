"use client";

import { useCallback } from "react";
import { Check, Mic, SlidersHorizontal } from "lucide-react";
import { useAudioDevices } from "@/features/audio/useAudioDevices";
import { useOpenAudioDevices } from "@/features/overlays/openers/audioDevices";
import { cn } from "@/lib/utils";

export const MIC_SYSTEM_DEFAULT = "__system_default__";

export function useMicDevicePicker() {
  const { inputs, selectedInputId, setInput, requestPermission } =
    useAudioDevices();
  const openSettings = useOpenAudioDevices();

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (open) void requestPermission();
    },
    [requestPermission],
  );

  const choose = useCallback(
    (deviceId: string) => {
      if (deviceId === MIC_SYSTEM_DEFAULT) {
        setInput("", "");
        return;
      }
      const dev = inputs.find((d) => d.deviceId === deviceId);
      setInput(deviceId, dev?.label ?? "");
    },
    [inputs, setInput],
  );

  const currentValue = selectedInputId || MIC_SYSTEM_DEFAULT;

  return {
    inputs,
    currentValue,
    choose,
    handleOpenChange,
    openSettings,
  };
}

export function MicDeviceMenuPanel({
  onOpenSettings,
}: {
  onOpenSettings: () => void;
}) {
  const { inputs, currentValue, choose } = useMicDevicePicker();

  return (
    <DeviceMenuPanel
      heading="Microphone"
      icon={<Mic className="h-3.5 w-3.5" />}
      devices={inputs}
      selectedId={currentValue === MIC_SYSTEM_DEFAULT ? "" : currentValue}
      defaultLabel="System default"
      fallbackLabel="Microphone"
      onSelect={(deviceId) => choose(deviceId || MIC_SYSTEM_DEFAULT)}
      onOpenSettings={onOpenSettings}
    />
  );
}

export interface DeviceMenuPanelProps {
  /** Uppercase section header, e.g. "MICROPHONE" / "CAMERA" / "SPEAKER". */
  heading: string;
  icon: React.ReactNode;
  devices: Array<{ deviceId: string; label: string }>;
  /** Resolved live deviceId; `""` selects the default row. */
  selectedId: string;
  /** Label of the `""` row — "System default" for mic/speaker, "Auto" etc. */
  defaultLabel: string;
  /** Prefix for an unlabeled device (labels are blank before a grant). */
  fallbackLabel: string;
  /** Receives `""` for the default row. */
  onSelect: (deviceId: string) => void;
  onOpenSettings: () => void;
  settingsLabel?: string;
  /** When set, every row is inert and this explains why (e.g. recording). */
  disabledReason?: string | null;
  /** Rendered under the rows — permission prompts, unsupported notices. */
  footerSlot?: React.ReactNode;
}

/**
 * The canonical compact device popover body (w-60): uppercase heading, a
 * default row, one row per device with a Check on the active one, a divider,
 * and a "settings…" footer link. Mic, camera, and speaker pickers all render
 * this — there is no second device-list markup.
 */
export function DeviceMenuPanel({
  heading,
  icon,
  devices,
  selectedId,
  defaultLabel,
  fallbackLabel,
  onSelect,
  onOpenSettings,
  settingsLabel = "Audio settings…",
  disabledReason = null,
  footerSlot,
}: DeviceMenuPanelProps) {
  return (
    <>
      <div className="px-2 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {heading}
      </div>
      {disabledReason && (
        <p className="px-2 pb-1.5 text-[11px] leading-snug text-muted-foreground">
          {disabledReason}
        </p>
      )}
      <MicDeviceRow
        label={defaultLabel}
        icon={icon}
        selected={selectedId === ""}
        disabled={disabledReason !== null}
        onClick={() => onSelect("")}
      />
      {devices
        .filter((d) => d.deviceId)
        .map((d) => (
          <MicDeviceRow
            key={d.deviceId}
            label={d.label || `${fallbackLabel} (${d.deviceId.slice(0, 6)})`}
            icon={icon}
            selected={selectedId === d.deviceId}
            disabled={disabledReason !== null}
            onClick={() => onSelect(d.deviceId)}
          />
        ))}
      {footerSlot}
      <div className="my-1 h-px bg-border" />
      <button
        type="button"
        onClick={onOpenSettings}
        className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
        {settingsLabel}
      </button>
    </>
  );
}

function MicDeviceRow({
  label,
  icon,
  selected,
  disabled = false,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground",
        selected ? "text-foreground" : "text-muted-foreground",
        disabled && "pointer-events-none opacity-50",
      )}
    >
      <span className="shrink-0 text-muted-foreground">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {selected && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
    </button>
  );
}
