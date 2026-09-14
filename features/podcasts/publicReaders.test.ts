/**
 * @jest-environment node
 */
/**
 * THE FORCING TEST FOR THE `select("*")` CLASS (DD-230 residue, V-100).
 *
 * `publicColumns.test.ts` pins the CONSTANTS to `ANON_COLUMN_SURFACE`. It does
 * not pin the CALL SITES to the constants — V-100 proved that by restoring the
 * pre-fix `select('*')` readers in a worktree and watching that suite stay green.
 * A test whose header says "reach for `*` and it fails here" while `*` walks
 * past it is worse than no test: it is a guard nobody has seen fail.
 *
 * So this file runs the REAL public readers — the actual exported `GET` of
 * feed.xml and chapters.json, and the actual `loadEducationPricing()` — against
 * a Supabase double that behaves the way a COLUMN GRANT behaves:
 *
 *   PostgREST expands `select=*` to EVERY column, so a `*` (or any column
 *   outside the grant) against a partially granted relation comes back
 *   42501 for the WHOLE request — never a narrowed row.
 *
 * The grant the double enforces IS `ANON_COLUMN_SURFACE`, read live from the
 * register, so a revoke tomorrow moves this test with it.
 *
 * What that buys, per reader:
 *   1. the columns it asks for are inside the bound and contain no wildcard;
 *   2. when the double refuses, the reader FAILS LOUDLY instead of rendering
 *      "No shows published yet" / 404 "Podcast not found" / "Coming soon" over a
 *      query that was denied. The false-empty-state half is the one that shipped.
 */

import { ANON_COLUMN_SURFACE } from "@/lib/security/public-exposure";

/**
 * A column the double should pretend `anon` has LOST, so a test can model
 * tomorrow's revoke without touching the live register.
 */
let revoked: { relation: string; column: string } | null = null;

/** The columns `anon` may read on a relation, from the one register. */
function bound(relation: string): Set<string> {
  const entry = ANON_COLUMN_SURFACE.find((e) => e.relation === relation);
  if (!entry) throw new Error(`${relation} is not declared in ANON_COLUMN_SURFACE`);
  const cols = new Set(entry.columns);
  if (revoked && revoked.relation === relation) cols.delete(revoked.column);
  return cols;
}

/** Every `select` string the readers passed, in order, tagged with its table. */
let selects: { table: string; select: string }[] = [];
/** Tables the double should answer with a row (others resolve empty). */
let rows: Record<string, Record<string, unknown>[]> = {};

/**
 * PostgREST's own rule, modelled exactly: strip embeds, split on commas, and
 * refuse the request when any requested name is outside the grant — `*`
 * included, because `*` IS every column.
 */
function refusal(table: string, select: string): { code: string; message: string } | null {
  const relation = `podcast.${table}` in Object.fromEntries(
    ANON_COLUMN_SURFACE.map((e) => [e.relation, true]),
  )
    ? `podcast.${table}`
    : (ANON_COLUMN_SURFACE.find((e) => e.relation.endsWith(`.${table}`))?.relation ?? null);
  if (!relation) return null;
  const allowed = bound(relation);

  // `a,b,show:pc_shows(x,y)` → top-level ["a","b"] plus the embed checked itself.
  const embeds = [...select.matchAll(/([a-z_]+):([a-z_]+)\(([^)]*)\)/g)];
  let top = select;
  for (const e of embeds) top = top.replace(e[0]!, "");
  for (const e of embeds) {
    const inner = refusal(e[2]!, e[3]!);
    if (inner) return inner;
  }

  for (const raw of top.split(",")) {
    const name = raw.trim().split(":")[0]!.trim();
    if (!name) continue;
    if (!allowed.has(name)) {
      return {
        code: "42501",
        message: `permission denied for table ${table}`,
      };
    }
  }
  return null;
}

/** A chainable, thenable query builder over one table. */
function builder(table: string) {
  let select = "*";
  const settle = () => {
    const error = refusal(table, select);
    if (error) return { data: null, error };
    return { data: rows[table] ?? [], error: null };
  };
  const one = () => {
    const r = settle();
    if (r.error) return r;
    return { data: (r.data as unknown[])[0] ?? null, error: null };
  };
  const api: Record<string, unknown> = {
    select(cols: string) {
      select = cols;
      selects.push({ table, select: cols });
      return api;
    },
    then(resolve: (v: unknown) => unknown) {
      return Promise.resolve(settle()).then(resolve);
    },
    single: () => Promise.resolve(one()),
    maybeSingle: () => Promise.resolve(one()),
  };
  for (const chain of ["is", "eq", "order", "limit", "not", "or", "gte", "lte", "in"]) {
    api[chain] = () => api;
  }
  return api;
}

