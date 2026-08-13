import { notFound } from "next/navigation";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { CollectionRunView } from "@/features/marketing/seo/ai-visibility/CollectionRunView";
import { createClient } from "@/utils/supabase/server";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Standalone resolver route for one `seo.collection_run` — the in-app landing
 * for a shared run (the `seo_collection_run` registry `urlPathTemplate` points
 * here). A signed-in grantee reaches the run under RLS with NO brand/site
 * access required; the site-scoped workspace stays the owner's working view.
 */
export default async function MarketingCollectionRunPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  if (!UUID_RE.test(runId)) notFound();

  const supabase = await createClient();
  const response = await supabase
    .schema("seo")
    .from("collection_run")
    .select(
      "id, provider, capability, operation, status, requested_at, completed_at, result",
    )
    .eq("id", runId)
    .maybeSingle();

  if (response.error || !response.data) {
    return (
      <AccessGate
        token="seo_collection_run"
        id={runId}
        error={response.error}
        fallbackHref="/marketing/ai-visibility"
        fallbackLabel="AI Visibility"
      />
    );
  }

  return <CollectionRunView run={response.data} />;
}
