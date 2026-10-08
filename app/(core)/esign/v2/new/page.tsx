// app/(core)/esign/v2/new/page.tsx — STAGING for the sender editor on the real server, beside the live
// /esign/new. Deleted at the production swap (CONTRACT §17: after the signer lane's swap).

import type { Metadata } from "next";
import { EditorHost } from "@/features/esign/editor/components/EditorHost";

export const metadata: Metadata = { title: "Send for signature" };

export default async function Page({ searchParams }: { searchParams: Promise<{ template?: string; copy?: string }> }) {
  const { template, copy } = await searchParams;
  const source = template ? ({ kind: "from_template", templateId: template } as const) : copy ? ({ kind: "copy", envelopeId: copy } as const) : ({ kind: "new" } as const);
  return <EditorHost source={source} />;
}