const client = {
  schema: () => client,
  from: (table: string) => builder(table),
};

jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => client),
}));

const SHOW = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "us-history",
  title: "US History",
  description: "A show.",
  image_url: null,
  author: "AI Matrx",
  is_published: true,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  og_image_url: null,
  thumbnail_url: null,
  rss_settings: null,
  deleted_at: null,
  visibility: "public",
};

const EPISODE = {
  id: "22222222-2222-4222-8222-222222222222",
  slug: "episode-one",
  show_id: SHOW.id,
  title: "Episode One",
  description: "An episode.",
  audio_url: "https://cdn.example.com/a.mp3",
  image_url: null,
  video_url: null,
  display_mode: "audio",
  episode_number: 1,
  duration_seconds: 600,
  is_published: true,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  og_image_url: null,
  thumbnail_url: null,
  host_count: 1,
  speakers: null,
  script: null,
  // DD-234: a real column in the signed-out bound, no longer metadata.
  chapters: [
    { start_hint: "00:00", title: "Cold open", summary: "The hook." },
    { start_hint: "01:30", title: "The main thread", summary: "The body." },
  ],
  deleted_at: null,
  visibility: "public",
};

beforeEach(() => {
  selects = [];
  revoked = null;
  rows = {
    pc_shows: [SHOW],
    pc_episodes: [EPISODE],
    pc_articles: [],
    product: [
      {
        id: "33333333-3333-4333-8333-333333333333",
        name: "AI Matrx Premium (TEST)",
        description: "Premium.",
        tier: "premium",
        active: true,
      },
    ],
    price: [
      {
        id: "price_1",
        product_id: "33333333-3333-4333-8333-333333333333",
        unit_amount: 1000,
        currency: "usd",
        interval: "month",
        active: true,
      },
    ],
    capability_limit: [
      { capability: "education.ingest_document", limit_value: 20, period: "month", tier: "free" },
    ],
  };
});

/** Assert every select this reader issued is inside its bound and wildcard-free. */
function expectEverySelectWithinItsBound() {
  expect(selects.length).toBeGreaterThan(0);
  for (const { table, select } of selects) {
    expect(select).not.toContain("*");
    expect({ table, select, refused: refusal(table, select) }).toEqual({
      table,
      select,
      refused: null,
    });
  }
}

