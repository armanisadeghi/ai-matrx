/**
 * components/dialogs/scope-mismatch/ScopeMismatchDialogHost.tsx
 *
 * Slim client shell + public entry point for the global chat↔scope
 * mismatch dialog — the 3-way "ask on mismatch" pre-send gate. Mirrors
 * the ConfirmDialogHost / ValuePromptsDialogHost pattern exactly: the
 * opener registry is pure TS, the heavy body loads via
 * `next/dynamic({ ssr: false })`, and pre-hydration calls queue inside
 * the opener until the host registers.
 *
 * Mount `<ScopeMismatchDialogHost />` once per provider tree, beside
 * `<ConfirmDialogHost />`. Consumers call:
 *
 *   import { promptScopeMismatch } from "@/components/dialogs/scope-mismatch/scopeMismatchOpener";
 *   const choice = await promptScopeMismatch({ current, chat });
 *   // choice: "update" | "combine" | "keep" | "cancel"
 */

"use client";

import dynamic from "next/dynamic";

const ScopeMismatchDialogHostImpl = dynamic(
  () => import("./ScopeMismatchDialogHostImpl"),
  { ssr: false, loading: () => null },
);

export function ScopeMismatchDialogHost() {
  return <ScopeMismatchDialogHostImpl />;
}
