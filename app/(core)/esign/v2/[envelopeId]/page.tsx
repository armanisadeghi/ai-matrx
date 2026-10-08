// app/(core)/esign/v2/[envelopeId]/page.tsx — STAGING twin of /esign/[envelopeId] on the new sender
// editor + envelope page. Deleted at the production swap.

import type { Metadata } from "next";
import { EnvelopeRoute } from "@/features/esign/editor/components/EnvelopeRoute";

export const metadata: Metadata = { title: "Envelope" };

export default async function Page({ params }: { params: Promise<{ envelopeId: string }> }) {
  const { envelopeId } = await params;
  return <EnvelopeRoute envelopeId={envelopeId} />;
}
