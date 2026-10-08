"use client";

// Dev demo for the e-sign signature creator (CONTRACT §14, §17.4): the real dialog against an
// in-memory mock of the handoff doors and the saved list. THIS IS A MOCK DEMO — the Phone tab
// "completes" by itself 6 s after it opens; nothing here touches a server.

import { useEffect, useMemo, useState } from "react";
import { Button, Switch } from "@ai-matrx/design-system/controls";

import { SignatureCreatorDialog, type CreatedMark } from "@/features/esign/signature-creator/SignatureCreatorDialog";
import { installMockSavedList, makeMockDoor } from "@/features/esign/signature-creator/mocks/mockDoor";

export default function EsignSignatureCreatorDemo() {
  const door = useMemo(() => makeMockDoor(), []);
  const [target, setTarget] = useState<"signature" | "initials" | null>(null);
  const [signedIn, setSignedIn] = useState(true);
  const [marks, setMarks] = useState<CreatedMark[]>([]);

  useEffect(() => installMockSavedList(), []);

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4 p-6">
      <h1 className="text-lg font-semibold text-foreground">Signature creator (mock doors)</h1>
      <label className="flex items-center justify-between gap-3 text-sm text-foreground">
        Signed in
        <Switch checked={signedIn} onCheckedChange={setSignedIn} aria-label="Signed in" />
      </label>
      <div className="flex gap-2">
        <Button variant="primary" onClick={() => setTarget("signature")}>Create signature</Button>
        <Button variant="outline" onClick={() => setTarget("initials")}>Create initials</Button>
      </div>
      {marks.map((m, i) => (
        <div key={i} className="flex flex-col gap-1 rounded-md border border-border bg-card p-3 text-xs text-muted-foreground">
          <span>
            {m.target} / {m.kind} / {m.source}{m.typed_style ? ` / ${m.typed_style}` : ""} / save {String(m.save_to_profile)} / default {String(m.make_default)}
          </span>
          {m.preview_url && (
            // eslint-disable-next-line @next/next/no-img-element -- demo readout
            <img src={m.preview_url} alt="" className="h-14 w-fit rounded bg-white object-contain p-1" />
          )}
        </div>
      ))}
      <SignatureCreatorDialog
        open={target !== null}
        target={target ?? "signature"}
        signerName="Ada Lovelace"
        initials="AL"
        allowed={{ typed: true, drawn: true, uploaded: true, phone: true }}
        door={door}
        signedIn={signedIn}
        onAdopt={(m) => {
          setMarks(m);
          setTarget(null);
        }}
        onClose={() => setTarget(null)}
      />
    </div>
  );
}
