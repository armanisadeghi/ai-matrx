"use client";

// features/esign/signature-creator/SignatureCreatorDialog.tsx — the signature creator (e-sign
// parity CONTRACT.md §14). The props and `CreatedMark` are frozen (Step 0); the body is this lane's.
// The body is loaded lazily: the twelve handwriting faces and the tabs stay out of the signing
// page's first bundle, and nothing loads until the dialog opens.

import dynamic from "next/dynamic";

import type { SignerDoorApi } from "../contract/signerDoor";

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

const Body = dynamic(() => import("./SignatureCreatorBody"), { ssr: false });

export function SignatureCreatorDialog(props: SignatureCreatorDialogProps) {
  if (!props.open) return null;
  return <Body {...props} />;
}
