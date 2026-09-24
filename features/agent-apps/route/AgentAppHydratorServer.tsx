/**
 * AgentAppHydratorServer
 *
 * Server Component that fetches the app row and hands it to the client
 * hydrator. Intended to live inside the [id] layout so every sub-route
 * (overview, code, versions, settings, run, etc.) gets a consistent
 * Redux-seeded view of the app without re-fetching.
 *
 * Mirrors features/agents/route/AgentHydratorServer.tsx.
 */

import { getAgentApp } from "@/lib/agent-apps/data";
import { getAgent } from "@/lib/agents/data";
import { AgentAppHydrator } from "./AgentAppHydrator";
import { AgentHydrator } from "@/features/agents/route/AgentHydrator";

/**
 * Server-component layout helper. Fetches the app row, plus the live
 * agent definition that powers it, and hands both to client hydrators.
 *
 * Why both: every sub-route under /agent-apps/[id] needs the agent's
 * variableDefinitions / contextPolicies / settings to render the management
 * UI (variables card, version picker, etc). Resolving on the server here
 * avoids a client-side fetch waterfall and means selectAgentById can
 * return real data on first paint.
 *
 * Version-pinned apps still hydrate the LIVE agent today — the variables
 * card on the overview shows live data with a "pinned to v{n}; may
 * differ" note. A separate fetch path that resolves the version snapshot
 * lands later.
 */
function isNotFoundError(error: unknown): boolean {
  const digest =
    typeof error === "object" && error !== null && "digest" in error
      ? (error as { digest?: unknown }).digest
      : undefined;
  return (
    typeof digest === "string" &&
    (digest === "NEXT_NOT_FOUND" ||
      digest.startsWith("NEXT_HTTP_ERROR_FALLBACK;404"))
  );
}

export async function AgentAppHydratorServer({
  appId,
}: {
  appId: string;
}) {
  // getAgentApp() throws notFound() on a null read. Thrown from the [id]
  // LAYOUT, that escapes [id]/not-found.tsx to the root 404, so a missing /
  // denied app never reached the access gate. Seed nothing instead (as
  // AgentHydratorServer does); the page's own getAgentApp() call throws the
  // notFound() that [id]/not-found.tsx turns into <AccessGate>.
  let app: Awaited<ReturnType<typeof getAgentApp>>;
  try {
    app = await getAgentApp(appId);
  } catch (error) {
    if (isNotFoundError(error)) return null;
    throw error;
  }
  const agent = await getAgent(app.agent_id).catch(() => null);
  return (
    <>
      <AgentAppHydrator app={app} />
      {agent && <AgentHydrator definition={agent} />}
    </>
  );
}
