/**
 * components/dialogs/sandbox-gate/SandboxGateHostImpl.tsx
 *
 * Heavy body of the sandbox pre-send gate. Mounted lazily by SandboxGateHost via
 * next/dynamic({ ssr: false }) so this file — and the heavy SandboxPanel it
 * embeds — is NOT in the static graph of any route entry.
 *
 * Imperative model: `openSandboxGate(...)` pushes a request into the opener's
 * queue and `useOpenerHost` (`@ai-matrx/kit/opener-react`) drains it one at a
 * time — the registration, queue and settle-once machinery are the package's,
 * never re-implemented here. The Promise<SandboxGateChoice> resolves on:
 *   • "Retry with sandbox"      → "attach"  (user managed/attached a live box)
 *   • "Send without sandbox"    → "detach"
 *   • dismiss (Esc/backdrop/X)  → "cancel"  (so a stray dismiss never sends)
 */

"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SandboxPanel } from "@/features/agents/components/chat/SandboxPanel";
import { useOpenerHost } from "@ai-matrx/kit/opener-react";
import { sandboxGateOpener } from "./sandboxGateOpener";

export default function SandboxGateHostImpl() {
  const { request, open, settle } = useOpenerHost(sandboxGateOpener);

  // Any dismiss (Esc / backdrop / X) is a cancel — never a silent send.
  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      if (!next) settle("cancel");
    },
    [settle],
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg gap-4">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Sandbox unavailable
          </DialogTitle>
          <DialogDescription>
            This conversation is bound to a sandbox, but it can&apos;t be reached
            right now (it may be stopped, expired, or still starting). Nothing was
            sent. Attach or start a sandbox and retry, or send this message
            without a sandbox.
          </DialogDescription>
        </DialogHeader>

        {request ? (
          <div className="max-h-[50dvh] overflow-y-auto rounded-md border border-border">
            <SandboxPanel conversationId={request.conversationId} />
          </div>
        ) : null}

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" onClick={() => settle("cancel")}>
            Cancel
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => settle("detach")}>
              Send without sandbox
            </Button>
            <Button onClick={() => settle("attach")}>Retry with sandbox</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
