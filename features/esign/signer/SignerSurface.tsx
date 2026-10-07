"use client";

// features/esign/signer/SignerSurface.tsx — STEP 0 STUB (e-sign parity CONTRACT.md §13.1).
// The entry point's signature is frozen; the body is the signer lane's to build. Until then it is an
// announced stand-in (law 4): nothing here pretends to be the signing page.

import { FileSignature } from "lucide-react";
import { EmptyState } from "@ai-matrx/design-system/controls";

import type { SessionEnded, SignerDoorApi } from "../contract/signerDoor";

export function SignerSurface({
  door,
  onDoorClosed,
}: {
  door: SignerDoorApi;
  onDoorClosed?: (why: SessionEnded) => void;
}) {
  void door;
  void onDoorClosed;
  return (
    <EmptyState
      icon={<FileSignature />}
      title="The new signing page is not built yet"
      line="This is a stand-in for the signing page."
    />
  );
}
