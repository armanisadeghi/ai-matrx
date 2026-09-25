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

jest.mock("@/utils/supabase/client", () => ({
  createClient: () => ({
    auth: { getSession: () => Promise.resolve({ data: { session } }) },
    schema: () => ({
      from: () => ({
        select: () => ({
          or: (filters: string) => ({
            limit: () => {
              calls.push({ filters: filters.split(",") });
              return Promise.resolve(refuse ? { data: null, error: { message: "permission denied" } } : { data: rows, error: null });
            },
          }),
        }),
      }),
    }),
  }),
}));
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
