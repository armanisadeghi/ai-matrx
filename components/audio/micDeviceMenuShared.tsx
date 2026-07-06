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
    <>
      <div className="px-2 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Microphone
      </div>
      <MicDeviceRow
        label="System default"
        icon={<Mic className="h-3.5 w-3.5" />}
        selected={currentValue === MIC_SYSTEM_DEFAULT}
        onClick={() => choose(MIC_SYSTEM_DEFAULT)}
      />
      {inputs
        .filter((d) => d.deviceId)
        .map((d) => (
          <MicDeviceRow
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
        onClick={onOpenSettings}
        className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
        Audio settings…
      </button>
    </>
  );
}

function MicDeviceRow({
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
