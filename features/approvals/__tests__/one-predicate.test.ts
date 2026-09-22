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
// Only the seams are stood in for, and this one keeps the rest of its module: a bare
// factory leaves `createActiveOrgCookie` undefined, and `../data` now reaches it through
// `awaitOrganizationForRecordRead` -> appContextSlice -> activeOrgCookie, so the suite
// cannot even import (SETTINGS-3, 2026-09-22).
jest.mock("@ai-matrx/data/db", () => ({
  ...jest.requireActual("@ai-matrx/data/db"),
  readAllRows: (...args: unknown[]) => mockReadAllRows(...args),
}));
// The queue's page size is `approvals.queue_page_size`, resolved through the
// register. What this suite measures is the predicate, not the register, so the
// row is served here at its seeded default.
jest.mock("@/lib/scoped-config/effectiveKnobs", () => ({
  ensureEffectiveKnob: async () => 50,
  useEffectiveKnob: () => 50,
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

  it("HEADER + LIST: the total counts what the screen SHOWS — including the honest refusals", async () => {
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

    // The seam takes the asking kind's REAL registration (§ A-N5), so this is
    // the registered `sheet_write` from the stand-in registry above.
    const sheetWrite = registered.find((entry) => entry.id === "sheet_write");
    if (!sheetWrite) throw new Error("unreachable");
    const page = await listPendingProposals("u1", sheetWrite, personScope);
    expect(page.proposals).toHaveLength(0);
    /**
     * 🚨 NOT ZERO, SINCE 2026-09-17 (round-3 verification § A-N6). Both rows ARE
     * on screen — as honest rows saying this build cannot show them — so the
     * total counts them. Subtracting them is what made one such row print
     * "Nothing is waiting on you" over a durable pending proposal.
     */
    expect(page.total).toBe(2);
    expect(page.unrenderable).toHaveLength(2);
    expect(page.unrenderable.map((row) => row.kindId).sort()).toEqual([
      "future_kind",
      null,
    ]);
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
  /**
   * 🚨 WHAT THIS GUARD IS FOR, NARROWED 2026-09-17 (round-3 verification § A-N7).
   * It was written against a client-side MODE ladder: a browser that resolves
   * `hitl.google.autonomy_mode` is a second opinion about WHO MAY WRITE, and the
   * server already answers that by filing a proposal and replying 202. That ban
   * stands.
   *
   * The REVIEW WINDOW is a different question with a different authority. The
   * apply door refuses an expired proposal with 403 carrying the whole expiry
   * sentence, and the frontend had no reader of `review_timeout_hours` at all —
   * so an expired row rendered with a live Approve button and could not say so
   * until AFTER the click (§ A-N7, the round's assigned measurement). Reading it
   * to REMOVE a control whose refusal is already known grants nothing: the 403 is
   * still what stops a write. So exactly ONE module may read a knob here, it may
   * read only that knob, and nothing may read a mode knob.
   */
  const WINDOW_READER = "review-window.ts";

  /**
   * 🚨 A KNOB READ IN THIS FEATURE IS DECLARED HERE OR IT FAILS (SETTINGS-3,
   * 2026-09-22). The ban this guard enforces is on a second AUTHORITY: nothing
   * in the browser may resolve who is allowed to write. It was written when the
   * review window was the only knob this feature had, so it said "exactly one
   * module, exactly one knob" — and law 6 then made the queue's page size a knob
   * too (`approvals.queue_page_size`), which is a data-volume opinion and no
   * kind of permission. Narrowing the guard to a DECLARED set keeps the forcing
   * function exactly as sharp: a new reader still fails this test until someone
   * writes down which knob it reads and why that knob is not an authority.
   */
  const DECLARED_READERS: ReadonlyArray<{
    file: string;
    knob: string;
    why: string;
  }> = [
    {
      file: "review-window.ts",
      knob: "hitl.google.review_timeout_hours",
      why: "removes a control whose 403 refusal the server already decided; it grants nothing",
    },
    {
      file: "data.ts",
      knob: "approvals.queue_page_size",
      why: "how many proposals one page reads — a data-volume setting, not a permission",
    },
    {
      file: "ApprovalsWorkspace.tsx",
      knob: "approvals.queue_page_size",
      why: "the same row, so the sentence on screen can never name a page size the read did not use",
    },
  ];

  it("`mode.ts` is gone and every knob read here is declared, and none is a mode", () => {
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
    let readers = 0;
    let windowReaders = 0;
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      // Mentions in prose are fine; a read is not — `useEffectiveKnob` /
      // `ensureEffectiveKnob` are how one is made.
      if (/(use|ensure)EffectiveKnob/.test(source)) {
        const declared = DECLARED_READERS.find((entry) =>
          file.endsWith(entry.file),
        );
        // An undeclared reader fails here BY NAME, with the file that added it.
        expect(
          declared ? file : `${file} reads a knob but is not in DECLARED_READERS`,
        ).toBe(declared ? file : "declared");
        if (!declared) continue;
        readers += 1;
        // Never a mode: a mode resolved in the browser is the second authority
        // this guard exists to forbid.
        expect(source).not.toContain("autonomy_mode");
        if (file.endsWith(WINDOW_READER)) windowReaders += 1;
      }
    }
    // AND THE DECLARED KNOB IS THE ONE THE FEATURE ACTUALLY NAMES. A reader may
    // import the `{ feature, key }` pair from a sibling rather than spell it,
    // so the address is looked for across the feature, not in each file: a
    // declaration naming a knob nothing here holds is a declaration that has
    // gone stale.
    const everySource = files
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");
    for (const entry of DECLARED_READERS) {
      const key = entry.knob.slice(entry.knob.lastIndexOf(".") + 1);
      expect(everySource).toContain(key);
    }

    // The review-window reader EXISTS: an expired row with a live Approve button
    // is the defect it replaced, so its absence is a regression, not a clean
    // slate. And every reader that exists is one of the declared ones.
    expect(windowReaders).toBe(1);
    expect(readers).toBe(DECLARED_READERS.length);
  });
});
