"use client";

// Dev demo for the v2 signing page (esign-parity CONTRACT §13, §17 step 4): the real SignerSurface
// against an in-memory mock door — a two-page PDF with one field of every kind, a second signer
// who already signed, slow saves, and a "session taken over" simulation. THIS IS A MOCK DEMO:
// nothing here touches a server.

import { useState } from "react";

import { Button, Select, Switch } from "@ai-matrx/design-system/controls";

import type { SessionEnded } from "@/features/esign/contract/signerDoor";
import { SignerSurface } from "@/features/esign/signer/SignerSurface";
import { createMockDoor, type MockDoor, type MockOptions } from "@/features/esign/signer/mocks/mockDoor";

const FORM_VIEW = [
  { value: "available", label: "Form view: available" },
  { value: "default", label: "Form view: default" },
  { value: "off", label: "Form view: off" },
] as const;

export default function EsignSignerDemo() {
  const [options, setOptions] = useState<MockOptions>({
    seat: "outsider",
    formView: "available",
    saveDelayMs: 1200,
    consented: false,
    role: "signer",
  });
  const [run, setRun] = useState(0);
  const [door, setDoor] = useState<MockDoor>(() => createMockDoor(options));
  const [ended, setEnded] = useState<SessionEnded | null>(null);

  function restart(next: MockOptions) {
    setOptions(next);
    setDoor(createMockDoor(next));
    setEnded(null);
    setRun((r) => r + 1);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-2 type-secondary text-muted-foreground">
        <span className="font-medium text-foreground">Signing page v2 (mock door)</span>
        <label className="flex items-center gap-2">
          Signed in
          <Switch
            aria-label="Signed in"
            checked={options.seat === "signed_in"}
            onCheckedChange={(on) => restart({ ...options, seat: on ? "signed_in" : "outsider" })}
          />
        </label>
        <label className="flex items-center gap-2">
          Viewer
          <Switch
            aria-label="Viewer"
            checked={options.role === "viewer"}
            onCheckedChange={(on) => restart({ ...options, role: on ? "viewer" : "signer" })}
          />
        </label>
        <label className="flex items-center gap-2">
          Already consented
          <Switch
            aria-label="Already consented"
            checked={options.consented}
            onCheckedChange={(on) => restart({ ...options, consented: on })}
          />
        </label>
        <Select
          aria-label="Form view"
          value={options.formView}
          options={FORM_VIEW}
          onValueChange={(v) => restart({ ...options, formView: v })}
        />
        <Button variant="outline" onClick={() => door.simulateTakeover()}>
          Take the session over
        </Button>
        <Button variant="quiet" onClick={() => restart(options)}>
          Restart
        </Button>
      </div>
      <div className="min-h-0 flex-1">
        {ended ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
            <p className="type-body text-foreground">You opened this in another window.</p>
            <Button variant="primary" onClick={() => restart(options)}>
              Continue here
            </Button>
          </div>
        ) : (
          <SignerSurface key={run} door={door} onDoorClosed={setEnded} />
        )}
      </div>
    </div>
  );
}
