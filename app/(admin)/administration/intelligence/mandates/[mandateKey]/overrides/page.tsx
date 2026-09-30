import { OverridesPreviewPage } from "@/features/mandates/overrides-simple/OverridesPreviewPage";
import { storedMandateKey } from "@/features/mandates/mandate-key";

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
  // The page boundary: the segment enters the typed world once, here. The
  // record it names is read from the database, which answers for it.
  return <OverridesPreviewPage mandateKey={storedMandateKey(mandateKey)} systemOnly />;
}
