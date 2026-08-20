// Connector-sourced imports through the SAME engine spine: the external id is
// carried from parse → plan → commit, dedups within the feed, matches previous
// syncs, and rides the resolve call as the strongest identity key.

import { commitImport, planImport } from "./engine";
import type { ParsedImportData } from "./types";

jest.mock("../service", () => ({
  addAffiliation: jest.fn(async () => undefined),
  ensurePrimaryContactPoints: jest.fn(async () => undefined),
  findExistingMediumOwners: jest.fn(async () => new Map()),
  findPartiesByDomains: jest.fn(async () => new Map()),
  findPartiesByNames: jest.fn(async () => new Map()),
  normalizeMediumValue: jest.fn((channel: string, raw: string) => ({
    valueKey: raw.trim().toLowerCase(),
  })),
  resolvePartiesBatch: jest.fn(async (inputs: unknown[]) =>
    inputs.map((_, index) => ({
      index,
      resolved: {
        partyId: `party-${index}`,
        displayName: "x",
        partyKind: "person",
        created: true,
        matchedBy: "created",
        canonicalFollowed: false,
        contactPointsAdded: 0,
        fieldsFilled: [],
      },
    })),
  ),
  resolvedPartyRef: jest.fn((resolved: { partyId: string }) => ({
    id: resolved.partyId,
    display_name: "x",
    party_kind: "person",
  })),
}));

import {
  findExistingMediumOwners,
  resolvePartiesBatch,
} from "../service";

function connectorParsed(
  rows: { name: string; email: string; externalId: string }[],
): ParsedImportData {
  return {
    headers: ["Full name", "Email"],
    rows: rows.map((r) => ({ "Full name": r.name, Email: r.email })),
    parseWarnings: [],
    format: "connector",
    sourceLabel: "Google Contacts (test@example.com)",
    connector: {
      providerKey: "google_people",
      platformSlug: "google_contacts",
      connectionId: "conn-1",
      incremental: false,
      deletedExternalIds: [],
    },
    rowMeta: rows.map((r) => ({ externalId: r.externalId })),
  };
}

const MAPPING = { "Full name": "display_name", Email: "email" } as const;

describe("connector imports through the shared engine", () => {
  beforeEach(() => {
    jest.mocked(findExistingMediumOwners).mockReset();
    jest.mocked(findExistingMediumOwners).mockResolvedValue(new Map());
    jest.mocked(resolvePartiesBatch).mockClear();
  });

  it("carries the external id onto the plan and dedups the feed by it", async () => {
    const plan = await planImport({
      parsed: connectorParsed([
        { name: "Ada Lovelace", email: "ada@a.example", externalId: "people/c1" },
        // Same source record listed again with a different email — the id wins.
        { name: "Ada L.", email: "ada@b.example", externalId: "people/c1" },
      ]),
      mapping: MAPPING,
      kind: "person",
      orgId: "org-1",
    });

    expect(plan.rows[0].externalId).toBe("people/c1");
    expect(plan.rows[0].status).toBe("create");
    expect(plan.rows[1].status).toBe("duplicate_in_file");
    expect(plan.rows[1].duplicateOfRow).toBe(1);
    expect(plan.connector?.platformSlug).toBe("google_contacts");
  });

  it("marks a previously-synced contact as existing via the external-id lookup", async () => {
    jest.mocked(findExistingMediumOwners).mockImplementation(
      async (args: { channel: string; platformSlug?: string }) =>
        args.channel === "external_id" && args.platformSlug === "google_contacts"
          ? new Map([
              [
                "people/c1",
                { id: "p-existing", display_name: "Ada", party_kind: "person" },
              ],
            ])
          : new Map(),
    );

    const plan = await planImport({
      parsed: connectorParsed([
        // No email overlap at all — only the source id links the two syncs.
        { name: "Ada Lovelace", email: "new@else.example", externalId: "people/c1" },
      ]),
      mapping: MAPPING,
      kind: "person",
      orgId: "org-1",
    });

    expect(plan.rows[0].status).toBe("exists");
    expect(plan.rows[0].existing?.id).toBe("p-existing");
    expect(plan.counts.create).toBe(0);
  });

  it("sends the external id to the resolver so the commit is idempotent", async () => {
    const plan = await planImport({
      parsed: connectorParsed([
        { name: "Ada Lovelace", email: "ada@a.example", externalId: "people/c1" },
      ]),
      mapping: MAPPING,
      kind: "person",
      orgId: "org-1",
    });
    await commitImport(plan, undefined, "Google Contacts (test@example.com)");

    const calls = jest.mocked(resolvePartiesBatch).mock.calls;
    const personCall = calls.at(-1)?.[0] as {
      externalIds?: { platform: string; value: string }[];
      source: string;
      sourceDetail?: string;
    }[];
    expect(personCall[0].externalIds).toEqual([
      { platform: "google_contacts", value: "people/c1" },
    ]);
    expect(personCall[0].source).toBe("import");
    expect(personCall[0].sourceDetail).toBe("Google Contacts (test@example.com)");
  });

  it("file imports (no connector) never send external ids", async () => {
    const parsed = connectorParsed([
      { name: "Ada Lovelace", email: "ada@a.example", externalId: "unused" },
    ]);
    delete parsed.connector;
    delete parsed.rowMeta;
    parsed.format = "csv";

    const plan = await planImport({
      parsed,
      mapping: MAPPING,
      kind: "person",
      orgId: "org-1",
    });
    await commitImport(plan);

    const inputs = jest.mocked(resolvePartiesBatch).mock.calls.at(-1)?.[0] as {
      externalIds?: unknown;
    }[];
    expect(inputs[0].externalIds).toBeUndefined();
    // And the external-id dedup lookup was never issued for a file source.
    const externalLookups = jest
      .mocked(findExistingMediumOwners)
      .mock.calls.filter(([args]) => args.channel === "external_id");
    expect(externalLookups).toHaveLength(0);
  });
});
