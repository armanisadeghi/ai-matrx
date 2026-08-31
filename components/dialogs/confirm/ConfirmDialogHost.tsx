/**
 * components/dialogs/confirm/ConfirmDialogHost.tsx — HOST WIRING for
 * @ai-matrx/kit/confirm.
 *
 * Slim client shell + public entry point for the global confirm dialog.
 * Statically importable from anywhere — it does NOT pull the dialog body,
 * radix-alert-dialog, or the host state machinery into the static graph of
 * route entries that mount it: the imperative API comes from the kit's pure
 * `confirm-opener` entry (zero React, zero dialog markup), and the heavy
 * host loads via `next/dynamic({ ssr: false })` from the kit's `confirm`
 * entry. The two entries share ONE opener state by construction (a
 * `Symbol.for` globalThis slot inside the package).
 *
 * Render `<ConfirmDialogHost />` once, near the root of every provider tree
 * (Providers, EntityProviders, PublicProviders) so the imperative
 * `confirm()` always has a live host to dispatch to once the page hydrates.
 * Pre-hydration calls queue inside the package and resolve as soon as the
 * host registers.
 */

"use client";

import dynamic from "next/dynamic";

import { useBodyPointerEventsGuard } from "./body-pointer-events-guard";

export { confirm } from "@ai-matrx/kit/confirm-opener";
export type { ConfirmOptions } from "@ai-matrx/kit/confirm-opener";

const ConfirmDialogHostImpl = dynamic(
  () => import("@ai-matrx/kit/confirm").then((m) => m.ConfirmDialogHost),
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
