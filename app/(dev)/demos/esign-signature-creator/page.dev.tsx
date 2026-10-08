"use client";

// Dev demo for the e-sign signature creator (CONTRACT §14, §17.4): the real dialog against an
// in-memory mock of the handoff doors and the saved list. THIS IS A MOCK DEMO — the Phone tab
// "completes" by itself 6 s after it opens; nothing here touches a server.

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAppDispatch } from "@/lib/redux/hooks";
import { Button, Switch } from "@ai-matrx/design-system/controls";

import { SignatureCreatorDialog, type CreatedMark } from "@/features/esign/signature-creator/SignatureCreatorDialog";
import { installMockSavedList, makeMockDoor } from "@/features/esign/signature-creator/mocks/mockDoor";
import { makeRealHandoffDoor } from "./realDoor";

export default function EsignSignatureCreatorDemo() {
  // ?envelope=<id> switches to the real server: handoff and saved list are live, nothing mocked.
  const envelopeId = useSearchParams().get("envelope");
  const dispatch = useAppDispatch();
  const door = useMemo(() => (envelopeId ? makeRealHandoffDoor(dispatch, envelopeId) : makeMockDoor()), [envelopeId, dispatch]);
  const [target, setTarget] = useState<"signature" | "initials" | null>(null);
  const [signedIn, setSignedIn] = useState(true);
  const [marks, setMarks] = useState<CreatedMark[]>([]);
  const [serverSaid, setServerSaid] = useState<string[]>([]);

  useEffect(() => (envelopeId ? undefined : installMockSavedList()), [envelopeId]);

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4 p-6">
      <h1 className="text-lg font-semibold text-foreground">Signature creator ({envelopeId ? "real server" : "mock doors"})</h1>
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
      {serverSaid.map((t, i) => (
        <p key={i} role="status" className="text-xs text-foreground">{t}</p>
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
          if (!envelopeId) return;
          // Real mode: the same door.adopt call the signer surface makes, so the server's answer shows.
          for (const mark of m) {
            door
              .adopt({
                target: mark.target, kind: mark.kind, source: mark.source,
                typed_name: mark.target === "initials" ? mark.initials : mark.full_name,
                typed_style: mark.typed_style, image_data_url: mark.image_data_url,
                handoff_id: mark.handoff_id, saved_signature_id: mark.saved_signature_id,
                save_to_profile: mark.save_to_profile, make_default: mark.make_default,
              })
              .then((a) => setServerSaid((x) => [...x, `adopt ${mark.target} / ${mark.source}: accepted, ${a.image_base64.length} base64 chars`]))
              .catch((e: unknown) => setServerSaid((x) => [...x, `adopt ${mark.target} / ${mark.source}: ${e instanceof Error ? e.message : "refused"}`]));
          }
        }}
        onClose={() => setTarget(null)}
      />
    </div>
  );
}
