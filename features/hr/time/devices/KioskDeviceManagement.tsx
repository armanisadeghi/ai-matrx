/**
 * features/hr/time/devices/KioskDeviceManagement.tsx — route 75a `/hr/settings/devices` (L3-72).
 *
 * 🚨 **THIS IS THE ONLY WAY THE KIOSK CAN BE OPERATED AT ALL.** SPEC-UI-IA §3.11 records that no
 * route owned kiosk device management before 75a was assigned, and *"the kiosk cannot be operated
 * without it"*: without this panel nobody can mint a pairing code, so no tablet can ever pair, and
 * nobody can revoke one, so a stolen tablet keeps punching.
 *
 * 🚨 **L3 OWNS THE PANELS; L1 OWNS THE ROUTE FILE.** `app/(core)/hr/settings/devices/page.tsx` and
 * its entry in the settings tab list are a **shared surface**, batched to lane L1 under EXECUTION
 * §3 — so they are deliberately not created here. This component is shaped to be mounted in one
 * line when they are:
 *
 *     <KioskDeviceManagement service={kioskDeviceService} />
 *
 * The `service` prop is not indirection for its own sake: the four RPCs it needs are **not in the
 * closed union** in `api/rpc.ts` and are not callable today. `contract.ts` names all four and who
 * owes them. Building the panels against an interface is what makes them wirable in one line rather
 * than rewritable.
 *
 * 🚨 **REVOCATION IS DESTRUCTIVE AND THE CONFIRMATION SAYS WHAT IT DOES.** Revoking bricks
 * `/kiosk/[deviceId]` at the next heartbeat or punch, whichever is first. An administrator pressing
 * it from a settings page has no way to know that unless it is written on the dialog, so it is.
 */

"use client";

import { useEffect, useState } from "react";

import { HrRpcError } from "@/features/hr/time/api/rpc";
import type { KioskDeviceRow } from "@/features/hr/time/api/types";

import type { KioskDeviceService } from "./contract";
import { KioskDeviceTable } from "./KioskDeviceTable";
import { KioskPairingCodePanel } from "./KioskPairingCodePanel";

export function KioskDeviceManagement({ service }: { service: KioskDeviceService }) {
  const [devices, setDevices] = useState<KioskDeviceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let live = true;
    setLoading(true);
    void service
      .list()
      .then((rows) => {
        if (!live) return;
        setDevices(rows);
        setRefusal(null);
      })
      .catch((cause: unknown) => {
        if (!live) return;
        // The server's own sentence, verbatim. An administrator who is told "something went wrong"
        // files a bug; one who is told which capability is missing goes and grants it.
        setRefusal(
          cause instanceof HrRpcError
            ? cause.userMessage
            : "We could not load this employer's time clocks. Try again in a moment.",
        );
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [service, reloadToken]);

  const reload = () => setReloadToken((n) => n + 1);

  return (
    <div className="flex flex-col gap-6">
      <KioskPairingCodePanel service={service} onRegistered={reload} />
      <KioskDeviceTable
        devices={devices}
        loading={loading}
        refusal={refusal}
        service={service}
        onChanged={reload}
      />
    </div>
  );
}
