/**
 * components/dialogs/sandbox-gate/SandboxGateHostImpl.tsx
 *
 * Heavy body of the sandbox pre-send gate. Mounted lazily by SandboxGateHost via
 * next/dynamic({ ssr: false }) so this file — and the heavy SandboxPanel it
 * embeds — is NOT in the static graph of any route entry.
 *
 * Imperative model mirrors ConfirmDialogHostImpl: `openSandboxGate(...)` pushes a
 * request onto a ref-backed queue; this component drains it one at a time. The
 * Promise<SandboxGateChoice> resolves on:
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
import {
  _registerHost,
  _unregisterHost,
  type SandboxGateChoice,
  type SandboxGateOptions,
} from "./sandboxGateOpener";

interface ActiveRequest {
  opts: SandboxGateOptions;
  resolve: (choice: SandboxGateChoice) => void;
}

export default function SandboxGateHostImpl() {
  const [active, setActive] = React.useState<ActiveRequest | null>(null);
  const [tick, setTick] = React.useState(0);
  const queueRef = React.useRef<ActiveRequest[]>([]);

  React.useEffect(() => {
    const controller = {
      show: (
        opts: SandboxGateOptions,
        resolve: (choice: SandboxGateChoice) => void,
      ) => {
        queueRef.current.push({ opts, resolve });
        setTick((n) => n + 1);
      },
    };
    _registerHost(controller);
    return () => _unregisterHost(controller);
  }, []);

  React.useEffect(() => {
    if (active === null && queueRef.current.length > 0) {
      setActive(queueRef.current.shift()!);
    }
  }, [active, tick]);

  const settle = React.useCallback(
    (choice: SandboxGateChoice) => {
      if (!active) return;
      active.resolve(choice);
      setActive(null);
    },
    [active],
  );

  // Any dismiss (Esc / backdrop / X) is a cancel — never a silent send.
  const handleOpenChange = React.useCallback(
    (open: boolean) => {
      if (!open) settle("cancel");
    },
    [settle],
  );

  return (
    <Dialog open={!!active} onOpenChange={handleOpenChange}>
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

        {active ? (
          <div className="max-h-[50vh] overflow-y-auto rounded-md border border-border">
            <SandboxPanel conversationId={active.opts.conversationId} />
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
