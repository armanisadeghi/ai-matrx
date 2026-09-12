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
 * The one ownership handoff for every imperative confirm in the app.
 *
 * 🚨 IT ALWAYS SETTLES (feedback 11b0a90c). Three outcomes, no fourth:
 * the person answers; the wait ran long and we opened anyway with a warning;
 * or the confirm genuinely cannot be shown and this THROWS, so the caller's
 * own error handling surfaces it. What it must never do again is hang, which
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
    throw new Error(
      "Could not show the confirmation dialog: no <ConfirmDialogHost /> is mounted in this tree. The action was not performed.",
    );
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
