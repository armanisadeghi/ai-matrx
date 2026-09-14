/**
 * What THIS chat is actually wired to — the list the composer shows.
 *
 * Arman, 2026-09-14: "I don't see an MCP chip."
 *
 * He was right, and the reason was placement, not honesty. The honest
 * three-state chips (Connected / Needs re-auth / Not connected) shipped into
 * the Tools picker, which is two clicks and a three-row scroll box away. The
 * one line that DOES sit under the composer — `ChatConnectorStrip` — draws a
 * randomized three-of-the-catalog suggestion bag ("connect these"), so it can
 * (and on a live check did) show Nuxt / Clerk / Notion while this chat's own
 * servers, and a server attached seconds earlier, appear nowhere.
 *
 * The champion bar (Claude.ai and ChatGPT connectors, Cursor's MCP indicator):
 * what the conversation can reach is legible from the composer without opening
 * anything, and one click away from the place that changes it.
 *
 * This module is that list's ONE decision, kept pure so a test can prove it:
 * a server appears only because this chat is actually wired to it, its state
 * is the truthful one, and problems sort to the front where they get seen.
 */

import type { McpConnectionState } from "./connection-state";
import type { RunMcpAttachment } from "./run-attachments";

/** One catalog server as the caller already knows it. */
export interface ChatConnectionCatalogEntry {
  slug: string;
  name: string;
  state: McpConnectionState;
  reason: string | null;
}

/** One server this conversation is wired to, with the truth about it. */
export interface ChatConnection {
  slug: string;
  /** The server's display name; falls back to the slug when uncatalogued. */
  name: string;
  /** Truthful state: the run's own answer when it has one, else the catalog. */
  state: McpConnectionState;
  reason: string | null;
  /** Why it is in this chat: the agent's saved definition, or this run. */
  origin: "agent" | "run";
  /** What the last run actually did with it, when the run said. */
  runAttachment: RunMcpAttachment | undefined;
}

export interface SelectChatConnectionsInput {
  /** Slugs on the agent's saved definition — they ride every run. */
  agentServerSlugs: readonly string[] | undefined;
  /** Slugs added to THIS conversation only (`addedMcpServers`). */
  addedServerSlugs: readonly string[] | undefined;
  /** The catalog, already carrying each server's one truthful state. */
  catalog: readonly ChatConnectionCatalogEntry[];
  /** What the latest run reported per slug, indexed by slug. */
  runAttachments: Readonly<Record<string, RunMcpAttachment>>;
}

/** Problems first — a broken connection nobody sees is a screen that lies. */
const STATE_ORDER: Record<McpConnectionState, number> = {
  needs_reauth: 0,
  not_connected: 1,
  connected: 2,
};

/**
 * The servers this conversation is wired to, worst state first.
 *
 * A server the user merely *could* connect is never in this list — that is the
 * suggestion strip's job, and conflating the two is what hid the real ones.
 */
export function selectChatConnections({
  agentServerSlugs,
  addedServerSlugs,
  catalog,
  runAttachments,
}: SelectChatConnectionsInput): ChatConnection[] {
  const bySlug = new Map(catalog.map((entry) => [entry.slug, entry]));

  const origins = new Map<string, "agent" | "run">();
  for (const slug of agentServerSlugs ?? []) {
    if (slug) origins.set(slug, "agent");
  }
  for (const slug of addedServerSlugs ?? []) {
    if (slug && !origins.has(slug)) origins.set(slug, "run");
  }
  // A run that reported a slug proves the chat was wired to it, whatever the
  // local settings now say — the run is the harder evidence of the two.
  for (const slug of Object.keys(runAttachments)) {
    if (slug && !origins.has(slug)) origins.set(slug, "run");
  }

  const connections: ChatConnection[] = [...origins.entries()].map(
    ([slug, origin]) => {
      const entry = bySlug.get(slug);
      const runAttachment = runAttachments[slug];
      return {
        slug,
        name: entry?.name ?? slug,
        // The run's own answer wins: only it knows what the model was handed.
        state: runAttachment?.state ?? entry?.state ?? "not_connected",
        reason: runAttachment?.reason ?? entry?.reason ?? null,
        origin,
        runAttachment,
      };
    },
  );

  return connections.sort((a, b) => {
    const byState = STATE_ORDER[a.state] - STATE_ORDER[b.state];
    if (byState !== 0) return byState;
    return a.name.localeCompare(b.name);
  });
}
