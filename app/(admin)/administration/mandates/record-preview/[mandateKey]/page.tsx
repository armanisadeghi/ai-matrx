import { MandateRecordPage } from "@/features/mandates/record-next/MandateRecordPage";

/**
 * /administration/mandates/record-preview/[mandateKey] — the NEW mandate
 * record page, built beside /administration/mandates/[mandateKey] (untouched)
 * so the owner can compare them. Agents-style header, tab in `?tab=`.
 * Auth + admin gating is the `(admin)` layout's job.
 */
export const metadata = {
  title: "Mandate (preview)",
  description: "One mandate — the new record page",
};

export default async function MandateRecordPreviewRoute({
  params,
}: {
  params: Promise<{ mandateKey: string }>;
}) {
  // The App Router already decodes dynamic params — never decode twice.
  const { mandateKey } = await params;
  return <MandateRecordPage mandateKey={mandateKey} />;
}
