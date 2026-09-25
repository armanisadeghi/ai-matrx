/**
 * FORCING FUNCTION (verify-RC-B8): wikilinks resolve in ONE batch per render,
 * a `[[note:<uuid>]]` links only when the record exists and the viewer can
 * read it, and a signed-out or refused lookup says "not available" — never a
 * live link to nowhere, never an offer to create.
 *
 * Use case: a pottery studio's kiln manual linking its schedule note, its
 * glaze book, a note named by id, and a page that does not exist yet.
 */
const calls: { filters: string[] }[] = [];
let session: object | null = { user: { id: "admin" } };
let rows: { id: string; label: string }[] = [];
let refuse = false;

const ilikes: string[] = [];
jest.mock("@/utils/supabase/client", () => ({
  createClient: () => ({
    auth: { getSession: () => Promise.resolve({ data: { session } }) },
    schema: () => ({
      from: () => ({
        select: () => ({
          or: (filters: string) => {
            calls.push({ filters: [filters] });
            return Promise.resolve(refuse ? { data: null, error: { message: "permission denied" } } : { data: exactRows(filters), error: null });
          },
          ilike: (_col: string, pattern: string) => ({
            limit: () => {
              ilikes.push(pattern);
              return Promise.resolve({ data: likeRows(pattern), error: null });
            },
          }),
        }),
      }),
    }),
  }),
}));

/** What Postgres would return for `label in (…)` — exact, quoted values only. */
function exactRows(filters: string) {
  const values = [...filters.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]!.replace(/\\(.)/g, "$1"));
  return rows.filter((r) => values.includes(r.label) || values.includes(r.id));
}
/** What `ilike` returns for a literal pattern (escapes honoured). */
function likeRows(pattern: string) {
  const literal = pattern.replace(/\\(.)/g, "$1").toLowerCase();
  return rows.filter((r) => r.label.toLowerCase() === literal);
}
jest.mock("@/features/scopes/registry/entityRegistry", () => ({
  tryGetEntityInfo: (token: string) =>
    token === "note"
      ? { label: "Note", schema: "workbench", table: "notes", titleColumn: "label", hrefFor: (id: string) => `/notes?active=${id}` }
      : null,
}));
jest.mock("@/features/scopes/service/entityRows", () => ({ createEntityRow: jest.fn() }));

import { resolveWikiTarget, wikiResolverStats } from "@/components/markdown-core/syntax/elements/wikilink-resolver";

const SCHEDULE = "11111111-1111-4111-8111-111111111111";
const GHOST = "00000000-0000-4000-8000-000000000000";

beforeEach(() => {
  calls.length = 0;
  ilikes.length = 0;
  session = { user: { id: "admin" } };
  rows = [];
  refuse = false;
});

it("resolves every link of a render in one batch and one read", async () => {
  rows = [{ id: SCHEDULE, label: "Kiln schedule" }];
  const before = wikiResolverStats.batches;
  const [a, b, c, d] = await Promise.all([
    resolveWikiTarget("Kiln schedule"),
    resolveWikiTarget("Glaze book A"),
    resolveWikiTarget(`note:${SCHEDULE}`),
    resolveWikiTarget(`note:${GHOST}`),
  ]);
  expect(wikiResolverStats.batches - before).toBe(1);
  expect(calls).toHaveLength(1);
  expect(a).toMatchObject({ status: "found", href: `/notes?active=${SCHEDULE}` });
  expect(b).toMatchObject({ status: "missing" });
  expect(c).toMatchObject({ status: "found" });
  // A random id is NOT a live link.
  expect(d).toMatchObject({ status: "unavailable" });
});

it("signed out: not available, no query, no Create", async () => {
  session = null;
  const r = await resolveWikiTarget("Glaze book B");
  expect(r.status).toBe("unavailable");
  expect(calls).toHaveLength(0);
});

it("a refused read is not available, never missing", async () => {
  refuse = true;
  const r = await resolveWikiTarget("Glaze book C");
  expect(r).toMatchObject({ status: "unavailable" });
});


it("titles with %, _, \\ and quotes match EXACTLY — never as wildcards", async () => {
  rows = [
    { id: SCHEDULE, label: "100% cone_6 \\ \"hot\" notes" },
    { id: "22222222-2222-4222-8222-222222222222", label: "100X coneX6" },
  ];
  const [hit, wild] = await Promise.all([
    resolveWikiTarget('100% cone_6 \\ "hot" notes'),
    resolveWikiTarget("100% cone_"),
  ]);
  expect(hit).toMatchObject({ status: "found", id: SCHEDULE });
  // `%` and `_` would have matched "100X coneX6" as wildcards.
  expect(wild).toMatchObject({ status: "missing" });
  // The fallback pattern escapes them.
  expect(ilikes).toContain("100\\% cone\\_");
});

it("one link never pushes another out: every title is found, whatever the count", async () => {
  rows = Array.from({ length: 60 }, (_, i) => ({ id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, label: `Firing log ${i}` }));
  const results = await Promise.all(rows.map((r) => resolveWikiTarget(r.label)));
  expect(results.every((r) => r.status === "found")).toBe(true);
});

it("a page whose stored case differs is found, not 'no page yet'", async () => {
  rows = [{ id: SCHEDULE, label: "kILN sCHEDULE mixed" }];
  expect(await resolveWikiTarget("Kiln Schedule Mixed")).toMatchObject({ status: "found" });
});
