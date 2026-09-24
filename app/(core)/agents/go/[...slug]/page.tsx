/**
 * /agents/go/<id> — THE ALWAYS-VALID AGENT ADDRESS.
 *
 * A caller that holds only an id cannot know where that agent opens: a builtin
 * lives under /administration/agents/system-agents/agents, a user agent under
 * /agents, and the id may not be an agent id at all — the platform stores
 * VERSION ids in agent-shaped columns. `features/agents/addressing` resolves
 * that on the client, but resolution takes a round trip, and a link that has
 * to WAIT before it works is a link that is dead when the round trip fails.
 *
 * This route is the synchronous answer: an href anyone can build with nothing
 * but an id, which resolves server-side and sends the browser to the real
 * address FOR THIS VIEWER — a builtin opens in the admin tree for a Matrx admin
 * and in the ordinary `/agents` shell for everyone else (a non-admin sent to
 * the admin tree lands on Welcome) — or says, in a sentence, that there is
 * nothing there. No link in
 * this app needs to guess a shell ever again.
 *
 * (The client resolver still upgrades hrefs in place once it knows, so hover,
 * middle-click and copy-link show the true destination and skip the hop.)
 */

import { redirect } from "next/navigation";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { createClient } from "@/utils/supabase/server";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import { checkIsUserAdmin } from "@/utils/supabase/userSessionData";
import { agentPathFor } from "@/features/agents/addressing/agentAddress";

interface ResolveRow {
  input_id: string;
  is_version: boolean;
  agent_id: string;
  agent_type: string | null;
  agent_name: string | null;
  version_number: number | null;
}

export const metadata = { title: "Opening agent…" };

export default async function AgentGoPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const [id, ...rest] = slug ?? [];
  // Sub-route and query ride through VERBATIM, so `/agents/go/<id>/run?x=1`
  // is a drop-in for `/agents/<id>/run?x=1` at any call site that holds an id
  // and cannot know the agent's kind.
  const sub = rest.length ? `/${rest.join("/")}` : "";
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) {
    if (typeof v === "string") query.set(k, v);
    else if (Array.isArray(v)) for (const one of v) query.append(k, one);
  }
  const suffix = query.size ? `?${query}` : "";

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("agx_resolve_agent_address", {
    p_ids: [id],
  });

  const row = ((data ?? []) as ResolveRow[])[0];

  if (row) {
    // Only a builtin's address depends on the viewer, so only a builtin pays
    // for the admin read. The same test the `(admin)` layout gates on.
    const { user } = row.agent_type === "builtin" ? await getServerAuth() : { user: null };
    const isAdmin = user ? await checkIsUserAdmin(supabase, user.id) : false;
    // The sub-route comes from OUR route segments, never from a raw string,
    // and is re-validated anyway: an arbitrary value here would be an open
    // redirect inside the app.
    const safeSub = sub && /^\/[a-z0-9/_-]+$/i.test(sub) ? sub : "";
    redirect(
      `${agentPathFor(
        {
          agentId: row.agent_id,
          agentType: row.agent_type,
          isVersion: row.is_version,
          versionNumber: row.version_number,
        },
        safeSub,
        { isAdmin },
      )}${suffix}`,
    );
  }

  // NOTHING FAILS SILENTLY. Two different truths, two different sentences:
  // the read failed, or the record genuinely is not there.
  const failed = Boolean(error);
  if (failed) {
    console.error(
      "[agent-address] LOUD: /agents/go could not resolve an agent id; the " +
        "user is being told the truth rather than sent to a guessed shell.",
      { id, error },
    );
  }

  // The canonical access gate tells denied / deleted / never existed / fault
  // apart. The error crosses the server->client boundary as a plain object.
  return (
    <div className="h-full overflow-hidden pt-[var(--shell-header-h)]">
      <AccessGate
        token="agent"
        id={id ?? ""}
        error={
          error
            ? {
                message: error.message,
                code: error.code,
                details: error.details,
                hint: error.hint,
              }
            : undefined
        }
        fallbackHref="/agents/all"
        fallbackLabel="Your agents"
      />
    </div>
  );
}
