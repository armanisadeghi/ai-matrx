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

import { HomeConnectionRow } from "@/features/residential-egress/components/HomeConnectionRow";
import { useHomeConnections } from "@/features/residential-egress/hooks/useHomeConnections";
import { useHomeConnectionFocus } from "@/features/residential-egress/hooks/useHomeConnectionFocus";

import { DeviceCard } from "./components/DeviceCard";
import {
  SyncStorageMeters,
  owningOrganizationIds,
} from "./components/SyncStorageMeters";
import { useDevicesAndSync } from "./useDevicesAndSync";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { asClause } from "@/lib/text/asClause";

export function DevicesSyncTab() {
  const { devices, mappings, loading, error, liveStatus, refresh } =
    useDevicesAndSync();
  // Home connections are a SECOND list over the same computers, so they are
  // read once here and handed down — never re-read per card.
  const home = useHomeConnections();
  // `?computer=<id>` — the helper's tray menu names one computer; this page
  // scrolls to it and rings it once, so the link lands on the row rather than
  // on a list of rows.
  const focus = useHomeConnectionFocus(
    home.devices.map((d) => d.id).join(","),
    !loading && !home.loading,
  );
  const focusRing =
    "rounded-md ring-2 ring-primary ring-offset-2 ring-offset-background transition-shadow";

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

  // A computer that runs ONLY the standalone helper never registered an
  // app_instances row, so no device card can carry it. It is still one of the
  // person's computers, so it gets its own list rather than vanishing.
  const knownAppInstanceIds = new Set(devices.map((d) => d.id));
  const otherComputers = home.unmatched(knownAppInstanceIds);

  return (
    <TooltipProvider delayDuration={250}>
      <div className="space-y-3">
        <SettingsSubHeader
          title="Devices & sync"
          description="The machines signed in to this account, the folders each one syncs, and what is happening with them right now."
          icon={MonitorSmartphone}
        />

        <div className="flex flex-wrap items-center gap-2">
          <SyncStorageMeters
            organizationIds={owningOrganizationIds(mappings)}
            className="min-w-64"
          />
          <span className="flex-1" />
          {/* The fallback is announced, never silent (D9). */}
          {/* Two channels feed this page now; the slower one sets the sentence,
              because "Live" while half the page is polling would be a lie. */}
          {liveStatus === "polling" || home.liveStatus === "polling" ? (
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
            Your devices could not be read: {asClause(error)}. Nothing has changed — try
            Refresh, and if it keeps failing the sync service is unreachable
            from this browser.
            <ErrorAlchemyMenu error={error} />
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

        {devices.map((device) => {
          const homeConnection = home.byAppInstanceId.get(device.id) ?? null;
          // The focus id is the home connection's id (what the helper knows
          // itself by), not the device card's — a computer card with no home
          // connection simply never matches.
          return (
            <div
              key={device.id}
              ref={homeConnection ? focus.register(homeConnection.id) : undefined}
              className={
                homeConnection && focus.highlighted === homeConnection.id
                  ? focusRing
                  : undefined
              }
            >
              <DeviceCard
                device={device}
                mappings={mappingsByDevice.get(device.id) ?? []}
                homeConnection={homeConnection}
                homeConnectionError={home.error}
                onHomeConnectionChanged={() => void home.refresh()}
                onChanged={() => void refresh()}
              />
            </div>
          );
        })}

        {otherComputers.length > 0 ? (
          <section className="rounded-md border border-border bg-card">
            <header className="px-3 py-2">
              <span className="font-medium text-foreground">
                Other computers
              </span>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                These lend AI Matrx their internet connection but do not sync
                folders — they are running the small Home Connection helper
                rather than the full desktop app.
              </p>
            </header>
            {otherComputers.map((computer) => (
              <div
                key={computer.id}
                ref={focus.register(computer.id)}
                className={
                  focus.highlighted === computer.id ? focusRing : undefined
                }
              >
                <HomeConnectionRow
                  device={computer}
                  deviceName={computer.display_name}
                  showName
                  onChanged={() => void home.refresh()}
                />
              </div>
            ))}
          </section>
        ) : null}

        {/* A link that named a computer this list does not have says so —
            silence would leave the person hunting a card that is not here. */}
        {focus.requested &&
        !loading &&
        !home.loading &&
        !home.devices.some((d) => d.id === focus.requested) ? (
          <p className="text-[11px] text-muted-foreground">
            The computer that link pointed at is not on this list. It may have
            been removed from your account, or signed in under a different one.
          </p>
        ) : null}

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
