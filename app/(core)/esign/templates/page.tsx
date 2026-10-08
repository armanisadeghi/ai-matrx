// app/(core)/esign/templates/page.tsx — e-sign templates.

import type { Metadata } from "next";
import { TemplatesPage } from "@/features/esign/templates/TemplatesPage";

export const metadata: Metadata = { title: "E-sign templates" };

export default function Page() {
  return <TemplatesPage />;
}
