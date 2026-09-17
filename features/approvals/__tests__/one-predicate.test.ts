/**
 * FORCING TESTS for THE ONE WILL-RENDER PREDICATE and the sentences built on it
 * (round-2 hostile verification, common-docs
 * `/projects/google-native/VERIFY-U-P4-U-M1-R2.md` § A-i, A-ii, A-viii, A-2,
 * plus Bugbot round 9 finding 9).
 *
 * The badge, the section header and the list used to disagree in three ways:
 *
 * 1. A-i — the badge shared the queue's ACTION narrowing but not its KIND
 *    REGISTRATION, so a pending row whose `proposalKind` no registered kind
 *    renders was counted in the badge and shown nowhere ("1 waiting" over an
 *    empty screen). The producer's own `RENDERED_PROPOSAL_KINDS` warning exists
 *    for exactly that window (a new action registered in aidream before the
 *    frontend registers its kind).
 * 2. A-ii — the section header printed the raw server `count`, which includes
 *    rows the narrowing DROPPED (an unrecognised `mode`, a future action shape).
 *    Header said 3 over two visible rows while the badge, which re-narrowed,
 *    said 2.
 * 3. Bugbot 9 — `?item=<a pending keyword row>` was answered "still waiting on
 *    you, past the first page of this list", but the keyword kinds are never
 *    mounted on a person-scoped queue at all.
 *
 * All three are now ONE predicate (`../rendered.ts`), asked by the badge, by
 * the store seam that feeds the header, and by the deep-link read.
 */

const mockGetAssistById = jest.fn();
const mockReadAllRows = jest.fn();
const mockQueryAssists = jest.fn();

jest.mock("@/features/assists/service", () => ({
  getAssistById: (...args: unknown[]) => mockGetAssistById(...args),
  queryAssists: (...args: unknown[]) => mockQueryAssists(...args),
  decideAssist: jest.fn(),
  emitAssist: jest.fn(),
}));
jest.mock("@ai-matrx/data/db", () => ({
  readAllRows: (...args: unknown[]) => mockReadAllRows(...args),
}));
jest.mock("@/utils/supabase/client", () => ({
  createClient: () => ({
    schema: () => ({
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => ({
                is: () => ({ order: () => ({ range: () => ({}) }) }),
              }),
            }),
          }),
        }),
      }),
    }),
  }),
}));

// eslint-disable-next-line import/first -- after the mocks above
import {
  countPendingProposals,
  listPendingProposals,
  readProposalStatus,
} from "../data";
// eslint-disable-next-line import/first -- after the mocks above
import { APPROVALS_EMPTY_BODY } from "../empty-state";
// eslint-disable-next-line import/first -- after the mocks above
import {
  __resetRenderWarningsForTests,
  mountedApprovalKinds,
  willRenderRow,
} from "../rendered";
// eslint-disable-next-line import/first -- after the mocks above
import type { ApprovalKind } from "../types";

/** A stand-in registry: two Google kinds and one that needs a site. */
const registered = [
  { id: "sheet_write", label: "Spreadsheet change" },
  { id: "gmail_send", label: "Email to send" },
  {
    id: "keyword_meaning",
    label: "Keyword meaning",
    reads: "keyword_meaning",
    // A kind reading a non-default family declares BOTH halves of the contract:
    // whether it renders this row on this mount, and where the row is when it
    // does not (`../types.ts`). The real kind compares the row's site to the
    // mount's; this stand-in does the same.
    rendersRow: (
      action: { kind: string; siteId?: string },
      queueScope: { siteId?: string },
    ) =>
      action.kind === "apply_keyword_meaning" &&
      Boolean(queueScope.siteId) &&
      action.siteId === queueScope.siteId,
    rowElsewhere: (action: { kind: string; siteId?: string }) =>
      action.kind === "apply_keyword_meaning"
        ? {
            explain: `this proposal belongs to the website ${action.siteId}.`,
            where: { label: "Open the site's keyword review", href: "/marketing" },
          }
        : null,
    scopeRequirement: {
      field: "siteId",
      explain: "these wait with the website they belong to.",
      where: { label: "Open the site's keyword review", href: "/marketing" },
    },
  },
] as unknown as ApprovalKind[];

const personScope = { key: "u1", organizationId: "o1", userId: "u1" };

function proposal(proposalKind: string) {
  return {
    kind: "approval_proposal" as const,
    proposalKind,
    mode: "mode_4" as const,
    payload: { __kind: `${proposalKind}_dry_run`, preview: {}, arguments: {} },
    operatorUserId: "u1",
  };
}

