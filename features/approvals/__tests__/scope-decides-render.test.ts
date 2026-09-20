/**
 * FORCING TESTS — THE MOUNT'S SCOPE IS PART OF "WILL THIS ROW RENDER".
 *
 * Bugbot round 10, finding 1 (frontend PR 228): the one predicate treated EVERY
 * `apply_keyword_meaning` row as on-screen the moment any keyword kind was
 * mounted. It asked only "does some mounted kind read this action shape?" — not
 * "does a mounted kind render THIS row, on THIS mount?". So on a site-scoped
 * queue for site A, a deep link to site B's keyword row answered `pending`, and
 * the queue told the reader it was "still waiting on you, past the first page of
 * this list" about a row that list can never show. The badge and the section
 * header could disagree with the screen the same way.
 *
 * Two of the three keyword kinds make it worse: `placement_drift` and
 * `topic_placement` read RPCs (`seo.gsc_offering_placement_drift`,
 * `listOfferingProposals`), never the assists ledger — so they turn NO
 * `apply_keyword_meaning` row into an item on any mount, while declaring they
 * read that family. Mounting either of them was enough to call every keyword row
 * on the platform "waiting here".
 *
 * The rule these hold shut: a kind answers whether IT renders a given row on a
 * given mount (kind + scope + action shape), and a row that belongs to another
 * site is `not_in_this_list` WITH THE DOOR to where it lives (THE DOOR LAW).
 */

const mockGetAssistById = jest.fn();
const mockReadAllRows = jest.fn();

jest.mock("@/features/assists/service", () => ({
  getAssistById: (...args: unknown[]) => mockGetAssistById(...args),
  queryAssists: jest.fn(),
  decideAssist: jest.fn(),
  emitAssist: jest.fn(),
}));
// Only the two seams are stood in for, and both keep the rest of their module:
// a bare factory would leave `createActiveOrgCookie` / `supabase` undefined and
// the REAL registry (which this suite insists on using) would not even import.
jest.mock("@ai-matrx/data/db", () => ({
  ...jest.requireActual("@ai-matrx/data/db"),
  readAllRows: (...args: unknown[]) => mockReadAllRows(...args),
}));
jest.mock("@/utils/supabase/client", () => ({
  ...jest.requireActual("@/utils/supabase/client"),
  createClient: () => ({}),
}));

// eslint-disable-next-line import/first -- after the mocks above
import { countPendingProposals, readProposalStatus } from "../data";
// eslint-disable-next-line import/first -- after the mocks above
import { APPROVAL_KINDS } from "../registry";
// eslint-disable-next-line import/first -- after the mocks above
import {
  __resetRenderWarningsForTests,
  mountedApprovalKinds,
  ROW_FAMILY_ACTION_KIND,
  willRenderRow,
} from "../rendered";

/** THE registry, the real one — a stand-in registry cannot catch this class. */
const registry = APPROVAL_KINDS;
const kindById = (id: string) => {
  const kind = registry.find((entry) => entry.id === id);
  if (!kind) throw new Error(`the registry no longer holds ${id}`);
  return kind;
};
const keywordMeaningKind = kindById("keyword_meaning");
const placementDriftKind = kindById("placement_drift");
const topicPlacementKind = kindById("topic_placement");

/** One mount: site A's own queue. */
const siteA = {
  key: "site-a",
  organizationId: "org-1",
  userId: "u1",
  siteId: "site-a",
  brandId: "brand-1",
  siteLabel: "alpha.example",
};
const siteB = {
  key: "site-b",
  organizationId: "org-1",
  userId: "u1",
  siteId: "site-b",
  brandId: "brand-1",
  siteLabel: "beta.example",
};

function keywordRow(siteId: string, siteLabel: string) {
  return {
    kind: "apply_keyword_meaning",
    siteId,
    siteLabel,
    proposal: {
      __kind: "keyword_meaning_proposal",
      proposal: "stamp",
      dimensionSlug: "intent",
      dimensionLabel: "Intent",
      valueId: "v1",
      valueSlug: "buy-now",
      valueLabel: "Buy now",
      keywordIds: ["k1"],
      keywordPhrases: ["blue widgets"],
    },
    provenance: { agentName: "the meaning agent" },
    payloadHash: "hash-1",
  };
}

let warned: string[] = [];

