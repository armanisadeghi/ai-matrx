/**
 * features/files/devices/platform.tsx — how a device's platform and last check-in read, everywhere
 * a device is shown (the Devices & sync card, the /devices list, the device console). One copy.
 */

"use client";

import { Apple, Laptop, Monitor, MonitorSmartphone } from "lucide-react";
import { formatRelativeTime } from "@ai-matrx/kit/format";

/** Rendered as a component, never assigned to a variable during render. */
export function PlatformIcon({ platform, className }: { platform: string | null; className?: string }) {
  const value = (platform ?? "").toLowerCase();
  const cls = className ?? "h-4 w-4 shrink-0 text-muted-foreground";
  if (value.includes("darwin") || value.includes("mac")) return <Apple className={cls} aria-hidden="true" />;
  if (value.includes("win")) return <Monitor className={cls} aria-hidden="true" />;
  if (value.includes("linux")) return <Laptop className={cls} aria-hidden="true" />;
  return <MonitorSmartphone className={cls} aria-hidden="true" />;
}

export function platformLabel(platform: string | null): string {
  const value = (platform ?? "").toLowerCase();
  if (value.includes("darwin") || value.includes("mac")) return "macOS";
  if (value.includes("win")) return "Windows";
  if (value.includes("linux")) return "Linux";
  return platform ?? "Unknown platform";
}

/** "5 minutes ago" — the kit's long voice, one formatter platform-wide; "never" for no check-in. */
export function sinceLabel(iso: string | null, now: number): string {
  if (!iso) return "never";
  return formatRelativeTime(iso, { style: "long", now });
}
