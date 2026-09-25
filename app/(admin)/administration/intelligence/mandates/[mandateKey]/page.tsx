import { MandateRecordPage } from "@/features/mandates/record-next/MandateRecordPage";

/**
 * /administration/intelligence/mandates/[mandateKey] — one mandate on the new
 * record page (tab in `?tab=`). Auth + admin gating is the `(admin)` layout's job.
 */
export const metadata = {
  title: "Mandate",
  description: "One mandate — the job, its holder, and its overrides",
};

export default async function IntelligenceMandateRecordRoute({
  params,
}: {
  params: Promise<{ mandateKey: string }>;
}) {
  // The App Router already decodes dynamic params — never decode twice.
  const { mandateKey } = await params;
  return <MandateRecordPage mandateKey={mandateKey} />;
}
