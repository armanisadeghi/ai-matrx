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
 * address — or says, in a sentence, that there is nothing there. No link in
 * this app needs to guess a shell ever again.
 *
 * (The client resolver still upgrades hrefs in place once it knows, so hover,
 * middle-click and copy-link show the true destination and skip the hop.)
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createClient } from "@/utils/supabase/server";
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

  return (
    <div className="flex h-full w-full items-center justify-center p-8">
      <Card className="bg-textured w-full max-w-md border-destructive/30 p-8">
        <div className="flex flex-col items-center space-y-4 text-center">
          <div className="rounded-full bg-destructive/10 p-3">
            <AlertCircle className="h-8 w-8 text-destructive" />
          </div>
          <div>
            <h2 className="mb-2 text-xl font-semibold">
              {failed ? "Couldn’t look this agent up" : "No such agent"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {failed
                ? "The agent directory could not be read just now, so we can’t tell you where this record lives. Try again in a moment."
                : "Nothing was found for this id. It is not an agent or an agent version you can see, or it was deleted."}
            </p>
            <p className="mt-3 break-all font-mono text-xs text-muted-foreground/70">
              {id}
            </p>
          </div>
          <Link href="/agents/all">
            <Button>Back to Agents</Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
