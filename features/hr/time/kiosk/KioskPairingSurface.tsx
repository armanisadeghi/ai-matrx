/**
 * features/hr/time/kiosk/KioskPairingSurface.tsx — route 35 `/kiosk` (L3-66, SPEC-TIME §3.3).
 *
 * One job: turn a one-time pairing code an administrator generated in `/hr/settings/devices` into a
 * device identity this tablet keeps. Then it gets out of the way — route 36 owns everything after.
 *
 * 🚨 **THE FAILURE SENTENCE LEAKS NOTHING** (§3.3, L3-66). Not whether the code existed, not whether
 * it expired, not whether it was already claimed, not whether the organisation has the kiosk turned
 * on. The server already answers all four with one sentence on purpose — *"That code did not work.
 * Ask an administrator for a new pairing code."* — and this component renders **that sentence,
 * verbatim**, adding no detail of its own. Distinguishing the four cases here would turn a pairing
 * screen into an oracle for guessing valid codes.
 *
 * 🚨 **THE SECRET IS STORED IMMEDIATELY AND NEVER DISPLAYED.** It is returned exactly once. See
 * `deviceIdentity.ts`. A storage refusal is rendered as a sentence, because a tablet that cannot
 * remember its secret is a tablet that must be re-paired after the next reload — and the person
 * setting it up needs to know while they are still standing in front of it.
 *
 * 🚨 **No doors out** (L3-65). No login link, no HR link, no "contact support".
 */

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Tablet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { HrFixtureCase } from "@/features/hr/mock/transport";
import { HrRpcError } from "@/features/hr/time/api/rpc";
import { claimKioskPairing } from "@/features/hr/time/api/service";

import { kioskDeviceFingerprint, readKioskIdentity, storeKioskIdentity } from "./deviceIdentity";
import { KioskFrame } from "./KioskFrame";

export function KioskPairingSurface({ mockCase }: { mockCase?: HrFixtureCase }) {
  const router = useRouter();
  const [resolved, setResolved] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  // A tablet that already knows itself never shows a pairing screen — it resumes (§3.3, branch B).
  useEffect(() => {
    const identity = readKioskIdentity();
    if (identity) {
      router.replace(`/kiosk/${identity.deviceId}`);
      return;
    }
    setResolved(true);
  }, [router]);

  async function pair() {
    const trimmed = code.trim();
    if (!trimmed || busy) return;

    setBusy(true);
    setRefusal(null);
    try {
      const result = await claimKioskPairing(trimmed, kioskDeviceFingerprint(), { mockCase });
      // 🚨 First. Before rendering, before navigating. The secret is never offered again.
      const stored = storeKioskIdentity({
        deviceId: result.deviceId,
        deviceSecret: result.deviceSecret,
        organizationDisplayName: result.organizationDisplayName,
        locationName: result.locationName,
        pairedAt: new Date().toISOString(),
      });
      if (!stored) {
        setRefusal(
          "This tablet's browser will not save anything, so it cannot stay paired. Turn off " +
            "private browsing, or allow this site to store data, and pair it again.",
        );
        return;
      }
      router.replace(`/kiosk/${result.deviceId}`);
    } catch (cause: unknown) {
      // The server's sentence, verbatim. Nothing is added and no case is distinguished.
      setRefusal(
        cause instanceof HrRpcError
          ? cause.userMessage
          : "This tablet cannot reach the time clock right now. Try again in a moment.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!resolved) {
    return (
      <KioskFrame>
        <div className="flex items-center justify-center">
          <Loader2 className="size-10 animate-spin text-muted-foreground" />
        </div>
      </KioskFrame>
    );
  }

  return (
    <KioskFrame>
      <div className="flex flex-col items-center gap-8">
        <Tablet className="size-16 text-muted-foreground" />
        <div className="flex flex-col items-center gap-2 text-center">
          <h1 className="text-4xl font-semibold text-foreground">Set up this time clock</h1>
          <p className="max-w-xl text-xl text-muted-foreground">
            Enter the pairing code an administrator generated for this tablet.
          </p>
        </div>

        <div className="flex w-full max-w-md flex-col gap-4">
          <label htmlFor="kiosk-pairing-code" className="sr-only">
            Pairing code
          </label>
          <Input
            id="kiosk-pairing-code"
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            onKeyDown={(event) => {
              if (event.key === "Enter") void pair();
            }}
            placeholder="Pairing code"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            disabled={busy}
            className="min-h-[80px] text-center text-3xl tracking-[0.3em] tabular-nums"
          />
          <Button
            type="button"
            size="lg"
            disabled={busy || code.trim().length === 0}
            onClick={() => void pair()}
            className="min-h-[80px] gap-3 text-2xl font-semibold"
          >
            {busy && <Loader2 className="size-7 animate-spin" />}
            Set up this tablet
          </Button>
        </div>

        {refusal && (
          <p className="max-w-xl text-center text-xl text-foreground">{refusal}</p>
        )}
      </div>
    </KioskFrame>
  );
}
