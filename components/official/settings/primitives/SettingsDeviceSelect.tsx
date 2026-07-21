"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SettingsRow } from "../SettingsRow";
import type { MediaDeviceDescriptor } from "@/features/media-devices/deviceManager";
import type { SettingsCommonProps, SettingsControlSize } from "../types";

type Width = "auto" | "sm" | "md" | "lg" | "full";

const widthClass: Record<Width, string> = {
  auto: "w-auto min-w-32",
  sm: "w-32",
  md: "w-44",
  lg: "w-64",
  full: "w-full",
};

const triggerSize: Record<SettingsControlSize, "sm" | "default" | "lg"> = {
  sm: "sm",
  md: "default",
  lg: "lg",
};

/** Sentinel for the "no explicit choice" option — never a real deviceId. */
const DEFAULT_SENTINEL = "__system_default__";

export type SettingsDeviceSelectProps = SettingsCommonProps & {
  /** Live device list from the media-device manager snapshot. */
  devices: MediaDeviceDescriptor[];
  /** Resolved live deviceId of the current choice ("" = default/auto). */
  selectedId: string;
  /** Fired with BOTH the deviceId and its label ("" + "" = default/auto) —
   *  labels are persisted alongside ids because iOS Safari regenerates
   *  deviceIds per page load (resolve is id → label → default). */
  onSelect: (deviceId: string, label: string) => void;
  /** Label for the "no explicit choice" option (default "System default"). */
  defaultOptionLabel?: string;
  /** Fallback label prefix for devices whose label is blank (pre-grant),
   *  e.g. "Microphone" → "Microphone (a1b2c3)". */
  deviceKindLabel: string;
  size?: SettingsControlSize;
  width?: Width;
  /** Renders as a stacked layout. Use when the select should span full width. */
  stacked?: boolean;
  last?: boolean;
};

/**
 * A settings row whose control is a LIVE media-device picker (microphone,
 * speaker, or camera). Unlike `SettingsSelect`, its options come from a live
 * `enumerateDevices` snapshot and its change event carries the (id, label)
 * PAIR the device-preference model persists. Blank labels (permission not yet
 * granted) fall back to `deviceKindLabel (idPrefix)`.
 */
export function SettingsDeviceSelect({
  devices,
  selectedId,
  onSelect,
  defaultOptionLabel = "System default",
  deviceKindLabel,
  size = "md",
  width = "md",
  stacked,
  last,
  ...rowProps
}: SettingsDeviceSelectProps) {
  const id =
    rowProps.id ??
    `settings-${rowProps.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  const variant = stacked ? "stacked" : "inline";
  const effectiveWidth: Width = stacked ? "full" : width;

  const optionLabel = (d: MediaDeviceDescriptor): string => {
    if (d.label) return d.label;
    const short = d.deviceId ? d.deviceId.slice(0, 6) : "unknown";
    return `${deviceKindLabel} (${short})`;
  };

  return (
    <SettingsRow {...rowProps} id={id} variant={variant} last={last}>
      <Select
        value={selectedId || DEFAULT_SENTINEL}
        onValueChange={(v) => {
          if (v === DEFAULT_SENTINEL) {
            onSelect("", "");
            return;
          }
          const dev = devices.find((d) => d.deviceId === v);
          onSelect(v, dev?.label ?? "");
        }}
        disabled={rowProps.disabled}
      >
        <SelectTrigger
          id={id}
          size={triggerSize[size]}
          className={widthClass[effectiveWidth]}
        >
          <SelectValue placeholder={defaultOptionLabel} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={DEFAULT_SENTINEL}>{defaultOptionLabel}</SelectItem>
          {devices.map((d) => (
            <SelectItem key={d.deviceId || "default-device"} value={d.deviceId}>
              {optionLabel(d)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </SettingsRow>
  );
}
