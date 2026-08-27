/**
 * features/hr/time/devices/KioskPairingCodePanel.tsx — minting a pairing code (L3-72, §3.3).
 *
 * 🚨 **THE CODE IS SHOWN ONCE AND THE PANEL SAYS SO BEFORE IT IS DISMISSED.** It is a one-time
 * credential: it pairs exactly one tablet, and once claimed it is spent. An administrator who
 * closes this card without writing it down has to mint another — which is fine, and much better
 * than a code that stays readable in a settings page forever for anyone with access to it.
 *
 * 🚨 **THE EXPIRY IS RENDERED, NOT ASSUMED.** `pairingCodeExpiresAt` comes from the server (the
 * `kiosk_pairing_code_ttl` knob decides it). Nothing here computes a TTL, and there is no constant
 * to drift: an admin walking a code to a tablet on the other side of a building needs to know
 * whether they have ten minutes or a day, and the only honest source for that is the server.
 *
 * 🚨 **A NEW DEVICE IS BORN `pending`.** Minting a code does not trust anything — the tablet claims
 * it, then sits on *"waiting for an administrator to approve this tablet"* until somebody uses the
 * trust control in `KioskDeviceTable`. The panel says that here so nobody walks away expecting a
 * working clock.
 */

"use client";

import { useState } from "react";
import { Loader2, Plus, Tablet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HrRpcError } from "@/features/hr/time/api/rpc";

import type { KioskDeviceService, KioskPairingCodeIssued } from "./contract";
import { formatDeviceInstant } from "./deviceFormat";

export function KioskPairingCodePanel({
  service,
  onRegistered,
}: {
  service: KioskDeviceService;
  onRegistered: () => void;
}) {
  const [deviceName, setDeviceName] = useState("");
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<KioskPairingCodeIssued | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);

  async function register() {
    const name = deviceName.trim();
    if (!name || busy) return;
    setBusy(true);
    setRefusal(null);
    try {
      const result = await service.register({ deviceName: name, locationId: null });
      setIssued(result);
      setDeviceName("");
      onRegistered();
    } catch (cause: unknown) {
      setRefusal(
        cause instanceof HrRpcError
          ? cause.userMessage
          : "We could not create a pairing code. Try again in a moment.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
      <header className="flex items-start gap-3">
        <Tablet className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold text-foreground">Add a time clock tablet</h2>
          <p className="text-sm text-muted-foreground">
            Name the tablet, then take the code it gives you to that tablet and open{" "}
            <span className="font-medium text-foreground">/kiosk</span> on it. The tablet cannot
            record any punches until you approve it below.
          </p>
        </div>
      </header>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-64 flex-1 flex-col gap-2">
          <Label htmlFor="hr-kiosk-device-name">Where is this tablet?</Label>
          <Input
            id="hr-kiosk-device-name"
            value={deviceName}
            onChange={(event) => setDeviceName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void register();
            }}
            placeholder="Kitchen entrance, Fremont"
            className="min-h-11 text-base"
          />
        </div>
        <Button
          type="button"
          disabled={busy || deviceName.trim() === ""}
          onClick={() => void register()}
          className="min-h-11 gap-2"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          Create pairing code
        </Button>
      </div>

      {refusal && <p className="text-sm text-foreground">{refusal}</p>}

      {issued && (
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/40 p-4">
          <p className="text-sm text-muted-foreground">
            Pairing code for{" "}
            <span className="font-medium text-foreground">{issued.deviceName}</span>
          </p>
          {/* Selectable so it can be copied, and large so it can be read off a laptop across a room. */}
          <p className="select-all text-4xl font-semibold tracking-[0.25em] tabular-nums text-foreground">
            {issued.pairingCode}
          </p>
          <p className="text-sm text-foreground">
            {/* 🚨 Said plainly, while the code is still on screen. */}
            Write this down now — it is shown once and cannot be looked up again.
          </p>
          <p className="text-sm text-muted-foreground">
            It stops working {formatDeviceInstant(issued.pairingCodeExpiresAt)}. After the tablet
            claims it, approve the tablet below before anyone tries to punch on it.
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => setIssued(null)}
            className="min-h-11 w-fit"
          >
            I have written it down
          </Button>
        </div>
      )}
    </section>
  );
}
