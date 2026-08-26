/**
 * features/hr/time/kiosk/KioskPairingSurface.tsx — route 35 `/kiosk`.
 *
 * Pair this tablet to an employer, or resume a tablet that is already paired (§3.3, L3-66).
 *
 * 🚨 **THE FAILURE SENTENCE LEAKS NOTHING.** One sentence for every failure: code unknown, code
 * expired, code already claimed, kiosk disabled for the organization. The mock fixtures encode this
 * deliberately — `error` and `empty` are two different causes carrying the **same** `user_message` —
 * and a client that adds "that code has expired" hands an attacker an oracle for which codes were
 * ever real. The person who mistyped a code and the person guessing codes see the same screen.
 *
 * 🚨 **THE SECRET IS SHOWN ONCE AND IS NEVER RE-READABLE.** It is written to the device *before*
 * anything renders, and it is never displayed, logged or copied. If the write fails, pairing has
 * failed — the surface says so and asks for a new code, rather than proceeding to a punch screen
 * that will not authenticate after the next reboot.
 */

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { HrFixtureCase } from "@/features/hr/mock/transport";
import { claimKioskPairing } from "@/features/hr/time/api/service";

import { KioskAwaitingTrustScreen } from "./KioskScreens";
import {
  deviceFingerprint,
  readKioskDevice,
  writeKioskDevice,
  type KioskDeviceIdentity,
} from "./kioskDeviceStore";

/** The single sentence every failure renders. See the header for why it is one sentence. */
const PAIRING_FAILED = "That code did not work. Ask an administrator for a new pairing code.";

type PairingView =
  | { kind: "loading" }
  | { kind: "entry" }
  | { kind: "claiming" }
  | { kind: "awaiting-trust"; identity: KioskDeviceIdentity };

export function KioskPairingSurface({ mockCase }: { mockCase?: HrFixtureCase }) {
  const router = useRouter();
  const [view, setView] = useState<PairingView>({ kind: "loading" });
  const [code, setCode] = useState("");
  const [failure, setFailure] = useState<string | null>(null);

  // Resume: a tablet that is already paired goes straight to its punch surface. A wall device that
  // reboots must come back up punching without a human walking over to it.
  useEffect(() => {
    const stored = readKioskDevice();
    if (stored) {
      router.replace(`/kiosk/${stored.deviceId}`);
      return;
    }
    setView({ kind: "entry" });
  }, [router]);

  async function claim() {
    const trimmed = code.trim();
    if (!trimmed) return;

    setFailure(null);
    setView({ kind: "claiming" });
    try {
      const result = await claimKioskPairing(trimmed, deviceFingerprint(), { mockCase });
      const identity: KioskDeviceIdentity = {
        deviceId: result.deviceId,
        deviceSecret: result.deviceSecret,
        organizationDisplayName: result.organizationDisplayName,
        locationName: result.locationName,
      };

      // 🚨 Written FIRST. The secret does not come back a second time.
      if (!writeKioskDevice(identity)) {
        setFailure(
          "This tablet could not save its setup, so it cannot be used as a time clock. Ask an administrator for help.",
        );
        setView({ kind: "entry" });
        return;
      }

      setCode("");
      setView({ kind: "awaiting-trust", identity });
    } catch {
      // Every cause renders the same sentence. Deliberately.
      setFailure(PAIRING_FAILED);
      setView({ kind: "entry" });
    }
  }

  if (view.kind === "loading") {
    return (
      <div className="flex justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (view.kind === "awaiting-trust") {
    return <KioskAwaitingTrustScreen deviceId={view.identity.deviceId} />;
  }

  return (
    <section className="flex flex-col items-center gap-8">
      <div className="flex flex-col items-center gap-3 text-center">
        <h1 className="text-4xl font-semibold text-foreground">Set up this tablet</h1>
        <p className="max-w-md text-xl text-muted-foreground">
          Enter the pairing code an administrator gave you.
        </p>
      </div>

      <div className="flex w-full max-w-md flex-col gap-4">
        <Input
          value={code}
          onChange={(event) => setCode(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void claim();
          }}
          placeholder="Pairing code"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          aria-label="Pairing code"
          className="min-h-[72px] text-center text-2xl tracking-widest"
        />

        {failure && (
          <p className="text-center text-lg text-foreground" role="alert">
            {failure}
          </p>
        )}

        <Button
          type="button"
          disabled={view.kind === "claiming" || code.trim() === ""}
          onClick={() => void claim()}
          className="min-h-[72px] text-xl font-semibold"
        >
          {view.kind === "claiming" ? <Loader2 className="size-6 animate-spin" /> : "Pair this tablet"}
        </Button>
      </div>
    </section>
  );
}
