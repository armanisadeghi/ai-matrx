/**
 * WALL W7 — "ADD A LINK" THAT ATTACHED NOTHING.
 *
 * Masterwork methods census, 2026-09-15, `dump` Approach: a non-technical
 * Expert pasted a real article URL into "Add a link", confirmed it, and the
 * field went back to its placeholder with nothing staged. Twice, identically.
 * A file uploaded into the SAME pile a minute earlier worked — and that is the
 * whole tell: a file lands as an association row, a link lands on
 * `platform.rulebook.metadata.dump_url_sources`, which is written with a
 * compare-and-swap on the row's `version`.
 *
 * That version is moved by writes the Expert never makes. Every rules save
 * fires `pokeUnderstudy` → the server hook wakes the Coherence Partner, which
 * writes `metadata.coherence` back onto the same row a beat later, and
 * `platform._touch_row` bumps `version`. The page is holding a number the row
 * no longer has, so the link write misses — exactly the phantom conflict
 * `rulebookRebase.ts` documents and `saveRules` was fixed for (wall W12, the
 * same day). `writeDumpUrlSources` was the sibling nobody censused.
 *
 * These cases drive the REAL `writeDumpUrlSources` against a fake
 * `platform.rulebook` that behaves the way the live row does. Case 1 is the
 * wall and FAILS before the fix. Cases 2 and 3 are the other half of the
 * class: a rebase must never become an overwrite of what landed meanwhile.
 */

interface Row {
  id: string;
  version: number;
  rules: unknown[];
  sections: Record<string, unknown>;
  metadata: Record<string, unknown> | null;
  source: Record<string, unknown>;
  deleted_at: string | null;
}

let row: Row;
/** Fires once, between the CAS read and the CAS write, like the live Partner. */
let bumpBeforeNextWrite: (() => void) | null = null;

/** A fake `platform.rulebook` with the real row's CAS behaviour. */
function table() {
  const filters: Record<string, unknown> = {};
  let payload: Record<string, unknown> | null = null;
  const api = {
    update(next: Record<string, unknown>) {
      payload = next;
      return api;
    },
    select() {
      return api;
    },
    eq(col: string, val: unknown) {
      filters[col] = val;
      return api;
    },
    is() {
      return api;
    },
    async maybeSingle() {
      if (payload === null) {
        return { data: filters.id === row.id ? { ...row } : null, error: null };
      }
      if (bumpBeforeNextWrite) {
        const bump = bumpBeforeNextWrite;
        bumpBeforeNextWrite = null;
        bump();
      }
      if (filters.id !== row.id || filters.version !== row.version) {
        // CAS miss: PostgREST returns no row, not an error.
        return { data: null, error: null };
      }
      // Metadata-only write: the CALLER never sends `version`, the row's own
      // touch trigger bumps it.
      row = { ...row, ...payload, version: row.version + 1 } as Row;
      return { data: { ...row }, error: null };
    },
  };
  return api;
}


/**
 * THE `rulebook_save` DOOR, faked with the behaviour the LIVE one has.
 *
 * `platform` is not a client-writable schema (chair ruling, VERIFIER-8 HIGH-3), so the service
 * under test no longer sends an UPDATE to `platform.rulebook` — it calls `public.rulebook_save`,
 * which carries the compare-and-swap INSIDE the database and answers NULL on a miss. That is the
 * same three-state answer this fixture always modelled; only the transport moved.
 *
 * Two behaviours are modelled on purpose, because this guard is about exactly them:
 * the CAS (`p_expected_version`, a miss is NULL and not an error — a conflict retry must stay a
 * conflict) and the MERGE (`p_metadata_patch` merges into `metadata` at the top level, never
 * replacing the column; a fake that replaced it would pass a service that had kept its
 * read-modify-write, which is the defect the door exists to remove).
 */
function door(fn: string, args: Record<string, unknown>) {
  const id = args.p_rulebook_id as string;
  if (id !== row.id) return { data: null, error: null };
  if (bumpBeforeNextWrite) {
    const bump = bumpBeforeNextWrite;
    bumpBeforeNextWrite = null;
    bump();
  }
  if (args.p_expected_version !== row.version) {
    // CAS miss: the door returns NULL, not an error.
    return { data: null, error: null };
  }
  const patch = args.p_metadata_patch as Record<string, unknown> | undefined;
  row = {
    ...row,
    ...(args.p_rules === undefined ? {} : { rules: args.p_rules as unknown[] }),
    ...(args.p_sections === undefined
      ? {}
      : { sections: args.p_sections as Record<string, unknown> }),
    ...(patch === undefined
      ? {}
      : { metadata: { ...(row.metadata ?? {}), ...patch } }),
    // The client sends no `version`: the row's own touch trigger owns it.
    version: row.version + 1,
  } as Row;
  return { data: { ...row }, error: null };
}

jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    schema: () => ({ from: () => table() }),
    rpc: (fn: string, args: Record<string, unknown>) => Promise.resolve(door(fn, args)),
  },
}));

import { writeDumpUrlSources } from "../service";
import { dumpUrlSources } from "../types";
import type { DumpUrlSource, Rulebook } from "../types";

const ARTICLE: DumpUrlSource = {
  url: "https://express-press-release.net/news/2026/09/02/1770119",
  title: "Electronic Waste Recycling Market Growth",
  added_at: "2026-09-15T17:00:00.000Z",
};

/** What the Coherence Partner does, a beat after somebody else's save. */
function coherencePartnerWrites() {
  row = {
    ...row,
    version: row.version + 1,
    metadata: {
      ...(row.metadata ?? {}),
      coherence: { tensions: [], fingerprint: "abc" },
    },
  };
}

function baseFromRow(): Rulebook {
  return { ...row } as unknown as Rulebook;
}

beforeEach(() => {
  bumpBeforeNextWrite = null;
  row = {
    id: "rb1",
    version: 12,
    rules: [],
    sections: {},
    metadata: { intake: { goal: "triage e-waste" } },
    source: {},
    deleted_at: null,
  };
});

describe("Wall W7 — attaching a link while the row is being touched", () => {
  it("attaches the link even though the Coherence Partner moved the version", async () => {
    const base = baseFromRow();
    // The page is holding v12. Between its read and its write, the Partner
    // woken by an earlier save lands metadata.coherence and the row goes v13.
    bumpBeforeNextWrite = coherencePartnerWrites;

    const result = await writeDumpUrlSources({ rulebook: base, urls: [ARTICLE] });

    // Before the fix this came back "conflict" and the Expert was told to
    // "Add the link again" — forever, because the next attempt raced the same
    // way. The link must actually be attached.
    expect(result.status).toBe("saved");
    if (result.status !== "saved") return;
    expect(dumpUrlSources(result.rulebook).map((u) => u.url)).toEqual([
      ARTICLE.url,
    ]);
    // And the Partner's work survived — a rebase is not an overwrite.
    expect((row.metadata as Record<string, unknown>).coherence).toBeDefined();
    expect(
      ((row.metadata as Record<string, unknown>).intake as Record<string, unknown>),
    ).toEqual({ goal: "triage e-waste" });
  });

  it("keeps a link somebody else attached in the same window", async () => {
    const base = baseFromRow();
    const theirs: DumpUrlSource = {
      url: "https://example.org/their-source",
      added_at: "2026-09-15T17:01:00.000Z",
    };
    bumpBeforeNextWrite = () => {
      row = {
        ...row,
        version: row.version + 1,
        metadata: { ...(row.metadata ?? {}), dump_url_sources: [theirs] },
      };
    };

    const result = await writeDumpUrlSources({ rulebook: base, urls: [ARTICLE] });

    expect(result.status).toBe("saved");
    if (result.status !== "saved") return;
    expect(dumpUrlSources(result.rulebook).map((u) => u.url).sort()).toEqual(
      [ARTICLE.url, theirs.url].sort(),
    );
  });

  it("still removes only the link the Expert removed, never the other one", async () => {
    const theirs: DumpUrlSource = {
      url: "https://example.org/their-source",
      added_at: "2026-09-15T17:01:00.000Z",
    };
    row = {
      ...row,
      metadata: { ...(row.metadata ?? {}), dump_url_sources: [ARTICLE] },
    };
    const base = baseFromRow();
    // She removes the article (her list becomes empty); meanwhile their link
    // lands on the row.
    bumpBeforeNextWrite = () => {
      row = {
        ...row,
        version: row.version + 1,
        metadata: {
          ...(row.metadata ?? {}),
          dump_url_sources: [ARTICLE, theirs],
        },
      };
    };

    const result = await writeDumpUrlSources({ rulebook: base, urls: [] });

    expect(result.status).toBe("saved");
    if (result.status !== "saved") return;
    expect(dumpUrlSources(result.rulebook).map((u) => u.url)).toEqual([
      theirs.url,
    ]);
  });
});