beforeEach(() => {
  warned = [];
  __resetRenderWarningsForTests();
  mockGetAssistById.mockReset();
  mockReadAllRows.mockReset();
  jest.spyOn(console, "warn").mockImplementation((...args: unknown[]) => {
    warned.push(args.map(String).join(" "));
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("two sites, one row each, one mount", () => {
  it("renders this site's keyword row and refuses the other site's", () => {
    const mounted = mountedApprovalKinds(registry, siteA);
    // The site queue really does mount all three keyword kinds.
    expect(mounted.map((kind) => kind.id)).toEqual(
      expect.arrayContaining(["keyword_meaning", "placement_drift", "topic_placement"]),
    );

    const mine = willRenderRow(keywordRow("site-a", "alpha.example"), {
      kinds: mounted,
      scope: siteA,
      allKinds: registry,
    });
    expect(mine.renders).toBe(true);
    if (!mine.renders) throw new Error("unreachable");
    expect(mine.kind.id).toBe("keyword_meaning");

    const theirs = willRenderRow(keywordRow("site-b", "beta.example"), {
      kinds: mounted,
      scope: siteA,
      allKinds: registry,
    });
    expect(theirs.renders).toBe(false);
    if (theirs.renders) throw new Error("unreachable");
    // And it says where the row IS, by name — never a silent omission.
    expect(theirs.elsewhere?.where.href).toContain("/marketing");
    expect(theirs.elsewhere?.explain).toContain("beta.example");
  });

  it("the badge over site A's queue counts only site A's row", async () => {
    mockReadAllRows.mockResolvedValue([
      { id: "row-a", action: keywordRow("site-a", "alpha.example") },
      { id: "row-b", action: keywordRow("site-b", "beta.example") },
    ]);
    const mounted = mountedApprovalKinds(registry, siteA);
    await expect(
      countPendingProposals("u1", mounted, siteA),
    ).resolves.toBe(1);
  });

  it("a deep link to the other site's row says so, with the door to that site", async () => {
    mockGetAssistById.mockResolvedValue({
      id: "row-b",
      status: "pending",
      action: keywordRow("site-b", "beta.example"),
      result: null,
    });
    const mounted = mountedApprovalKinds(registry, siteA);
    const read = await readProposalStatus({
      userId: "u1",
      proposalId: "row-b",
      mounted,
      allKinds: registry,
      scope: siteA,
    });
    expect(read.status).toBe("not_in_this_list");
    expect(read.explain).toContain("beta.example");
    expect(read.where?.href).toContain("/marketing");
  });

  it("the same row on ITS OWN site's queue is pending", async () => {
    mockGetAssistById.mockResolvedValue({
      id: "row-b",
      status: "pending",
      action: keywordRow("site-b", "beta.example"),
      result: null,
    });
    const mounted = mountedApprovalKinds(registry, siteB);
    const read = await readProposalStatus({
      userId: "u1",
      proposalId: "row-b",
      mounted,
      allKinds: registry,
      scope: siteB,
    });
    expect(read.status).toBe("pending");
  });
});

describe("a kind that reads no assist row never claims one", () => {
  it("placement_drift and topic_placement render no keyword ledger row", () => {
    for (const kind of [placementDriftKind, topicPlacementKind]) {
      const verdict = willRenderRow(keywordRow("site-a", "alpha.example"), {
        kinds: [kind],
        scope: siteA,
        allKinds: [kind],
      });
      expect(verdict.renders).toBe(false);
    }
    // …while the kind that DOES read them still does.
    const verdict = willRenderRow(keywordRow("site-a", "alpha.example"), {
      kinds: [keywordMeaningKind],
      scope: siteA,
      allKinds: registry,
    });
    expect(verdict.renders).toBe(true);
  });
});

describe("the kind contract can be answered for every registered kind", () => {
  it("a kind reading a non-default family declares how it recognises a row", () => {
    for (const kind of registry) {
      const family = kind.reads ?? "approval_proposal";
      if (family === "approval_proposal") continue;
      // The default recogniser (`kind.id === action.proposalKind`) only exists
      // for the `approval_proposal` family; anything else must say, per row and
      // per mount, whether it renders it — and where it lives when it does not.
      expect(typeof kind.rendersRow).toBe("function");
      expect(typeof kind.rowElsewhere).toBe("function");
      expect(ROW_FAMILY_ACTION_KIND[family]).toBeTruthy();
    }
  });
});
