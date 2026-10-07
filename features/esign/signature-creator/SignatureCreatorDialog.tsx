"use client";

// features/esign/signature-creator/SignatureCreatorDialog.tsx — STEP 0 STUB (e-sign parity
// CONTRACT.md §14.1). The props and `CreatedMark` are frozen; the body belongs to the signature-creator
// lane. Until then it wraps today's `AdoptSignature` (type or draw) in a dialog and returns one mark.

import { useState } from "react";

import { Button } from "@ai-matrx/design-system/controls";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import type { SignerDoorApi } from "../contract/signerDoor";
import { AdoptSignature, type SignatureMark } from "../signing/AdoptSignature";

export interface CreatedMark {
  target: "signature" | "initials";
  kind: "typed" | "drawn" | "uploaded";
  source: "this_device" | "phone" | "saved";
  full_name: string;
  initials: string;
  typed_style?: string;
  image_data_url?: string;        // the creator output (decision C) for this_device
  strokes?: unknown[];
  handoff_id?: string;            // source phone
  saved_signature_id?: string;    // source saved
  save_to_profile: boolean;
  make_default: boolean;
  preview_url: string;
}

export interface SignatureCreatorDialogProps {
  open: boolean;
  target: "signature" | "initials";
  signerName: string;
  initials: string;
  allowed: { typed: boolean; drawn: boolean; uploaded: boolean; phone: boolean };
  door: SignerDoorApi;            // handoff* only
  signedIn: boolean;              // shows Saved tab and "Save as default"
  onAdopt: (marks: CreatedMark[]) => void;   // signature (+ initials when typed) — the surface calls door.adopt
  onClose: () => void;
}

/** A typed mark rendered to a PNG data URL in the stub's one style (serif italic, paper ink). */
function renderTyped(text: string): string {
  const canvas = document.createElement("canvas");
  canvas.width = 800;
  canvas.height = 200;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.fillStyle = "#0d2673";
  ctx.font = "italic 96px serif";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 24, 100, 752);
  return canvas.toDataURL("image/png");
}

export function SignatureCreatorDialog({
  open,
  target,
  signerName,
  initials,
  allowed,
  signedIn,
  onAdopt,
  onClose,
}: SignatureCreatorDialogProps) {
  const [name, setName] = useState(target === "initials" ? initials : signerName);
  const [mark, setMark] = useState<SignatureMark>(allowed.typed ? "typed" : "drawn");
  const [drawing, setDrawing] = useState<string | null>(null);

  const ready = mark === "typed" ? name.trim().length > 0 : drawing !== null;

  const adopt = () => {
    const image = mark === "typed" ? renderTyped(name.trim()) : drawing ?? "";
    onAdopt([
      {
        target,
        kind: mark,
        source: "this_device",
        full_name: target === "signature" ? name.trim() : signerName,
        initials: target === "initials" ? name.trim() : initials,
        image_data_url: image,
        save_to_profile: false,
        make_default: false,
        preview_url: image,
      },
    ]);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{target === "initials" ? "Adopt your initials" : "Adopt your signature"}</DialogTitle>
          <DialogDescription>{signedIn ? "Stand-in creator: type or draw." : "Type or draw your mark."}</DialogDescription>
        </DialogHeader>
        <AdoptSignature
          typedName={name}
          onTypedName={setName}
          mark={mark}
          onMark={setMark}
          drawing={drawing}
          onDrawing={setDrawing}
          canType={allowed.typed}
          canDraw={allowed.drawn}
          disabled={false}
        />
        <DialogFooter>
          <Button variant="quiet" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!ready} onClick={adopt}>
            Adopt
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
