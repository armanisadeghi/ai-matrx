// app/(core)/esign/[envelopeId]/page.tsx — one envelope, for its sender.

import type { Metadata } from "next";
import { EnvelopeDetail } from "@/features/esign/envelopes/EnvelopeDetail";

export const metadata: Metadata = { title: "Envelope" };

export default async function EnvelopePage({ params }: { params: Promise<{ envelopeId: string }> }) {
  const { envelopeId } = await params;
  return <EnvelopeDetail envelopeId={envelopeId} />;
}
