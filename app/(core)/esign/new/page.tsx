// app/(core)/esign/new/page.tsx — send PDFs for signature.

import type { Metadata } from "next";
import { SendForSignature } from "@/features/esign/envelopes/SendForSignature";

export const metadata: Metadata = { title: "Send for signature" };

export default function SendForSignaturePage() {
  return <SendForSignature />;
}
