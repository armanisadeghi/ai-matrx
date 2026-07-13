// /administration/relationships/sharing — the ONE home for
// platform.shareable_resource_registry: full row CRUD + link policy
// (no-login link sharing and the anonymous-viewer column allowlist).
// Replaces the retired /administration/sharing page (redirected here).
//
// ?register=<token> deep-links from the Overview drift panel pre-open the
// registration form (consume-once — the client strips it).

import { createClient } from "@/utils/supabase/server";
import { RelationshipSharingClient } from "@/features/admin/relationships/components/RelationshipSharingClient";

export const metadata = {
  title: "Sharing Registry | Matrx Admin",
};

export default async function RelationshipSharingPage({
  searchParams,
}: {
  searchParams: Promise<{ register?: string }>;
}) {
  const { register } = await searchParams;
  const supabase = await createClient();

  const [registryRes, policiesRes] = await Promise.all([
    supabase.rpc("admin_shareable_registry_list"),
    supabase.rpc("admin_list_share_policies"),
  ]);

  const firstError = registryRes.error ?? policiesRes.error;
  if (firstError) {
    throw new Error(`Sharing registry failed to load: ${firstError.message}`);
  }

  return (
    <div className="h-full overflow-y-auto">
      <RelationshipSharingClient
        registry={registryRes.data ?? []}
        policies={policiesRes.data ?? []}
        initialRegisterToken={register}
      />
    </div>
  );
}
