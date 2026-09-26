import { OverridesPreviewPage } from "@/features/mandates/overrides-simple/OverridesPreviewPage";

export const metadata = {
  title: "Mandate overrides",
  description: "The simple Overrides page for one mandate, at the system level",
};

export default async function IntelligenceMandateOverridesRoute({
  params,
}: {
  params: Promise<{ mandateKey: string }>;
}) {
  // The App Router already decodes dynamic segment params.
  const { mandateKey } = await params;
  return <OverridesPreviewPage mandateKey={mandateKey} systemOnly />;
}
