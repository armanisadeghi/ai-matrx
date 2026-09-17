/**
 * FORCING TESTS for the store seam's two reads (`../data.ts`), both raised by
 * Bugbot on frontend PR 228. Since 2026-09-17 both ask THE ONE WILL-RENDER
 * PREDICATE (`../rendered.ts`) over the kinds the asking mount carries — the
 * round-2 verification's § A-i/A-ii cases live in `./one-predicate.test.ts`:
 *
 * 1. THE BADGE COUNTS WHAT THE QUEUE SHOWS. The count was a head-only SQL
 *    `count` over every pending row on the approval surface, so a row whose
 *    `action` this build cannot read was counted and never rendered: "2
 *    waiting" over an empty screen. It now runs the SAME narrowing the queue's
 *    kinds run.
 * 2. A DEEP LINK TO SOMETHING THAT IS NOT AN APPROVAL SAYS SO. Any pending
 *    assist of the viewer's used to answer `?item=` as "still waiting on you,
 *    beyond the first page" — sending the reader hunting through a queue the
 *    item was never in.
 *
 * Plus a census guard: every assist action kind an approval kind module reads
 * must be in `APPROVAL_ASSIST_ACTION_KINDS`, or a kind added with a third
 * action shape would silently go back to being reported as "not an approval".
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const mockGetAssistById = jest.fn();
const mockReadAllRows = jest.fn();

jest.mock("@/features/assists/service", () => ({
  getAssistById: (...args: unknown[]) => mockGetAssistById(...args),
  queryAssists: jest.fn(),
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
  APPROVAL_ASSIST_ACTION_KINDS,
  countPendingProposals,
  readProposalStatus,
} from "../data";
// eslint-disable-next-line import/first -- after the mocks above
import type { ApprovalKind } from "../types";

/**
 * The kinds a person-scoped mount carries, as the queue hands them to both
 * reads. Two Google kinds; the keyword kinds need a site and are not here.
 */
const mounted = [
  { id: "sheet_write", label: "Spreadsheet change" },
  { id: "gmail_send", label: "Email to send" },
  {
    id: "keyword_meaning",
    label: "Keyword meaning",
    reads: "keyword_meaning",
    // A kind reading a non-default family must say, per row and per mount,
    // whether it renders THAT row — the real one compares the row's site to the
    // mount's (`../kinds/seo/keyword-rows.ts`). A stand-in that skipped this
    // renders nothing, by contract, because "some keyword kind is mounted" was
    // exactly the wrong answer (Bugbot round 10 #1).
    rendersRow: (action: { kind: string; siteId?: string }, scope: { siteId?: string }) =>
      action.kind === "apply_keyword_meaning" && action.siteId === scope.siteId,
    rowElsewhere: (action: { kind: string; siteId?: string }) =>
      action.kind === "apply_keyword_meaning"
        ? {
            explain: `this proposal belongs to ${action.siteId}.`,
            where: { label: "Open that site's queue", href: "/marketing" },
          }
        : null,
  },
] as unknown as ApprovalKind[];

/** Where these reads stand: the person's own queue, over site `s1`'s rows. */
const scope = {
  key: "u1",
  organizationId: "o1",
  userId: "u1",
  siteId: "s1",
};

const proposalAction = {
  kind: "approval_proposal" as const,
  proposalKind: "sheet_write",
  mode: "mode_4" as const,
  payload: { __kind: "sheet_write_dry_run", preview: {}, arguments: {} },
  operatorUserId: "u1",
};

beforeEach(() => {
  mockGetAssistById.mockReset();
  mockReadAllRows.mockReset();
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("readProposalStatus", () => {
  it("says an id that is not an approval item is not one", async () => {
    mockGetAssistById.mockResolvedValue({
      id: "x",
      status: "pending",
      // A keyword-meaning chip: one of this person's assists, not a row any
      // kind mounted on /approvals can show at person scope.
      action: { kind: "run_mandate", mandateKey: "k", variables: {} },
    });
    await expect(
      readProposalStatus({ userId: "u1", proposalId: "x", mounted, scope }),
    ).resolves.toMatchObject({ status: "not_a_proposal" });
  });

  it("still reports a real pending proposal as pending", async () => {
    mockGetAssistById.mockResolvedValue({
      id: "x",
      status: "pending",
      action: proposalAction,
    });
    await expect(
      readProposalStatus({ userId: "u1", proposalId: "x", mounted, scope }),
    ).resolves.toMatchObject({ status: "pending" });
  });

  it("reports a decided proposal as decided, and a missing id as unknown", async () => {
    mockGetAssistById.mockResolvedValue({
      id: "x",
      status: "accepted",
      action: proposalAction,
    });
    await expect(
      readProposalStatus({ userId: "u1", proposalId: "x", mounted, scope }),
    ).resolves.toMatchObject({ status: "decided" });
    mockGetAssistById.mockResolvedValue(null);
    await expect(
      readProposalStatus({ userId: "u1", proposalId: "y", mounted, scope }),
    ).resolves.toMatchObject({ status: "unknown" });
  });

  it("accepts the keyword kinds' own action shape", async () => {
    // The three SEO kinds are registrations in THE registry, so their rows are
    // approval-queue rows too — reported by where they live, never as "not an
    // approval".
    mockGetAssistById.mockResolvedValue({
      id: "x",
      status: "pending",
      action: {
        kind: "apply_keyword_meaning",
        siteId: "s1",
        proposal: {},
        provenance: {},
        payloadHash: "h",
      },
    });
    // On a mount that DOES carry the keyword kinds it is an ordinary pending
    // row; on the person-scoped queue it is `not_in_this_list`, with the door —
    // see `./one-predicate.test.ts`.
    await expect(
      readProposalStatus({ userId: "u1", proposalId: "x", mounted, scope }),
    ).resolves.toMatchObject({ status: "pending" });
  });
});

describe("countPendingProposals", () => {
  it("counts the rows the queue can show and NOT the ones it drops", async () => {
    mockReadAllRows.mockResolvedValue([
      { id: "a", action: proposalAction },
      { id: "b", action: { ...proposalAction, proposalKind: "gmail_send" } },
      // Unreadable: no branch narrows this, so the queue renders nothing for it.
      // A badge that counted it would claim work nobody can see.
      { id: "c", action: { kind: "not_a_thing" } },
      // Readable, but not an approval row at all.
      { id: "d", action: { kind: "navigate", href: "/somewhere" } },
    ]);

    await expect(countPendingProposals("u1", mounted, scope)).resolves.toBe(2);
  });

  it("reads through readAllRows — a count treated as complete is never a bare select", async () => {
    mockReadAllRows.mockResolvedValue([]);
    await countPendingProposals("u1", mounted, scope);
    expect(mockReadAllRows).toHaveBeenCalledTimes(1);
  });
});

describe("APPROVAL_ASSIST_ACTION_KINDS is the whole census", () => {
  it("covers every assist action kind an approval kind module reads", () => {
    const root = join(__dirname, "..");
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

    const found = new Set<string>();
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(
        /action\.kind\s*[=!]==\s*"([a-z_]+)"/g,
      )) {
        found.add(match[1] as string);
      }
    }

    // The scan must actually see something, or it would pass by finding nothing.
    expect(found.size).toBeGreaterThan(0);
    for (const kind of found) {
      expect(APPROVAL_ASSIST_ACTION_KINDS).toContain(kind);
    }
  });
});