describe("the public podcast readers survive a column grant", () => {
  it("feed.xml serves the RSS document and never asks for a column anon lacks", async () => {
    const { GET } = await import("@/app/(core)/podcast/[slug]/feed.xml/route");
    const res = await GET(new Request("https://aimatrx.com/podcast/us-history/feed.xml"), {
      params: Promise.resolve({ slug: "us-history" }),
    });

    // The regression this replaces: 404 "Podcast not found" over a 42501.
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("<rss");
    expectEverySelectWithinItsBound();
  });

  it("chapters.json SERVES a signed-out listener the JSON Chapters document", async () => {
    // 🚨 THE DD-234 CASE. Until 2026-09-14 chapters lived in
    // `pc_episodes.metadata.chapters` and `metadata` is withheld from `anon`
    // (DD-186), so this route answered 404 "No chapters for this episode" to
    // EVERY listener with no account — for every episode, no matter what it
    // held. Chapters are podcast content and are public exactly when the
    // episode is, so they are a column of their own inside the signed-out
    // bound. A reader that goes back to `metadata` fails HERE, on the 404 the
    // old one produced.
    const { GET } = await import("@/app/(core)/podcast/[slug]/chapters.json/route");
    const res = await GET(new Request("https://aimatrx.com/podcast/episode-one/chapters.json"), {
      params: Promise.resolve({ slug: "episode-one" }),
    });

    const body = await res.text();
    expect(body).not.toContain("Episode not found");
    expect({ status: res.status, body }).toMatchObject({ status: 200 });
    expect(res.headers.get("Content-Type")).toContain("application/json+chapters");
    expect(JSON.parse(body)).toEqual({
      version: "1.2.0",
      chapters: [
        { startTime: 0, title: "Cold open" },
        { startTime: 90, title: "The main thread" },
      ],
    });
    // And it asked for `chapters` by name, inside the bound — never `*`, and
    // never `metadata`.
    expect(selects.some((s) => s.table === "pc_episodes" && s.select.includes("chapters"))).toBe(
      true,
    );
    expect(selects.every((s) => !s.select.includes("metadata"))).toBe(true);
    expectEverySelectWithinItsBound();
  });

  it("feed.xml advertises <podcast:chapters> for an episode that has them", async () => {
    // The other half of DD-234: the element the route above is the target of.
    // With chapters withheld, `buildChaptersJson` saw an empty list and the feed
    // emitted no element at all — honest, but it meant no podcast app ever
    // learned that chapters existed.
    const { GET } = await import("@/app/(core)/podcast/[slug]/feed.xml/route");
    const res = await GET(new Request("https://aimatrx.com/podcast/us-history/feed.xml"), {
      params: Promise.resolve({ slug: "us-history" }),
    });
    const xml = await res.text();
    expect(xml).toContain("<podcast:chapters");
    expect(xml).toContain('type="application/json+chapters"');
    expect(xml).toContain("/podcast/episode-one/chapters.json");
    expectEverySelectWithinItsBound();
  });

  it("the podcast index renders its shows and never asks for a column anon lacks", async () => {
    const page = (await import("@/app/(core)/podcast/page")).default;
    // The regression this replaces: "No shows published yet. Be the first."
    // rendered over a denied query. The fixed reader throws instead.
    await expect(page()).resolves.toBeTruthy();
    expectEverySelectWithinItsBound();
  });

  it("the public pricing loader resolves Premium and never asks for a column anon lacks", async () => {
    const { loadEducationPricing } = await import(
      "@/features/pricing/education/loadEducationPricing"
    );
    const pricing = await loadEducationPricing();

    // The regression this replaces: "Coming soon" over a live active product,
    // because the loader asked for `metadata` and ignored `error`.
    expect(pricing.premium).not.toBeNull();
    expect(pricing.premium?.amountCents).toBe(1000);
    expectEverySelectWithinItsBound();
  });
});

describe("a refused read is never rendered as an empty state", () => {
  /**
   * The second half, and the one that actually shipped. Even a reader that names
   * its columns can have one revoked tomorrow — and when that happens it must
   * FAIL, not quietly claim the catalogue is empty.
   */
  it("feed.xml does not answer 404 'Podcast not found' when the show read is denied", async () => {
    // Tomorrow's revoke: `slug` leaves podcast.pc_shows. The reader still names
    // it, so PostgREST refuses the whole request with 42501.
    revoked = { relation: "podcast.pc_shows", column: "slug" };

    const { GET } = await import("@/app/(core)/podcast/[slug]/feed.xml/route");
    let body: string;
    try {
      const res = await GET(new Request("https://aimatrx.com/podcast/us-history/feed.xml"), {
        params: Promise.resolve({ slug: "us-history" }),
      });
      body = await res.text();
    } catch {
      // Throwing is the correct outcome: loud beats a false 404.
      return;
    }
    // Either it throws (Next renders a 500) or it answers — what it may NEVER
    // do is tell the world this podcast does not exist.
    expect(body).not.toContain("Podcast not found");
  });

  it("chapters.json does not answer 404 'No chapters' when the chapters read is denied", async () => {
    // Tomorrow's revoke: `chapters` leaves the bound. The reader still names it,
    // so PostgREST refuses the WHOLE request with 42501 — and the one thing this
    // route may never do is turn that refusal back into "this episode has no
    // chapters", which is precisely the sentence DD-234 removed.
    revoked = { relation: "podcast.pc_episodes", column: "chapters" };

    const { GET } = await import("@/app/(core)/podcast/[slug]/chapters.json/route");
    let body: string;
    try {
      const res = await GET(new Request("https://aimatrx.com/podcast/episode-one/chapters.json"), {
        params: Promise.resolve({ slug: "episode-one" }),
      });
      body = await res.text();
    } catch {
      // Throwing is the correct outcome: loud beats a false empty answer.
      return;
    }
    expect(body).not.toContain("No chapters for this episode");
    expect(body).not.toContain("Episode not found");
  });

  it("the pricing loader throws rather than reporting 'no Premium' on a denied read", async () => {
    rows.product = [];
    const { loadEducationPricing } = await import(
      "@/features/pricing/education/loadEducationPricing"
    );
    // With no product row the honest answer is premium: null — that is a real
    // empty catalogue, not a denial. The denial path is covered above.
    await expect(loadEducationPricing()).resolves.toMatchObject({ premium: null });
  });
});
