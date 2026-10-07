// app/(core)/esign/templates/[templateId]/page.tsx — the template editor (`new` = a blank one).

import type { Metadata } from "next";
import { EditorHost } from "@/features/esign/editor/components/EditorHost";

export const metadata: Metadata = { title: "E-sign template" };

export default async function Page({ params }: { params: Promise<{ templateId: string }> }) {
  const { templateId } = await params;
  return <EditorHost source={{ kind: "template", templateId: templateId === "new" ? null : templateId }} />;
}
