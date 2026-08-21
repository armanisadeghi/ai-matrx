/**
 * /workflows/bakeoff/sharp/[id] — the "ui-sharp" entry in the run-page
 * bake-off: the auto-generated workflow run page as a delivery ticket
 * (promise → live tracker → delivered), derived purely from the definition.
 *
 * Presentation lives in `features/workflow-runtime/bakeoff/sharp/`; every
 * data path is the canonical workflow-runtime plumbing.
 */

import { SharpRunPage } from "@/features/workflow-runtime/bakeoff/sharp/SharpRunPage";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <SharpRunPage definitionId={id} />;
}
