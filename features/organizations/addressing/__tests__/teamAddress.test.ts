/**
 * THE TEAM DOOR, pinned.
 *
 * A team (`iam.team`) is managed on its ORGANIZATION's settings page, never
 * on a page of its own — so a caller holding only a team id cannot build its
 * address without first resolving the team's organization. These tests pin
 * the two halves of that resolver: the address SHAPES
 * (`teamOrgSettingsHref` / `teamIdResolverHref`) and the CACHE/MISS behaviour
 * of `resolveTeamOrganizationId`, mirroring
 * `features/agents/addressing/__tests__/agentAddress.test.ts`.
 */
import {
  __resetTeamAddressCache,
  peekTeamOrganizationId,
  resolveTeamOrganizationId,
  seedTeamOrganizationId,
  teamIdResolverHref,
  teamOrgSettingsHref,
  unresolvedTeamReason,
} from "../teamAddress";

jest.mock("@/features/organizations/service/teamsService", () => ({
  getTeamOrganizationId: jest.fn(),
}));

import { getTeamOrganizationId } from "@/features/organizations/service/teamsService";

const TEAM = "e9ed797c-2ae7-4e90-bf92-a2b85e3dac38";
const ORG = "6069a466-1445-42df-a64e-cf37ecdc1b99";

describe("the address shapes", () => {
  it("the org settings page's Teams section, deep-linked to the team", () => {
    expect(teamOrgSettingsHref(ORG, TEAM)).toBe(
      `/organizations/${ORG}/settings?team=${TEAM}#teams`,
    );
  });

  it("the synchronous resolver route — a real link, not a placeholder", () => {
    expect(teamIdResolverHref(TEAM)).toBe(`/teams/id/${TEAM}`);
  });

  it("both shapes URL-encode their ids", () => {
    const weird = "not a real/id";
    expect(teamOrgSettingsHref(ORG, weird)).toContain(encodeURIComponent(weird));
    expect(teamIdResolverHref(weird)).toBe(
      `/teams/id/${encodeURIComponent(weird)}`,
    );
  });
});

describe("resolving a team id to its organization", () => {
  beforeEach(() => {
    __resetTeamAddressCache();
    jest.mocked(getTeamOrganizationId).mockReset();
  });

  it("an unresolved id is a real miss, not a guess", () => {
    expect(peekTeamOrganizationId(TEAM)).toBeUndefined();
  });

  it("resolves through the RPC-backed service and then caches the answer", async () => {
    jest.mocked(getTeamOrganizationId).mockResolvedValue(ORG);
    const first = resolveTeamOrganizationId(TEAM);
    expect(first).toBeInstanceOf(Promise);
    await expect(first).resolves.toBe(ORG);
    expect(peekTeamOrganizationId(TEAM)).toBe(ORG);

    // Cached: a second call answers synchronously and never calls the service again.
    expect(resolveTeamOrganizationId(TEAM)).toBe(ORG);
    expect(getTeamOrganizationId).toHaveBeenCalledTimes(1);
  });

  it("a MISS (deleted, or an org the caller cannot see) is cached too — never re-asked forever", async () => {
    jest.mocked(getTeamOrganizationId).mockResolvedValue(null);
    await resolveTeamOrganizationId(TEAM);
    expect(peekTeamOrganizationId(TEAM)).toBeNull();
    expect(resolveTeamOrganizationId(TEAM)).toBeNull();
    expect(getTeamOrganizationId).toHaveBeenCalledTimes(1);
  });

  it("a malformed id never reaches the network", () => {
    expect(resolveTeamOrganizationId("not-a-uuid")).toBeNull();
    expect(getTeamOrganizationId).not.toHaveBeenCalled();
  });

  it("concurrent resolves for the same id share one in-flight request", async () => {
    let settle!: (v: string | null) => void;
    jest
      .mocked(getTeamOrganizationId)
      .mockReturnValue(new Promise((resolve) => (settle = resolve)));

    const a = resolveTeamOrganizationId(TEAM);
    const b = resolveTeamOrganizationId(TEAM);
    expect(a).toBe(b);
    settle(ORG);
    await expect(a).resolves.toBe(ORG);
    expect(getTeamOrganizationId).toHaveBeenCalledTimes(1);
  });

  it("a seeded answer (the caller already fetched the row) costs no read at all", () => {
    seedTeamOrganizationId(TEAM, ORG);
    expect(resolveTeamOrganizationId(TEAM)).toBe(ORG);
    expect(getTeamOrganizationId).not.toHaveBeenCalled();
  });

  it("names the id in the refusal, for the reader who only sees a sentence", () => {
    expect(unresolvedTeamReason(TEAM)).toContain(TEAM);
  });
});
