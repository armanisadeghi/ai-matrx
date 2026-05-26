import { CreateAgentAppFormWrapper } from "@/features/agent-apps/components/CreateAgentAppFormWrapper";

interface NewAgentAppPageProps {
  searchParams: Promise<{ agent_id?: string }>;
}

/**
 * /agent-apps/new — pure UI surface. No data is fetched server-side; the
 * wrapper pulls a thin agent list from Redux only when no agent is preselected,
 * and fetches the chosen agent's full row on demand. Two reasons:
 *   1. No agent-id in the URL → user wants to pick one → thin list is all we need.
 *   2. Agent-id in the URL → we already know which agent → no list at all,
 *      just the chosen one's full row when a card that needs it is clicked.
 */
export default async function NewAgentAppPage({
  searchParams,
}: NewAgentAppPageProps) {
  const params = await searchParams;
  const preselectedAgentId = params.agent_id ?? null;

  return (
    <div className="h-full flex flex-col overflow-hidden bg-textured">
      <div className="flex-1 overflow-y-auto">
        {/* Width is managed inside the wrapper now — the 6-card grid
            centers itself with `max-w-7xl`; Live Builder uses the full
            viewport so the preview pane can breathe. */}
        <CreateAgentAppFormWrapper preselectedAgentId={preselectedAgentId} />
      </div>
    </div>
  );
}
