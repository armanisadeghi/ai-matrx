/**
 * features/files/devices/DevicesSyncTab.tsx
 *
 * Settings → Devices & sync. Every machine signed in to this account, every
 * folder it syncs, and what is true about each right now.
 *
 * Champions: Dropbox's devices page for the bones (device → folders → status →
 * remote controls), Linear for density. The look is ours.
 *
 * Nothing here is mocked. With no mappings registered the list says so in
 * plain language and points at the one place a folder can be added — the
 * desktop app, where the picker and the OS permission prompt live.
 */

"use client";

import { HardDrive, Loader2, MonitorSmartphone, RefreshCw } from "lucide-react";
import { Button, TooltipProvider } from "@ai-matrx/design-system";

import { SettingsSubHeader } from "@/components/official/settings/layout/SettingsSubHeader";
import { SettingsCallout } from "@/components/official/settings/layout/SettingsCallout";
import { StorageQuotaChip } from "@/features/files/components/surfaces/desktop/StorageQuotaChip";

import { DeviceCard } from "./components/DeviceCard";
import { useDevicesAndSync } from "./useDevicesAndSync";

export function DevicesSyncTab() {
  const { devices, mappings, loading, error, liveStatus, refresh } =
    useDevicesAndSync();

  const mappingsByDevice = new Map<string, typeof mappings>();
  for (const mapping of mappings) {
    const list = mappingsByDevice.get(mapping.device_id) ?? [];
    list.push(mapping);
    mappingsByDevice.set(mapping.device_id, list);
  }
  // A mapping whose device row is gone still belongs to somebody's disk, so it
  // is shown rather than silently dropped.
  const orphaned = mappings.filter(
    (m) => !devices.some((d) => d.id === m.device_id),
  );

  return (
    <TooltipProvider delayDuration={250}>
      <div className="space-y-3">
        <SettingsSubHeader
          title="Devices & sync"
          description="The machines signed in to this account, the folders each one syncs, and what is happening with them right now."
          icon={MonitorSmartphone}
        />

        <div className="flex flex-wrap items-center gap-2">
          <StorageQuotaChip className="min-w-56" />
          <span className="flex-1" />
          {/* The fallback is announced, never silent (D9). */}
          {liveStatus === "polling" ? (
            <span className="text-[11px] text-amber-600 dark:text-amber-400">
              Live updates unavailable, checking every minute
            </span>
          ) : (
            <span className="text-[11px] text-muted-foreground">
              Live · updates appear as they happen
            </span>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={() => void refresh()}
            disabled={loading}
          >
            <RefreshCw
              className={loading ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"}
              aria-hidden="true"
            />
            <span className="ml-1">Refresh</span>
          </Button>
        </div>

        {error ? (
          <SettingsCallout tone="error">
            Your devices could not be read: {error}. Nothing has changed — try
            Refresh, and if it keeps failing the sync service is unreachable
            from this browser.
          </SettingsCallout>
        ) : null}

        {loading && devices.length === 0 ? (
          <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-6 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            Reading your devices…
          </div>
        ) : null}

        {!loading && devices.length === 0 && !error ? (
          <div className="rounded-md border border-border bg-card px-3 py-6 text-center">
            <HardDrive
              className="mx-auto h-5 w-5 text-muted-foreground"
              aria-hidden="true"
            />
            <p className="mt-2 text-sm font-medium text-foreground">
              No device has registered yet
            </p>
            <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
              Install Matrx Local on a computer and sign in. It registers itself
              here, and the folders you choose there appear on this page with
              their live status.
            </p>
          </div>
        ) : null}

        {devices.map((device) => (
          <DeviceCard
            key={device.id}
            device={device}
            mappings={mappingsByDevice.get(device.id) ?? []}
            onChanged={() => void refresh()}
          />
        ))}

        {orphaned.length > 0 ? (
          <SettingsCallout tone="warning">
            {orphaned.length} synced folder
            {orphaned.length === 1 ? "" : "s"} belong to a device that is no
            longer registered on this account. They stay listed until that
            device checks in or you remove them from it.
          </SettingsCallout>
        ) : null}
      </div>
    </TooltipProvider>
  );
}

export default DevicesSyncTab;
