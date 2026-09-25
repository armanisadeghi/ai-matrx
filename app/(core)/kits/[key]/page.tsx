import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";
import { loginHref } from "@/utils/auth/auth-destination";
import { entityRefsIn, fetchKit, fetchRefNames, fetchSourceAgents } from "@/features/kits/service";
import { KitDetail } from "@/features/kits/components/KitDetail";
import { KitMissing } from "@/features/kits/components/KitMissing";

/** /kits/[key] — one kit: what it is, how it works, and the install. */
export default async function KitDetailPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const { isAuthenticated } = await getSessionVerdict();
  if (!isAuthenticated) redirect(loginHref(`/kits/${key}`));
  const supabase = await createClient();
  const { kit, error, inactive } = await fetchKit(supabase, key);
  if (!kit) return <KitMissing kitKey={key} error={error} inactive={inactive} />;
  const [sourceAgents, refNames] = await Promise.all([
    fetchSourceAgents(supabase, kit.manifest.agents.map((a) => a.source_agent_id)),
    fetchRefNames(supabase, entityRefsIn(kit.manifest)),
  ]);
  return <KitDetail kit={kit} sourceAgents={sourceAgents} refNames={refNames} />;
}
