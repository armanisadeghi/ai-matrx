/**
 * FORCING TESTS — THE PAGE READ ASKS THE REAL REGISTRATION, NOT AN INVENTED ONE.
 *
 * Round-3 hostile verification (common-docs
 * `/projects/google-native/VERIFY-U-P4-U-M1-R3.md` § A-N5): `listPendingProposals`
 * asked THE ONE PREDICATE with a kind it made up —
 * `const kindsHere: ApprovalKind[] = [{ id: proposalKind } as ApprovalKind]`.
 * That object carries no `reads` and no `rendersRow`, so `familyOf` answered
 * `approval_proposal` for every asker and the seam could only ever judge one
 * family: `keyword_meaning`, whose real registration declares
 * `reads: "keyword_meaning"`, rendered `false` through the synthetic kind and
 * `false` through the real one. Nothing was broken while all seven askers read
 * the same family — and the `as ApprovalKind` is precisely what stopped the
 * compiler from saying that the next one would render nothing.
 *
 * So the seam takes the KIND, and two things are true of it now: the kind's own
 * recogniser decides (not a re-invented id comparison), and a kind that reads a
 * DIFFERENT family is refused BY NAME instead of being handed an empty page —
 * this read narrows `approval_proposal` rows and nothing else, and a silent
 * empty page over a store it cannot read is the omission this queue exists to
 * end.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const mockQueryAssists = jest.fn();

jest.mock("@/features/assists/service", () => ({
  getAssistById: jest.fn(),
  queryAssists: (...args: unknown[]) => mockQueryAssists(...args),
  decideAssist: jest.fn(),
  emitAssist: jest.fn(),
}));
jest.mock("@ai-matrx/data/db", () => ({ readAllRows: jest.fn() }));
// The queue's page size is `approvals.queue_page_size`, resolved through the
// register. What this suite measures is the predicate, not the register, so the
// row is served here at its seeded default.
jest.mock("@/lib/scoped-config/effectiveKnobs", () => ({
  ensureEffectiveKnob: async () => 50,
  useEffectiveKnob: () => 50,
}));
jest.mock("@/utils/supabase/client", () => ({
  createClient: () => ({ schema: () => ({ from: () => ({}) }) }),
}));

// eslint-disable-next-line import/first -- after the mocks above
import { listPendingProposals } from "../data";
// eslint-disable-next-line import/first -- after the mocks above
import { __resetRenderWarningsForTests } from "../rendered";
// eslint-disable-next-line import/first -- after the mocks above
import type { ApprovalKind } from "../types";

const personScope = { key: "u1", organizationId: "o1", userId: "u1" };

function row(id: string, proposalKind: string, operatorUserId: string) {
  return {
    id,
    status: "pending",
    createdAt: "2026-09-17T00:00:00Z",
    result: null,
    action: {
      kind: "approval_proposal" as const,
      proposalKind,
      mode: "mode_4" as const,
      payload: { __kind: `${proposalKind}_dry_run`, preview: {}, arguments: {} },
      operatorUserId,
    },
  };
}

/** A real registration shape — no cast past the contract. */
function kind(extra: Partial<ApprovalKind> = {}): ApprovalKind {
  return {
    id: "sheet_write",
    label: "Spreadsheet change",
    accept: { label: "Write it", keepsReason: false },
    reject: { label: "Leave it alone", keepsReason: true },
    useSource: () => {
      throw new Error("not used in this test");
    },
    useDecisions: () => {
      throw new Error("not used in this test");
    },
    ...extra,
  };
}

let warned: string[] = [];

beforeEach(() => {
  warned = [];
  __resetRenderWarningsForTests();
  mockQueryAssists.mockReset();
  jest.spyOn(console, "warn").mockImplementation((...args: unknown[]) => {
    warned.push(args.map(String).join(" "));
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("the real kind decides which rows are on this page", () => {
  it("honours the kind's OWN recogniser, not a re-derived id comparison", async () => {
    mockQueryAssists.mockResolvedValue({
      rows: [
        row("mine", "sheet_write", "u1"),
        row("someone-else", "sheet_write", "u2"),
      ],
      total: 2,
      unreadable: 0,
    });
    // This registration renders only the rows addressed to the mount's person —
    // exactly what a kind with a scope of its own does, and something the
    // synthetic `{ id }` could never express.
    const page = await listPendingProposals(
      "u1",
      kind({
        rendersRow: (action, scope) =>
          action.kind === "approval_proposal" &&
          action.proposalKind === "sheet_write" &&
          action.operatorUserId === scope.userId,
      }),
      personScope,
    );
    expect(page.proposals.map((p) => p.assist.id)).toEqual(["mine"]);
  });

  it("still renders the family's default way when a kind declares no recogniser", async () => {
    mockQueryAssists.mockResolvedValue({
      rows: [row("a", "sheet_write", "u1")],
      total: 1,
      unreadable: 0,
    });
    const page = await listPendingProposals("u1", kind(), personScope);
    expect(page.proposals).toHaveLength(1);
  });
});

describe("a kind reading another family is refused by name", () => {
  it("throws instead of answering with an empty page", async () => {
    mockQueryAssists.mockResolvedValue({ rows: [], total: 0, unreadable: 0 });
    await expect(
      listPendingProposals(
        "u1",
        kind({
          id: "keyword_meaning",
          reads: "keyword_meaning",
          rendersRow: () => true,
        }),
        personScope,
      ),
    ).rejects.toThrow(/keyword_meaning/);
    // And it never went to the store pretending to look.
    expect(mockQueryAssists).not.toHaveBeenCalled();
  });
});

describe("nothing casts past the kind contract here", () => {
  /** The seam's CODE, with its prose removed — a comment may quote the old cast. */
  const code = readFileSync(join(__dirname, "..", "data.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
  it("has no `as ApprovalKind` in the store seam", () => {
    expect(code).not.toContain("as ApprovalKind");
  });
});
