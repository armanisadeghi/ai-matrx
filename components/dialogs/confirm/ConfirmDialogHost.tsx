/**
 * components/dialogs/confirm/ConfirmDialogHost.tsx — HOST WIRING for the
 * global confirm dialog, which is TWO packages on purpose (2026-09-07):
 * `@ai-matrx/kit/confirm-opener` owns the imperative `confirm()` and its
 * registry; `@ai-matrx/design-system` owns the dialog BODY, because the surface
 * needs that package's AlertDialog, motion layer and overlay scrim token. kit's
 * old `./confirm` — a second inlined AlertDialog wearing `tw-animate-css`
 * utilities and a hardcoded opaque black scrim — is gone.
 *
 * Slim client shell + public entry point for the global confirm dialog.
 * Statically importable from anywhere — it does NOT pull the dialog body,
 * radix-alert-dialog, or the host state machinery into the static graph of
 * route entries that mount it: the imperative API comes from the kit's pure
 * `confirm-opener` entry (zero React, zero dialog markup), and the heavy
 * host loads via `next/dynamic({ ssr: false })` from `@ai-matrx/design-system`.
 * The two packages share ONE opener state by construction (a `Symbol.for`
 * globalThis slot inside kit, which design-system's host registers into).
 *
 * Render `<ConfirmDialogHost />` once, near the root of every provider tree
 * (Providers, EntityProviders, PublicProviders) so the imperative
 * `confirm()` always has a live host to dispatch to once the page hydrates.
 * Pre-hydration calls queue inside the package and resolve as soon as the
 * host registers.
 */

"use client";

import dynamic from "next/dynamic";
import {
  confirm as openConfirm,
  confirmOpener,
  type ConfirmOptions,
} from "@ai-matrx/kit/confirm-opener";

import { afterCurrentLayerCloses } from "./after-current-layer-closes";
import { useBodyPointerEventsGuard } from "./body-pointer-events-guard";

export type { ConfirmOptions } from "@ai-matrx/kit/confirm-opener";

/**
 * The host arrives via `next/dynamic({ ssr: false })`, so an early call can
 * legitimately precede it. This is generous enough to cover hydration plus the
 * chunk fetch, and short enough that a page with NO host mounted reports the
 * fact instead of leaving the caller pending forever.
 */
export const CONFIRM_HOST_WAIT_MS = 5000;

/**
 * ONE question: is a host actually alive to show this dialog? The package
 * answers it (kit 0.10.0). This used to reach into the opener's `Symbol.for`
 * globalThis slot and read its private `{ host }` shape — host code guessing
 * at package internals, which breaks silently the day the shape changes.
 */
function confirmHostIsRegistered(): boolean {
  return confirmOpener._hasHost();
}

async function waitForConfirmHost(timeoutMs: number): Promise<boolean> {
  if (confirmHostIsRegistered()) return true;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
    if (confirmHostIsRegistered()) return true;
  }
  return false;
}

/**
 * 🚨 A CONFIRM THAT CANNOT BE SHOWN SAYS SO ITSELF (FIX-11A/F7, 2026-09-22).
 *
 * This used to THROW, on the stated assumption that "the caller's own error
 * handling surfaces it". Measured against the tree, that assumption is false
 * at every site that matters: the ordinary shape of a confirm-gated control is
 *
 *     onClick={() => void (async () => { const ok = await confirm({...}); ... })()}
 *
 * — a FLOATING promise. A rejection out of that reaches no `catch`, raises no
 * toast, and prints nothing a person can see: it becomes an unhandled
 * rejection and the button is, to the person pressing it, dead. That is the
 * one shape law 4 forbids outright, and the census below counts 333 call sites
 * in this repo standing in it.
 *
 * So the primitive now does what law 4 requires of every stand-in: it
 * ANNOUNCES ITSELF WITH A REMEDY and resolves `false`. `false` is exactly what
 * every caller already handles — `if (!ok) return;` — so nothing is performed,
 * and the person is told why in a sentence instead of being handed a button
 * that does nothing. Guard: `pnpm check:confirm-never-vanishes`.
 */
async function announceTheQuestionCouldNotBeAsked(): Promise<void> {
  const sentence =
    "We could not put the question on screen, so nothing was done. Reload the page and try again — if it keeps happening, this screen is missing its confirmation dialog and an engineer needs to know.";
  try {
    // Loaded here, on the failure path only, so the toast machinery stays out
    // of the static graph of every route entry that mounts this host.
    const { toast } = await import("@/lib/toast");
    toast.error("That did not happen", { description: sentence, duration: 12000 });
  } catch {
    // Even the announcement's own machinery can be absent. The console is the
    // last honest surface; silence is never an option.
  }
  console.error(
    "[confirm] no <ConfirmDialogHost /> is mounted in this tree. " + sentence,
  );
}

/**
 * The one ownership handoff for every imperative confirm in the app.
 *
 * 🚨 IT ALWAYS SETTLES (feedback 11b0a90c). Three outcomes, no fourth:
 * the person answers; the wait ran long and we opened anyway with a warning;
 * or the confirm genuinely cannot be shown, and then it SAYS SO to the person
 * and answers `false`. What it must never do is hang or vanish, both of which
 * a caller cannot tell apart from a button that does nothing.
 */
export async function confirm(options: ConfirmOptions): Promise<boolean> {
  const outcome = await afterCurrentLayerCloses();
  if (outcome === "timed-out") {
    console.warn(
      "[modal-layers] a closing layer never released the screen within ~500ms; showing the confirm anyway.",
    );
  }
  // `openConfirm` queues indefinitely when no host is mounted — by design, so
  // a pre-hydration call still gets a real question. That queue must not
  // become a silent hang: if no host ever appears, say so rather than leaving
  // the caller pending.
  if (!(await waitForConfirmHost(CONFIRM_HOST_WAIT_MS))) {
    await announceTheQuestionCouldNotBeAsked();
    return false;
  }
  return openConfirm(options);
}

const ConfirmDialogHostImpl = dynamic(
  () => import("@ai-matrx/design-system").then((m) => m.ConfirmDialogHost),
  { ssr: false, loading: () => null },
);

export function ConfirmDialogHost() {
  // 🚨 R2-1 — a confirm opened from inside a Radix Select selection left the
  // whole page dead to the mouse. The guard rides here because this host is
  // already mounted once in every provider tree, and the defect is not the
  // confirm's: it is any two modal layers whose body locks overlap.
  useBodyPointerEventsGuard();
  return <ConfirmDialogHostImpl />;
}
