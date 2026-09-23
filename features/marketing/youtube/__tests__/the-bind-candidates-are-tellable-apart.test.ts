/**
 * 🚨 EVERY BIND CANDIDATE IS TELLABLE APART (V-27 NEW-6).
 *
 * Live on a real seat the bind door rendered seven buttons, four of them reading
 * exactly "Bind Arman Sadeghi" — same words, different channels, no handle, no
 * id, no account, and the press wrote a binding the whole panel then reads from.
 * `channelBindCandidates` is the derivation those rows are built from, so the
 * distinguishing facts are proven HERE, over the resource rows the server
 * actually writes (`_discover_youtube`: `display_name`, `resource_ref`,
 * `metadata.custom_url`), rather than over rendered text alone.
 */

import {
  accountLabel,
  candidateIdentity,
  channelBindCandidates,
} from "../candidates";
import type { GoogleConnectionInventory } from "@/features/marketing/google/types";

function inventory(
  connections: Array<{ id: string; email: string | null; name?: string | null }>,
  resources: Array<{
    id: string;
    connectionId: string;
    channelId: string;
    displayName: string;
    customUrl?: string;
    discoveredAt?: string;
    resourceType?: string;
  }>,
): GoogleConnectionInventory {
  return {
    connections: connections.map((row) => ({
      id: row.id,
      account_email: row.email,
      account_name: row.name ?? null,
    })) as unknown as GoogleConnectionInventory["connections"],
    resources: resources.map((row) => ({
      id: row.id,
      connection_id: row.connectionId,
      resource_type: row.resourceType ?? "youtube_channel",
      resource_ref: row.channelId,
      display_name: row.displayName,
      permission_level: "owner",
      discovered_at: row.discoveredAt ?? "2026-09-01T00:00:00Z",
      metadata: row.customUrl ? { custom_url: row.customUrl } : {},
    })) as unknown as GoogleConnectionInventory["resources"],
  };
}

describe("channelBindCandidates", () => {
  it("carries the channel, its handle and the account each came through", () => {
    const [candidate] = channelBindCandidates(
      inventory(
        [{ id: "conn-1", email: "owner@allgreen.com" }],
        [
          {
            id: "res-1",
            connectionId: "conn-1",
            channelId: "UC_allgreen",
            displayName: "All Green Recycling",
            customUrl: "allgreen",
          },
        ],
      ),
    );
    expect(candidate).toMatchObject({
      channelId: "UC_allgreen",
      title: "All Green Recycling",
      // The server stores customUrl without the `@`; a person reads a handle.
      handle: "@allgreen",
      connectionId: "conn-1",
      account: "owner@allgreen.com",
      alsoDiscoveredThrough: [],
    });
    expect(candidateIdentity(candidate)).toBe("@allgreen");
  });

  it("falls back to the channel id when YouTube gave no handle — never nothing", () => {
    const [candidate] = channelBindCandidates(
      inventory(
        [{ id: "conn-1", email: "a@example.com" }],
        [
          {
            id: "res-1",
            connectionId: "conn-1",
            channelId: "UCnohandle",
            displayName: "Arman Sadeghi",
          },
        ],
      ),
    );
    expect(candidate.handle).toBeNull();
    expect(candidateIdentity(candidate)).toBe("UCnohandle");
  });

  it("collapses ONE channel seen through two accounts, and names the other one", () => {
    const candidates = channelBindCandidates(
      inventory(
        [
          { id: "conn-late", email: "second@example.com" },
          { id: "conn-first", email: "first@example.com" },
        ],
        [
          {
            id: "res-late",
            connectionId: "conn-late",
            channelId: "UC_same",
            displayName: "Arman Sadeghi",
            discoveredAt: "2026-09-05T00:00:00Z",
          },
          {
            id: "res-first",
            connectionId: "conn-first",
            channelId: "UC_same",
            displayName: "Arman Sadeghi",
            discoveredAt: "2026-09-01T00:00:00Z",
          },
        ],
      ),
    );
    expect(candidates).toHaveLength(1);
    // The binding stores ONE connection id, so the choice is made by the oldest
    // discovery and SAID, never left invisible.
    expect(candidates[0]).toMatchObject({
      resourceId: "res-first",
      connectionId: "conn-first",
      account: "first@example.com",
      alsoDiscoveredThrough: ["second@example.com"],
    });
  });

  it("keeps two DIFFERENT channels with the same title apart", () => {
    const candidates = channelBindCandidates(
      inventory(
        [
          { id: "conn-1", email: "james.grant@rinconplumbing.test" },
          { id: "conn-2", email: "maria.delgado@rinconplumbing.test" },
        ],
        [
          {
            id: "res-1",
            connectionId: "conn-1",
            channelId: "UC_one",
            displayName: "Arman Sadeghi",
            customUrl: "@armansadeghi",
          },
          {
            id: "res-2",
            connectionId: "conn-2",
            channelId: "UC_two",
            displayName: "Arman Sadeghi",
          },
        ],
      ),
    );
    expect(candidates).toHaveLength(2);
    expect(new Set(candidates.map(candidateIdentity)).size).toBe(2);
    expect(new Set(candidates.map((row) => row.account)).size).toBe(2);
  });

  it("ignores every resource type that is not a channel", () => {
    expect(
      channelBindCandidates(
        inventory(
          [{ id: "conn-1", email: "a@example.com" }],
          [
            {
              id: "res-1",
              connectionId: "conn-1",
              channelId: "property-123",
              displayName: "A GA4 property",
              resourceType: "analytics_property",
            },
          ],
        ),
      ),
    ).toEqual([]);
  });

  it("says plainly when an account cannot be named, rather than printing nothing", () => {
    expect(accountLabel(undefined)).toBe(
      "a connected Google account we cannot name",
    );
    const [candidate] = channelBindCandidates(
      inventory(
        [{ id: "conn-1", email: null, name: "Arman Sadeghi" }],
        [
          {
            id: "res-1",
            connectionId: "conn-1",
            channelId: "UC_one",
            displayName: "A channel",
          },
        ],
      ),
    );
    expect(candidate.account).toBe("Arman Sadeghi");
  });
});
