"use client";

// features/esign/signing/InternalSigning.tsx — the signed-in door onto the one signing surface.

import { useState } from "react";

import { SigningSurface } from "./SigningSurface";
import type { SigningDoor } from "./signingService";

export function InternalSigning({ envelopeId }: { envelopeId: string }) {
  // One door object for the life of the page, so the surface loads (and records `opened`) once.
  const [door] = useState<SigningDoor>(() => ({ kind: "envelope", envelopeId }));
  return <SigningSurface door={door} />;
}
