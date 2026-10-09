// app/(link)/x/sign/phone/page.tsx — THE PHONE END OF A SIGNATURE HANDOFF (CONTRACT §4, §14.2).
//
// A signer on a computer pressed "Phone"; this is the page the QR code or text opens. No account,
// no sign-in: the secret in the URL FRAGMENT (`#h=<secret>`, never sent to any server) is the whole
// credential. The page names the sender, draws or uploads a mark and hands it back to the computer.

import type { Metadata } from "next";

import { SignaturePhonePage } from "@/features/esign/signature-creator/SignaturePhonePage";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  // THE TITLE NAMES NOTHING: a tab title and a link preview are where contents leak.
  title: "Add your signature",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function SignaturePhoneRoute() {
  return <SignaturePhonePage />;
}
