/**
 * features/hr/time/devices/PairingCodePanel.tsx — generating a one-time pairing code.
 *
 * 🚨 **THE CODE IS SHOWN ONCE.** Only its hash is stored (U-09's owed `pairing_code_hash`), so there
 * is no "show it again" and this panel says so **before** the administrator walks away from the
 * screen. An administrator who closes this without writing the code down generates a new one; that
 * is the correct outcome and it is cheap. A code that could be re-read would be a code sitting in a
 * settings page forever, which is a pairing credential with no expiry in practice.
 *
 * 🚨 **THE CODE IS NOT THE DEVICE'S AUTHORITY.** Claiming it mints a device secret and leaves the
 * device `pending` — an administrator still has to trust it (§3.3). So a leaked pairing code buys an
 * attacker a tablet that sits on a "waiting to be approved" screen, which is the whole point of the
 * two-step.
 */

"use client";

import { useState } from "react";
import { Check, Copy, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/lib/toast";

import type { KioskDeviceAdminSource, KioskPairingCode } from "./deviceAdminSource";

export function PairingCodeDialogBody({
  source,
  onClose,
}: {
  source: KioskDeviceAdminSource;
  onClose: () => void;
}) {
  const [deviceName, setDeviceName] = useState("");
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<KioskPairingCode | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    const name = deviceName.trim();
    if (!name || busy) return;
    setBusy(true);
    setError(null);
    try {
      setIssued(await source.createPairingCode({ deviceName: name, locationId: null }));
    } catch (cause: unknown) {
      setError(
        cause instanceof Error ? cause.message : "We could not generate a pairing code just now.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (issued) {
    return (
      <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5">
        <div className="flex flex-col gap-1">
          <h3 className="text-base font-semibold text-foreground">
            Type this code into the tablet
          </h3>
          {/* Said before they walk away, not after. */}
          <p className="text-sm text-muted-foreground">
            Open <span className="font-medium text-foreground">/kiosk</span> on the tablet and enter
            this code. It is shown once — if you lose it, generate another.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <code className="rounded-lg border border-border bg-muted/40 px-5 py-3 text-2xl font-semibold tracking-widest text-foreground">
            {issued.code}
          </code>
          <Button
            type="button"
            variant="outline"
            className="min-h-[44px] gap-2"
            onClick={() => {
              void navigator.clipboard
                .writeText(issued.code)
                .then(() => toast.success("Pairing code copied"))
                .catch(() => toast.error("This browser would not let us copy the code"));
            }}
          >
            <Copy className="size-4" />
            Copy
          </Button>
        </div>

        <p className="text-sm text-muted-foreground">
          The tablet will wait for you to approve it before anyone can clock in on it.
        </p>

        <Button type="button" onClick={onClose} className="min-h-[44px] w-fit gap-2">
          <Check className="size-4" />
          Done
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5">
      <div className="flex flex-col gap-1">
        <h3 className="text-base font-semibold text-foreground">Pair a new tablet</h3>
        <p className="text-sm text-muted-foreground">
          Name it something a person would recognise from across the room.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-56 flex-1 flex-col gap-1">
          <label htmlFor="hr-device-name" className="text-sm font-medium text-foreground">
            Tablet name
          </label>
          <Input
            id="hr-device-name"
            value={deviceName}
            onChange={(event) => setDeviceName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void generate();
            }}
            placeholder="Break room tablet"
            className="min-h-[44px] text-base"
          />
        </div>
        <Button
          type="button"
          disabled={busy || deviceName.trim() === ""}
          onClick={() => void generate()}
          className="min-h-[44px] gap-2"
        >
          {busy && <Loader2 className="size-4 animate-spin" />}
          Generate code
        </Button>
        <Button type="button" variant="ghost" onClick={onClose} className="min-h-[44px]">
          Cancel
        </Button>
      </div>

      {error && <p className="text-sm text-foreground">{error}</p>}
    </div>
  );
}
