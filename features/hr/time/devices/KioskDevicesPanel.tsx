/**
 * features/hr/time/devices/KioskDevicesPanel.tsx — route 75a `/hr/settings/devices` (L3-72, U-08).
 *
 * 🚨 **THE ROUTE FILE IS NOT THIS LANE'S.** Per the EXECUTION §3 shared-surface rule, the page at
 * `app/(core)/hr/settings/devices/page.tsx` and its settings-tab entry are **batched to lane L1**,
 * because `/hr/settings` is one shell with one tab strip and three lanes adding tabs to it
 * independently is how a tab strip ends up with three different layouts. This component is the
 * whole of L3's half, and it is deliberately shaped so L1's page is one line:
 *
 * ```tsx
 * <KioskDevicesPanel source={...} />
 * ```
 *
 * 🚨 **THE KIOSK CANNOT BE OPERATED WITHOUT THIS SURFACE.** R-L3 U-08 found that nobody owned it:
 * SPEC-TIME §3.3 says pairing codes are generated, devices trusted and devices revoked *"in
 * `/hr/settings`"*, and SPEC-UI-IA §3.11's routes 67–81 contained no device route. A tablet that
 * pairs and can never be trusted is a tablet that never punches.
 */

"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { KioskDeviceRow } from "@/features/hr/time/api/types";

import { DeviceFleetTable } from "./DeviceFleetTable";
import { PairingCodeDialogBody } from "./PairingCodePanel";
import type { KioskDeviceAdminSource } from "./deviceAdminSource";

export function KioskDevicesPanel({ source }: { source: KioskDeviceAdminSource }) {
  const [rows, setRows] = useState<KioskDeviceRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pairing, setPairing] = useState(false);

  function load() {
    setError(null);
    source
      .list()
      .then(setRows)
      .catch((cause: unknown) => {
        setError(
          cause instanceof Error
            ? cause.message
            : "We could not load this organization's time clocks.",
        );
      });
  }

  useEffect(load, [source]);

  return (
    <section className="flex flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold text-foreground">Time clock tablets</h2>
          <p className="text-sm text-muted-foreground">
            Pair a tablet, approve it, and revoke it. Revoking stops a tablet from recording time
            within a minute, wherever it is.
          </p>
        </div>
        <Button
          type="button"
          onClick={() => setPairing((open) => !open)}
          className="min-h-[44px] gap-2"
        >
          <Plus className="size-4" />
          Pair a tablet
        </Button>
      </header>

      {pairing && (
        <PairingCodeDialogBody
          source={source}
          onClose={() => {
            setPairing(false);
            load();
          }}
        />
      )}

      {error && (
        <p className="rounded-lg border border-destructive/40 bg-card p-4 text-sm text-foreground">
          {error}
        </p>
      )}

      {rows === null && !error && (
        <div className="flex min-h-32 items-center justify-center rounded-lg border border-border bg-card">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {rows !== null && rows.length === 0 && (
        // An explicit sentence, never an empty grid.
        <p className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
          No tablets are set up yet. Pair one to let people clock in on a shared screen.
        </p>
      )}

      {rows !== null && rows.length > 0 && (
        <DeviceFleetTable rows={rows} source={source} onChanged={load} />
      )}
    </section>
  );
}
