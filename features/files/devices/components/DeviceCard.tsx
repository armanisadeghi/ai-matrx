/**
 * features/files/devices/components/DeviceCard.tsx
 *
 * One device and the folders it syncs. Dropbox's device page bones: name,
 * platform, version, last heard from, then the folders underneath.
 *
 * "Silent since" is DERIVED from `app_instances.last_seen` staleness, because
 * C14 deliberately gives devices no sign-in column: the session states live on
 * the mapping rows, and a device that stopped heartbeating tells us only that
 * it stopped heartbeating — so that is exactly what the card says.
 */

"use client";

import { Apple, Laptop, Monitor, MonitorSmartphone } from "lucide-react";
import { Badge } from "@ai-matrx/design-system";

import { cn } from "@/lib/utils";

import { HomeConnectionRow } from "@/features/residential-egress/components/HomeConnectionRow";
import type { EgressDeviceRow } from "@/features/residential-egress/types";

import { DEVICE_SILENT_AFTER_MS } from "../honest-states";
import { useNow } from "../useNow";
import type { DeviceRow, SyncMappingRow } from "../types";
import { MappingRow } from "./MappingRow";

/** Rendered as a component, never assigned to a variable during render. */
function PlatformIcon({ platform }: { platform: string | null }) {
  const value = (platform ?? "").toLowerCase();
  const className = "h-4 w-4 shrink-0 text-muted-foreground";
  if (value.includes("darwin") || value.includes("mac"))
    return <Apple className={className} aria-hidden="true" />;
  if (value.includes("win"))
    return <Monitor className={className} aria-hidden="true" />;
  if (value.includes("linux"))
    return <Laptop className={className} aria-hidden="true" />;
  return <MonitorSmartphone className={className} aria-hidden="true" />;
}

function platformLabel(platform: string | null): string {
  const value = (platform ?? "").toLowerCase();
  if (value.includes("darwin") || value.includes("mac")) return "macOS";
  if (value.includes("win")) return "Windows";
  if (value.includes("linux")) return "Linux";
  return platform ?? "Unknown platform";
}

function sinceLabel(iso: string | null, now: number): string {
  if (!iso) return "never";
  const delta = now - new Date(iso).getTime();
  const minutes = Math.round(delta / 60_000);
  if (minutes < 1) return "moments ago";
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hours ago`;
  return `${Math.round(hours / 24)} days ago`;
}

export function DeviceCard({
  device,
  mappings,
  homeConnection,
  homeConnectionError,
  onHomeConnectionChanged,
  onChanged,
}: {
  device: DeviceRow;
  mappings: SyncMappingRow[];
  /**
   * This computer's home connection row (`platform.egress_device` matched by
   * `app_instance_id`), or null when it is not lending its connection. The
   * card owns the pairing so the two facts about ONE computer live together
   * rather than in two lists a person has to reconcile.
   */
  homeConnection?: EgressDeviceRow | null;
  /** The home-connection read's error, when there is one. Never rendered as "Not set up". */
  homeConnectionError?: string | null;
  onHomeConnectionChanged?: () => void;
  onChanged: () => void;
}) {
  const now = useNow();
  const lastSeenMs = device.last_seen ? new Date(device.last_seen).getTime() : 0;
  const silent = !lastSeenMs || now - lastSeenMs > DEVICE_SILENT_AFTER_MS;
  const name = device.instance_name?.trim() || "Unnamed device";

  // A mapping row is where the session states live (C14), so "this device
  // needs to sign in again" is read off its own mappings, never invented.
  const needsSignIn = mappings.some(
    (m) => m.state === "sign_in_needed" || m.state === "signed_out",
  );

  return (
    <section className="rounded-md border border-border bg-card">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
        <PlatformIcon platform={device.platform} />
        <span className="font-medium text-foreground">{name}</span>
        <span className="text-xs text-muted-foreground">
          {platformLabel(device.platform)}
          {device.app_version ? ` · AI Matrx ${device.app_version}` : ""}
        </span>
        <span className="flex-1" />
        <Badge
          variant="outline"
          className={cn(
            "h-4 px-1.5 text-[10px]",
            silent
              ? "border-amber-500/50 text-amber-600 dark:text-amber-400"
              : "border-primary/40 text-primary",
          )}
        >
          {silent
            ? `Silent since ${sinceLabel(device.last_seen, now)}`
            : `Active · heard from ${sinceLabel(device.last_seen, now)}`}
        </Badge>
      </header>

      {silent ? (
        <p className="border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground">
          This device has not checked in recently. Anything you change here is
          saved and takes effect the next time it comes online.
        </p>
      ) : null}
      {needsSignIn ? (
        <p className="border-t border-destructive/30 bg-destructive/5 px-3 py-1.5 text-[11px] font-medium text-destructive">
          This device needs to sign in again before it can sync. Open AI Matrx
          on {name} and sign in.
        </p>
      ) : null}

      <HomeConnectionRow
        device={homeConnection ?? null}
        deviceName={name}
        readError={homeConnectionError ?? null}
        onChanged={() => onHomeConnectionChanged?.()}
      />

      {mappings.length === 0 ? (
        <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
          No folders are synced on this device yet. Add one in AI Matrx on{" "}
          {name} — folders are chosen there, where the file picker and the
          permission prompt live.
        </p>
      ) : (
        <div>
          {mappings.map((mapping) => (
            <MappingRow
              key={mapping.id}
              mapping={mapping}
              deviceName={name}
              now={now}
              onChanged={onChanged}
            />
          ))}
        </div>
      )}
    </section>
  );
}