const keywordAction = {
  kind: "apply_keyword_meaning",
  siteId: "s1",
  proposal: {},
  provenance: {},
  payloadHash: "h",
};

let warned: string[] = [];

beforeEach(() => {
  warned = [];
  // The warning is de-duplicated per row and reason for the life of the module,
  // so each case starts from a clean slate.
  __resetRenderWarningsForTests();
  mockGetAssistById.mockReset();
  mockReadAllRows.mockReset();
  mockQueryAssists.mockReset();
  jest.spyOn(console, "warn").mockImplementation((...args: unknown[]) => {
    warned.push(args.map(String).join(" "));
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("the predicate is the same one everywhere", () => {
  it("mounts exactly the kinds a person-scoped queue can read", () => {
    const mounted = mountedApprovalKinds(registered, personScope);
    expect(mounted.map((kind) => kind.id)).toEqual([
      "sheet_write",
      "gmail_send",
    ]);
  });

  it("refuses a row whose kind nothing registered renders, naming the kind", () => {
    const mounted = mountedApprovalKinds(registered, personScope);
    const verdict = willRenderRow(proposal("future_kind"), {
      kinds: mounted,
      scope: personScope,
    });
    expect(verdict.renders).toBe(false);
    if (verdict.renders) throw new Error("unreachable");
    expect(verdict.why).toContain("future_kind");
  });
});

describe("badge, header and list agree on an unregistered kind (A-i, A-ii)", () => {
  const unregistered = { id: "row-1", action: proposal("future_kind") };

  it("BADGE: does not count it, and says the kind out loud", async () => {
    mockReadAllRows.mockResolvedValue([unregistered]);
    const mounted = mountedApprovalKinds(registered, personScope);

    await expect(countPendingProposals("u1", mounted, personScope)).resolves.toBe(0);
    expect(warned.join(" ")).toContain("future_kind");
  });

  it("HEADER + LIST: the total counts what the screen shows, not the server count", async () => {
    // The server counted three pending rows for this kind's source key. One
    // carries a `mode` outside the five (the narrowing drops it before this
    // module sees it) and one names a kind nothing renders.
    mockQueryAssists.mockResolvedValue({
      rows: [
        {
          id: "row-1",
          status: "pending",
          createdAt: "2026-09-17T00:00:00Z",
          action: proposal("future_kind"),
        },
      ],
      // Two raw rows matched: the one above, plus one the narrowing refused
      // before this module ever saw it (an unrecognised `mode`).
      total: 2,
      unreadable: 1,
    });

    const page = await listPendingProposals("u1", "sheet_write", personScope);
    expect(page.proposals).toHaveLength(0);
    // 2 server rows − 1 unreadable − 1 unrenderable kind = 0 on screen.
    expect(page.total).toBe(0);
    expect(warned.join(" ")).toContain("future_kind");
  });
});

describe("a deep link to a row this list never mounts says where it lives", () => {
  it("answers not_in_this_list for a pending keyword row on a person queue", async () => {
    mockGetAssistById.mockResolvedValue({
      id: "k1",
      status: "pending",
      action: keywordAction,
      result: null,
    });
    const mounted = mountedApprovalKinds(registered, personScope);

    const read = await readProposalStatus({
      userId: "u1",
      proposalId: "k1",
      mounted,
      allKinds: registered,
      scope: personScope,
    });
    expect(read.status).toBe("not_in_this_list");
    // THE DOOR LAW: the answer carries the door to where the row IS.
    expect(read.where?.href).toBe("/marketing");
    expect(read.explain).toContain("website");
  });

  it("still answers pending for a row this queue does mount", async () => {
    mockGetAssistById.mockResolvedValue({
      id: "s1",
      status: "pending",
      action: proposal("sheet_write"),
      result: null,
    });
    const mounted = mountedApprovalKinds(registered, personScope);
    await expect(
      readProposalStatus({
      userId: "u1",
      proposalId: "s1",
      mounted,
      allKinds: registered,
      scope: personScope,
    }),
    ).resolves.toMatchObject({ status: "pending" });
  });

  it("answers not_a_proposal for one of this person's other assists", async () => {
    mockGetAssistById.mockResolvedValue({
      id: "x",
      status: "pending",
      action: { kind: "run_mandate", mandateKey: "k", variables: {} },
      result: null,
    });
    const mounted = mountedApprovalKinds(registered, personScope);
    await expect(
      readProposalStatus({
      userId: "u1",
      proposalId: "x",
      mounted,
      allKinds: registered,
      scope: personScope,
    }),
    ).resolves.toMatchObject({ status: "not_a_proposal" });
  });
});

describe("a failed or in-flight apply is never reported as decided (A-iii)", () => {
  it("reports a failed apply as failed, with the reason", async () => {
    mockGetAssistById.mockResolvedValue({
      id: "f1",
      // B-8's contract returns a failed apply to `pending`; the pre-B-8 row
      // stayed `accepted`. Both must read as "the change was NOT made".
      status: "accepted",
      action: proposal("sheet_write"),
      result: {
        __kind: "google_workspace_approval_receipt",
        state: "failed",
        error: "Google refused the range A1:C10.",
      },
    });
    const mounted = mountedApprovalKinds(registered, personScope);
    const read = await readProposalStatus({
      userId: "u1",
      proposalId: "f1",
      mounted,
      allKinds: registered,
      scope: personScope,
    });
    expect(read.status).toBe("apply_failed");
    expect(read.error).toContain("A1:C10");
  });

  it("reports an apply still running as applying", async () => {
    mockGetAssistById.mockResolvedValue({
      id: "a1",
      status: "accepted",
      action: proposal("sheet_write"),
      result: {
        __kind: "google_workspace_approval_receipt",
        state: "applying",
        started_at: "2026-09-17T00:00:00Z",
      },
    });
    const mounted = mountedApprovalKinds(registered, personScope);
    await expect(
      readProposalStatus({
      userId: "u1",
      proposalId: "a1",
      mounted,
      allKinds: registered,
      scope: personScope,
    }),
    ).resolves.toMatchObject({ status: "applying" });
  });

  it("reports an applied row as decided", async () => {
    mockGetAssistById.mockResolvedValue({
      id: "d1",
      status: "accepted",
      action: proposal("sheet_write"),
      result: {
        __kind: "google_workspace_approval_receipt",
        state: "applied",
        output: {},
      },
    });
    const mounted = mountedApprovalKinds(registered, personScope);
    await expect(
      readProposalStatus({
      userId: "u1",
      proposalId: "d1",
      mounted,
      allKinds: registered,
      scope: personScope,
    }),
    ).resolves.toMatchObject({ status: "decided" });
  });
});

describe("the empty state promises only what the producer files (A-2)", () => {
  it("does not promise email drafts, which the producer excludes by design", () => {
    // `aidream/services/google_workspace/approvals.py`: "the Gmail review card
    // IS the authorization and never enters this path".
    expect(APPROVALS_EMPTY_BODY.toLowerCase()).not.toContain("email");
    expect(APPROVALS_EMPTY_BODY.toLowerCase()).not.toContain("gmail");
  });

  it("names what does arrive here", () => {
    const said = APPROVALS_EMPTY_BODY.toLowerCase();
    expect(said).toContain("doc");
    expect(said).toContain("sheet");
  });
});

describe("there is no client-side producer (A-viii)", () => {
  it("the store seam exports no proposal writer", async () => {
    const seam: Record<string, unknown> = await import("../data");
    // A client-produced row carries no `metadata.google_workspace`, so BOTH
    // server doors refuse it by design (403) — it could be neither approved nor
    // rejected and would never leave the list. The server is the ONE producer.
    expect(seam.proposeApproval).toBeUndefined();
  });
});

describe("there is no client-side mode ladder either (A-vii)", () => {
  it("`mode.ts` is gone and no module in this feature reads an hitl knob", () => {
    const { existsSync, readFileSync, readdirSync, statSync } =
      jest.requireActual<typeof import("node:fs")>("node:fs");
    const { join } = jest.requireActual<typeof import("node:path")>("node:path");
    const root = join(__dirname, "..");
    expect(existsSync(join(root, "mode.ts"))).toBe(false);

    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        if (entry === "__tests__") continue;
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.tsx?$/.test(entry)) files.push(full);
      }
    };
    walk(root);
    expect(files.length).toBeGreaterThan(5);
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      // A knob read in the browser would be a SECOND opinion about who may
      // write: the server resolves the mode and answers 202 with a filed
      // proposal when review is required. Mentions in prose are fine; a read is
      // not — `useEffectiveKnob`/`ensureEffectiveKnob` are how one is made.
      expect(source).not.toMatch(/(use|ensure)EffectiveKnob/);
    }
  });
});
