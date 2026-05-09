import { redirect } from "next/navigation";
import { getAgentApp } from "@/lib/agent-apps/data";

export const metadata = { title: "Run" };

interface RunPageProps {
  params: Promise<{ id: string }>;
}

/**
 * /agent-apps/[id]/run — redirects to the public app URL `/p/[slug]`.
 *
 * Apps are rendered by the public surface today; this sub-route exists so the
 * card "Run" action and any future deep links can hit a stable URL inside
 * the management space rather than guessing the slug. If we add an
 * authenticated runner with extra observability later, it lives here.
 */
export default async function AgentAppRunRedirect({ params }: RunPageProps) {
  const { id } = await params;
  const app = await getAgentApp(id);
  redirect(`/p/${app.slug}`);
}
