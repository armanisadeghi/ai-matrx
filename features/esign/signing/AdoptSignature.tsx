"use client";

// features/esign/signing/AdoptSignature.tsx — the signer's name and their mark, typed or drawn.
//
// One component for both places a signer adopts: inline on the sign step of a document with no
// placed fields, and in the dialog a placed Signature field opens. Drawing is THE platform pad
// (`SignaturePad`, @ai-matrx/records-ui); the envelope's `signature_options` can turn either off.

import { PenLine, Type as TypeIcon } from "lucide-react";
import { SignaturePad } from "@ai-matrx/records-ui";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@ai-matrx/design-system/controls";

export type SignatureMark = "typed" | "drawn";

export function AdoptSignature({
  typedName,
  onTypedName,
  mark,
  onMark,
  drawing,
  onDrawing,
  canType,
  canDraw,
  disabled,
}: {
  typedName: string;
  onTypedName: (value: string) => void;
  mark: SignatureMark;
  onMark: (value: SignatureMark) => void;
  drawing: string | null;
  onDrawing: (value: string | null) => void;
  canType: boolean;
  canDraw: boolean;
  disabled: boolean;
}) {
  return (
    <>
      <div className="flex flex-col gap-2">
        <Label htmlFor="esign-typed-name">Your full name</Label>
        <Input
          id="esign-typed-name"
          value={typedName}
          autoComplete="name"
          onChange={(e) => onTypedName(e.target.value)}
        />
      </div>
      {canType && canDraw && (
        <div className="flex gap-1">
          <Button icon={<TypeIcon />} variant={mark === "typed" ? "outline" : "quiet"} onClick={() => onMark("typed")}>
            Type
          </Button>
          <Button icon={<PenLine />} variant={mark === "drawn" ? "outline" : "quiet"} onClick={() => onMark("drawn")}>
            Draw
          </Button>
        </div>
      )}
      {mark === "typed" ? (
        <div className="flex h-20 items-center justify-center rounded-md border border-dashed border-border bg-card px-3">
          <span className="truncate font-serif text-3xl italic text-foreground">{typedName.trim() || " "}</span>
        </div>
      ) : (
        <SignaturePad value={drawing} onChange={onDrawing} disabled={disabled} />
      )}
    </>
  );
}
