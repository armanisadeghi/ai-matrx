// app/(dev)/demos/esign-sender/page.dev.tsx — the sender's editor on an in-memory mock (CONTRACT §17.4).
// Shows: drag/tap placement, properties, auto-placement candidates, recipients, slow saves,
// a two-window conflict, templates. NOT the production route (that is /esign/new).

import type { Metadata } from "next";
import { EsignSenderDemo } from "@/features/esign/editor/mocks/EsignSenderDemo";

export const metadata: Metadata = { title: "E-sign sender (mock)" };

export default function Page() {
  return <EsignSenderDemo />;
}
