"use client";

// features/esign/signer/InternalEntry.tsx — a signed-in member's door onto the v2 signing page
// (esign-parity CONTRACT §13). The route checked the session; whether this person is the signer is
// the database's answer, shown as one sentence.

import { useState } from "react";

import { useAppDispatch } from "@/lib/redux/hooks";

import type { SignerDoorApi } from "../contract/signerDoor";
import { createSignerDoor } from "./door";
import { SignerSurface } from "./SignerSurface";

export function InternalEntry({ envelopeId }: { envelopeId: string }) {
  const dispatch = useAppDispatch();
  // One door for the life of the page, so the surface loads (and records `opened`) once.
  const [door] = useState<SignerDoorApi>(() => createSignerDoor(dispatch, { kind: "envelope", envelopeId }));
  return <SignerSurface door={door} />;
}
