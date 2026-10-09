// app/(core)/esign/new/page.tsx — a new envelope: the editor on a server-saved draft.
// `?template=<id>` starts from a template, `?copy=<envelopeId>` from a copy of a sent envelope.

import type { Metadata } from "next";
import { EditorHost } from "@/features/esign/editor/components/EditorHost";

export const metadata: Metadata = { title: "Send for signature" };

export default async function Page({ searchParams }: { searchParams: Promise<{ template?: string; copy?: string; name?: string }> }) {
  const { template, copy, name } = await searchParams;
  const source = template ? ({ kind: "from_template", templateId: template } as const) : copy ? ({ kind: "copy", envelopeId: copy, name: name?.slice(0, 200) } as const) : ({ kind: "new" } as const);
  return <EditorHost source={source} />;
}
