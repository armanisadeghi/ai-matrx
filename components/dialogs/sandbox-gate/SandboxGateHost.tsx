/**
 * components/dialogs/sandbox-gate/SandboxGateHost.tsx
 *
 * Slim client shell + public entry point for the sandbox pre-send gate dialog.
 * Statically importable from anywhere — it does NOT pull the dialog body,
 * SandboxPanel, or radix-dialog into the static graph of route entries that
 * mount it. The heavy body lives in `SandboxGateHostImpl.tsx` and loads via
 * `next/dynamic({ ssr: false })` (SandboxPanel is a heavy client component).
 *
 * Mirrors ConfirmDialogHost: re-export the imperative `openSandboxGate` API
 * (pure TS, cheap to import) and render `<SandboxGateHost />` once near each
 * provider root so the imperative call always has a live host once hydrated.
 */

"use client";

import dynamic from "next/dynamic";

export { openSandboxGate } from "./sandboxGateOpener";
export type {
  SandboxGateChoice,
  SandboxGateOptions,
} from "./sandboxGateOpener";

const SandboxGateHostImpl = dynamic(() => import("./SandboxGateHostImpl"), {
  ssr: false,
  loading: () => null,
});

export function SandboxGateHost() {
  return <SandboxGateHostImpl />;
}
