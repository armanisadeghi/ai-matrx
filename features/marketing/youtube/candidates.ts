/**
 * THE CHANNELS A BRAND CAN BE BOUND TO — one row per CHANNEL, never one per
 * discovered resource row.
 *
 * 🚨 THE DEFECT THIS FIXES (V-27 NEW-6). The bind door rendered one button per
 * `youtube_channel` resource labelled only `Bind ${display_name}`, and on a real
 * seat that read, verbatim: "Bind AI Matrx OAuth Review · Bind Arman Sadeghi ·
 * Bind Arman Sadeghi · Bind Arman Sadeghi · Bind Arman Sadeghi · Bind Titanium
 * Success, Inc. · Bind Titanium Success, Inc." Four buttons were
 * indistinguishable from one another: nothing said which Google account each
 * came through, what the channel's handle or id was, or whether two of them were
 * the SAME channel seen through two accounts. The press then wrote a binding the
 * whole panel reads from, silently.
 *
 * So a candidate carries the three facts that tell two channels apart — the
 * channel's title, its handle or id, and the account it was discovered through —
 * and identical channel ids collapse into ONE candidate that names every account
 * it was seen through. The binding stores a `connection_id`, so a collapsed
 * candidate has to choose one: it takes the EARLIEST discovered row, which is
 * stable across reloads, and the row and the confirmation both say which account
 * that is rather than leaving the choice invisible.
 *
 * This module is pure. The panel renders it and `binding.ts` writes it.
 */

import type {
  GoogleConnectionInventory,
  GoogleConnectionResource,
  GoogleConnectionSummary,
} from "@/features/marketing/google/types";

export interface ChannelBindCandidate {
  /** YouTube's channel id (`UC…`) — the identity the refresh resolves against. */
  channelId: string;
  /** The channel's own title, as YouTube reported it at discovery. */
  title: string;
  /** `@handle` when YouTube gave us one; otherwise null — never a guess. */
  handle: string | null;
  /** The discovered resource row the binding is written from. */
  resourceId: string;
  /** The connected Google account the refresh will spend its call on. */
  connectionId: string;
  /** That account, in words a person recognises. */
  account: string;
  /** Every OTHER account that discovered this same channel id. */
  alsoDiscoveredThrough: readonly string[];
}

/** The account in words: its email, else its name, else an honest absence. */
export function accountLabel(
  connection: GoogleConnectionSummary | undefined,
): string {
  const email = connection?.account_email?.trim();
  if (email) return email;
  const name = connection?.account_name?.trim();
  if (name) return name;
  return "a connected Google account we cannot name";
}

function handleOf(resource: GoogleConnectionResource): string | null {
  const raw = resource.metadata?.custom_url;
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) return null;
  return value.startsWith("@") ? value : `@${value}`;
}

/** Oldest discovery first; a row with no timestamp sorts last, never first. */
function discoveredAt(resource: GoogleConnectionResource): string {
  return resource.discovered_at?.trim() || "9999-12-31";
}

/**
 * Every owned channel the connected accounts discovered, one row per channel id.
 * Ordered by title so the list does not reshuffle between reads.
 */
export function channelBindCandidates(
  inventory: GoogleConnectionInventory | undefined,
): ChannelBindCandidate[] {
  const connections = new Map(
    (inventory?.connections ?? []).map((connection) => [connection.id, connection]),
  );
  const byChannel = new Map<string, GoogleConnectionResource[]>();
  for (const resource of inventory?.resources ?? []) {
    if (resource.resource_type !== "youtube_channel") continue;
    const channelId = resource.resource_ref?.trim();
    if (!channelId) continue;
    byChannel.set(channelId, [...(byChannel.get(channelId) ?? []), resource]);
  }

  const candidates = [...byChannel.entries()].map(([channelId, rows]) => {
    const ordered = [...rows].sort((a, b) =>
      discoveredAt(a).localeCompare(discoveredAt(b)),
    );
    const chosen = ordered[0];
    const accounts = ordered.map((row) =>
      accountLabel(connections.get(row.connection_id)),
    );
    return {
      channelId,
      title: chosen.display_name?.trim() || channelId,
      handle: handleOf(chosen),
      resourceId: chosen.id,
      connectionId: chosen.connection_id,
      account: accounts[0],
      // Deduped by account too: the same account listing one channel twice is
      // one account, not two.
      alsoDiscoveredThrough: [...new Set(accounts.slice(1))].filter(
        (account) => account !== accounts[0],
      ),
    } satisfies ChannelBindCandidate;
  });

  return candidates.sort(
    (a, b) => a.title.localeCompare(b.title) || a.channelId.localeCompare(b.channelId),
  );
}

/** `@handle` when there is one, else the channel id — never nothing. */
export function candidateIdentity(candidate: ChannelBindCandidate): string {
  return candidate.handle ?? candidate.channelId;
}
