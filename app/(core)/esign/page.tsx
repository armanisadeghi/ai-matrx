// app/(core)/esign/page.tsx — the e-signature product section (SPEC-ESIGN §6.0): every envelope
// you sent, were given, or must sign. features/esign/envelopes.

import { EnvelopeListPage } from "@/features/esign/envelopes/EnvelopeListPage";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/esign", {
  title: "E-Signatures",
  description: "Send documents for signature and track every signer.",
  canonicalPath: "/esign",
});

export default function EsignPage() {
  return <EnvelopeListPage />;
}
