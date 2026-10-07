/**
 * AppletHydratorServer
 *
 * Server Component that fetches the app row and hands it to the client
 * hydrator. Intended to live inside the [id] layout so every sub-route
 * (overview, code, versions, settings, run, etc.) gets a consistent
 * Redux-seeded view of the app without re-fetching.
 *
 * Mirrors features/agents/route/AgentHydratorServer.tsx.
 */

import { getApplet } from "@/lib/applets/data";
import { AppletHydrator } from "./AppletHydrator";

/**
 * Reads the Applet record on the server and hands it to the client hydrator,
 * so every sub-route under /applets/manage/[id] renders without a fetch waterfall.
 * An Applet names jobs, never agents — there is no agent to hydrate.
 */
function isNotFoundError(error: unknown): boolean {
  const digest =
    typeof error === "object" && error !== null && "digest" in error
      ? (error as { digest?: unknown }).digest
      : undefined;
  return (
    typeof digest === "string" &&
    (digest === "NEXT_NOT_FOUND" || digest.startsWith("NEXT_HTTP_ERROR_FALLBACK;404"))
  );
}

export async function AppletHydratorServer({
  appId,
}: {
  appId: string;
}) {
  // getApplet() throws notFound() on a null read. Thrown from the [id]
  // LAYOUT, that escapes [id]/not-found.tsx to the root 404, so a missing /
  // denied app never reached the access gate. Seed nothing instead (as
  // AgentHydratorServer does); the page's own getApplet() call throws the
  // notFound() that [id]/not-found.tsx turns into <AccessGate>.
  let app: Awaited<ReturnType<typeof getApplet>>;
  try {
    app = await getApplet(appId);
  } catch (error) {
    if (isNotFoundError(error)) return null;
    throw error;
  }
  return <AppletHydrator app={app} />;
}
