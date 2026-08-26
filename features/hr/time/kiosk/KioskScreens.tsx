/**
 * features/hr/time/kiosk/KioskScreens.tsx — the kiosk's terminal and waiting states.
 *
 * Everything here obeys the same three constraints, which is why they live together:
 *   • **Plain language.** The reader is a warehouse worker at 5am, not an administrator. No codes,
 *     no state names, no "contact support".
 *   • **No door out.** These screens offer nothing to tap that leaves the kiosk (§2.8).
 *   • **They leak nothing.** Not whether a device exists, not whether a pairing code was real, not
 *     whether a PIN exists, not whose it is.
 */

"use client";

import { Ban, Clock, Loader2, ShieldQuestion } from "lucide-react";

/**
 * 🚨 **THE BRICK** (L3-69, §3.3). `suspended` or `revoked`. Full-screen, plain language, **no PIN
 * pad, no retry loop, no path anywhere else**. This screen is terminal by design: an administrator
 * who revokes a tablet has decided it must stop working, and a device that offers a "try again"
 * after revocation has not actually been revoked.
 *
 * Note what it does NOT say: not why, not who did it, not when, not whether the device was stolen.
 * The person reading it is usually an employee who just wants to clock in, and the only useful
 * thing they can do is tell a human.
 */
export function KioskBrickScreen() {
  return (
    <section className="flex flex-col items-center gap-6 text-center">
      <Ban className="size-16 text-muted-foreground" />
      <h1 className="text-4xl font-semibold text-foreground">
        This tablet is no longer in service.
      </h1>
      <p className="max-w-md text-xl text-muted-foreground">
        Please tell your manager. Use another way to clock in.
      </p>
    </section>
  );
}

/**
 * Paired, waiting for a human to trust it (§3.3). **No punching until trusted** — so there is no
 * PIN pad on this screen either. The device id is shown because an administrator standing at the
 * tablet needs to match it against the row they are about to trust; it identifies a *device*, not a
 * person, and it is useless to anyone without administrator standing.
 */
export function KioskAwaitingTrustScreen({ deviceId }: { deviceId: string | null }) {
  return (
    <section className="flex flex-col items-center gap-6 text-center">
      <ShieldQuestion className="size-16 text-muted-foreground" />
      <h1 className="text-4xl font-semibold text-foreground">
        Waiting for an administrator to trust this tablet.
      </h1>
      <p className="max-w-md text-xl text-muted-foreground">
        This tablet is paired. Nobody can clock in on it until an administrator approves it.
      </p>
      {deviceId && (
        <p className="rounded-lg border border-border bg-card px-4 py-2 font-mono text-base text-muted-foreground">
          {deviceId}
        </p>
      )}
      <p className="flex items-center gap-2 text-base text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        This screen updates on its own.
      </p>
    </section>
  );
}

/**
 * The secret did not work, or this organization's kiosk is switched off. One sentence, and it is
 * the *same* sentence for both causes — telling a stranger which one it was is telling them
 * whether a device id is real.
 */
export function KioskUnavailableScreen({ message }: { message: string }) {
  return (
    <section className="flex flex-col items-center gap-6 text-center">
      <Ban className="size-16 text-muted-foreground" />
      <h1 className="text-4xl font-semibold text-foreground">{message}</h1>
    </section>
  );
}

/**
 * 🚨 **OFFLINE IS A STATED PRODUCT LIMIT, NOT A SPINNER** (L3-71, §3.3, AD-10). Extended offline
 * queueing is deferred, so the tablet says exactly that: nothing was recorded, and a human needs to
 * know. The wording is verbatim from the spec because a softer sentence ("we'll try again later")
 * would be a promise the product does not keep.
 */
export function KioskOfflineScreen() {
  return (
    <section className="flex flex-col items-center gap-6 text-center">
      <Clock className="size-16 text-muted-foreground" />
      <h1 className="text-4xl font-semibold text-foreground">This tablet is offline.</h1>
      <p className="max-w-md text-xl text-muted-foreground">
        Your punch was not recorded. Tell your manager.
      </p>
    </section>
  );
}

/**
 * The skew refusal (§3.3). It names the **tablet's** fault, never the employee's — the person in
 * front of it did nothing wrong, and a message that reads like an accusation at 5am is a message
 * that gets a manager called for the wrong reason.
 */
export function KioskSkewRefusedScreen({ message }: { message: string }) {
  return (
    <section className="flex flex-col items-center gap-6 text-center">
      <Clock className="size-16 text-muted-foreground" />
      <h1 className="max-w-lg text-3xl font-semibold text-foreground">{message}</h1>
    </section>
  );
}
