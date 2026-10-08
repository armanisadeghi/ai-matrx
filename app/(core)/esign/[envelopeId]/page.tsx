// app/(core)/esign/[envelopeId]/page.tsx — one envelope: the editor while it is a draft, the tracking page once sent.

import type { Metadata } from "next";
import { EnvelopeRoute } from "@/features/esign/editor/components/EnvelopeRoute";

export const metadata: Metadata = { title: "Envelope" };

export default async function Page({ params }: { params: Promise<{ envelopeId: string }> }) {
  const { envelopeId } = await params;
  return <EnvelopeRoute envelopeId={envelopeId} />;
}
