/**
 * THE GUARD: one unreadable row must cost exactly one row.
 *
 * 🚨 THE DEFECT THIS EXISTS FOR, and why it is not hypothetical. On 2026-09-18 a
 * single Job whose `estimate.estimate_token` had gone missing blanked the ENTIRE
 * running-jobs panel on /libraries — every sibling job that parsed perfectly
 * disappeared with it, and Cancel became unreachable for all of them. The cause
 * was `Array.prototype.map` with a throwing parser, which aborts the whole array
 * on the first bad entry. This console reads FIVE registers, four of which carry
 * a server-written `jsonb` column, so it is the same gun pointed at three tables
 * at once.
 *
 * WHAT MAKES THIS TEST FAIL (the production changes, named):
 *   · swap `mapListRows` for `items.map(parseOne)` in contract.ts
 *       → "renders every readable row" and "the whole page survives" go red
 *   · stop pushing parse failures onto `problems`
 *       → "names the row it dropped" goes red
 *   · silently coerce a bad row instead of dropping it
 *       → "drops exactly one row" goes red (four rows, not three)
 *   · print "0 transcripts" where the server reported no yield at all
 *       → "never invents a yield" goes red
 *
 * The page render half asserts on the ROWS THAT REACHED THE TABLE, which is the
 * claim itself: the table component is stubbed so this stays a test of the data
 * path and not of the design system.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import {
  parseLibraries,
  rollUpLibraries,
  type LibraryFacts,
} from "../contract";

// ── Stubs: the page's three environment seams ──────────────────────────────

const ORG = "5dc930e9-bd65-44a1-8369-af773f6e1a5b";
const USER = "87a6e699-3622-4869-8843-d0867456c0dd";

/** Rows the fake database hands back, keyed `schema.table`. */
const tables: Record<string, unknown[]> = {};

/** A thenable query builder: every method returns itself, awaiting resolves. */
function builder(key: string) {
  const chain: Record<string, unknown> = {};
  const passthrough = [
    "select",
    "eq",
    "neq",
    "is",
    "in",
    "or",
    "order",
    "limit",
  ];
  for (const name of passthrough) {
    chain[name] = () => chain;
  }
  chain.then = (
    resolve: (value: { data: unknown[]; error: null }) => unknown,
  ) => resolve({ data: tables[key] ?? [], error: null });
  return chain;
}

jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    auth: {
      getClaims: async () => ({ data: { claims: { sub: USER } } }),
    },
    schema: (schema: string) => ({
      from: (table: string) => builder(`${schema}.${table}`),
    }),
  },
}));

jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: () => ORG,
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock("@/features/shell/components/header/PageHeader", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

/** The table, reduced to the one thing this test is about: which rows arrived. */
jest.mock("@ai-matrx/design-system/data-table", () => ({
  MatrxDataTable: ({
    data,
    getRowId,
  }: {
    data: unknown[];
    getRowId: (row: unknown) => string;
  }) => (
    <div data-testid="table">
      {data.map((row) => (
        <div key={getRowId(row)} data-rowid={getRowId(row)} />
      ))}
    </div>
  ),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { AcquisitionConsolePage } =
  require("../AcquisitionConsolePage") as typeof import("../AcquisitionConsolePage");

// ── Fixtures ───────────────────────────────────────────────────────────────

/** Three good Libraries and ONE whose `id` is a number, which is not a Library. */
const LIBRARY_ROWS: unknown[] = [
  {
    id: "lib-1",
    adapter: "youtube",
    name: "Parth Knows AI",
    item_count: 242,
    last_synced_at: "2026-09-19T19:40:29Z",
    updated_at: "2026-09-19T19:40:29Z",
    metrics: { transcripts: { ready: 4, none: 238 } },
    visibility: "personal",
    created_by: USER,
  },
  {
    // THE UNREADABLE ROW. `id` is the one field a Library cannot do without.
    id: 42,
    adapter: "youtube",
    name: "Broken",
    item_count: 1,
    metrics: {},
  },
  {
    id: "lib-3",
    adapter: "youtube",
    name: "Huygens Optics",
    item_count: 80,
    last_synced_at: "2026-09-19T08:08:47Z",
    updated_at: "2026-09-19T08:08:47Z",
    metrics: { transcripts: { ready: 0, none: 71, skipped: 9 } },
    visibility: "personal",
    created_by: USER,
  },
  {
    id: "lib-4",
    adapter: "slack_export",
    name: "slack-export.zip",
    item_count: 560,
    updated_at: "2026-09-19T20:02:19Z",
    // No `transcripts`, no `total_items` — this adapter reported no yield.
    metrics: { adapter: "slack_export" },
    visibility: "internal",
    created_by: USER,
  },
  {
    // Somebody ELSE's personal Library, reaching this seat through a share.
    id: "lib-5",
    adapter: "youtube",
    name: "A colleague's channel",
    item_count: 12,
    updated_at: "2026-09-17T00:00:00Z",
    metrics: { transcripts: { ready: 1, none: 11 } },
    visibility: "personal",
    created_by: "someone-else",
  },
];

function seed() {
  tables["media.source_library"] = LIBRARY_ROWS;
  tables["platform.masterwork_source"] = [];
  tables["platform.rulebook"] = [];
  tables["users.integration_connections"] = [
    {
      id: "conn-1",
      provider: "github",
      owner_type: "user",
      status: "needs_attention",
      account_email: "admin@admin.com",
      last_verified_at: "2026-09-18T15:17:45Z",
      last_error: "GitHub would not renew this account's permission.",
    },
  ];
  tables["platform.acquisition_block"] = [
    {
      id: "block-1",
      input_ref: "https://example.com/a",
      input_label: "A page",
      error_class: "bot_wall",
      error_sentence: "The site answered with a bot check.",
      unblock_note: "Open it in your own browser.",
      first_seen_at: "2026-09-18T00:00:00Z",
      last_seen_at: "2026-09-19T00:00:00Z",
      occurrence_count: 3,
      status: "open",
    },
  ];
  tables["media.capture_handoff"] = [];
}

// ── The narrowing half ─────────────────────────────────────────────────────

describe("one unreadable Library costs exactly one row", () => {
  it("renders every readable row", () => {
    const parsed = parseLibraries(LIBRARY_ROWS);
    expect(parsed.rows.map((row: LibraryFacts) => row.id)).toEqual([
      "lib-1",
      "lib-3",
      "lib-4",
      "lib-5",
    ]);
  });

  it("drops exactly one row", () => {
    expect(parseLibraries(LIBRARY_ROWS).rows).toHaveLength(
      LIBRARY_ROWS.length - 1,
    );
  });

  it("names the row it dropped, in the words of the field that broke", () => {
    const { problems } = parseLibraries(LIBRARY_ROWS);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("libraries[1].id");
    expect(problems[0]).toContain("Nothing has been guessed or hidden");
  });

  it("still counts the yield of the rows that survived", () => {
    const rolled = rollUpLibraries(parseLibraries(LIBRARY_ROWS).rows, USER);
    const youtube = rolled.find((row) => row.id === "library:youtube::personal");
    expect(youtube?.count).toBe(2);
    expect(youtube?.items).toBe(322);
    expect(youtube?.yield).toBe("4 transcripts ready");
  });

  it("never merges two visibility lanes into one count", () => {
    const rolled = rollUpLibraries(parseLibraries(LIBRARY_ROWS).rows, USER);
    // Four surviving Libraries, three lanes — never one undifferentiated pile.
    expect(rolled.map((row) => row.lane).sort()).toEqual([
      "Shared with you",
      "This workspace",
      "Yours only",
    ]);
    const shared = rolled.find(
      (row) => row.id === "library:youtube::shared-with-you",
    );
    expect(shared?.count).toBe(1);
    expect(shared?.lane).toBe("Shared with you");
  });

  it("never invents a yield the server did not report", () => {
    const rolled = rollUpLibraries(parseLibraries(LIBRARY_ROWS).rows, USER);
    const slack = rolled.find(
      (row) => row.id === "library:slack_export::internal",
    );
    expect(slack?.yield).toBe("Not reported yet");
    // A "not reported" row sorts below a real zero rather than posing as one.
    expect(slack?.yieldCount).toBeLessThan(0);
  });
});

// ── The page half ──────────────────────────────────────────────────────────

describe("the whole page survives an unreadable row", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    seed();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  async function mount() {
    await act(async () => {
      root.render(<AcquisitionConsolePage />);
    });
    // One more tick for the auth claim and the five reads to settle.
    await act(async () => {
      await Promise.resolve();
    });
  }

  it("still renders all three tables", async () => {
    await mount();
    expect(host.querySelectorAll('[data-testid="table"]')).toHaveLength(3);
  });

  it("keeps the rows that read fine, in every section", async () => {
    await mount();
    const ids = [...host.querySelectorAll("[data-rowid]")].map((node) =>
      node.getAttribute("rowid") ?? node.getAttribute("data-rowid"),
    );
    // Two source kinds survived the bad Library, and the other two registers
    // are untouched by it — the failure did not spread past its own row.
    expect(ids).toContain("library:youtube::personal");
    expect(ids).toContain("library:slack_export::internal");
    expect(ids).toContain("conn-1");
    expect(ids).toContain("block:block-1");
  });

  it("says out loud which row it refused to show", async () => {
    await mount();
    expect(host.textContent).toContain("libraries[1].id");
  });
});
