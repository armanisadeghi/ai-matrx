// scripts/lib/fixture-org.test.mjs — node --test scripts/lib/fixture-org.test.mjs
//
// FIXTURE-ORGS (2026-09-23). The forcing function for the one Node fixture-organization helper:
// against a store that holds organizations by slug the way iam.organizations does (slug UNIQUE,
// org_create refusing a duplicate with 23505), running a seeder twice must call org_create ONCE.
// The RED arm replays the pattern every seeder used before this lane — a random slug suffix per
// run — against the same store and shows it minting two identical organizations.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fixtureOrg, fixtureSlug, slugOf } from "./fixture-org.mjs";

/** A supabase-js-shaped client over an in-memory iam.organizations. */
function fakeStore(rows = []) {
  const orgs = [...rows];
  let creates = 0;
  const client = {
    schema: () => ({
      from: () => {
        let slug;
        const q = {
          select: () => q,
          eq: (col, val) => { if (col === "slug") slug = val; return q; },
          maybeSingle: async () => ({ data: orgs.find((o) => o.slug === slug) ?? null, error: null }),
        };
        return q;
      },
    }),
    rpc: async (fn, args) => {
      assert.equal(fn, "org_create");
      if (orgs.some((o) => o.slug === args.p_slug)) return { data: null, error: { code: "23505", message: "duplicate slug" } };
      creates += 1;
      const org = { id: `org-${orgs.length + 1}`, slug: args.p_slug, name: args.p_name, settings: args.p_settings, archived_at: null };
      orgs.push(org);
      return { data: { ...org }, error: null };
    },
  };
  return { client, orgs, creates: () => creates };
}

test("slugs are the business's own, never a random suffix", () => {
  assert.equal(slugOf("Hands & Hope Alliance"), "hands-and-hope-alliance");
  assert.equal(fixtureSlug("Rincon Plumbing Co"), "rincon-plumbing-co");
  assert.equal(fixtureSlug("Ironline Fitness"), "fixture-ironline-fitness-f1wa0s");
  assert.equal(fixtureSlug("Ironline Fitness"), fixtureSlug("Ironline Fitness"));
});

test("GREEN: a seeder run twice creates the organization once and reuses it", async () => {
  const s = fakeStore();
  const first = await fixtureOrg(s.client, { name: "Cascade Electronics Recovery" });
  const second = await fixtureOrg(s.client, { name: "Cascade Electronics Recovery" });
  assert.equal(s.creates(), 1);
  assert.equal(s.orgs.length, 1);
  assert.equal(first.fresh, true);
  assert.equal(second.fresh, false);
  assert.equal(second.org.id, first.org.id);
});

test("RED: the pre-FIXTURE-ORGS pattern (random suffix per run) mints a look-alike every run", async () => {
  const s = fakeStore();
  for (let run = 0; run < 2; run += 1) {
    const slug = "fixture-cascade-electronics-" + Math.random().toString(36).slice(2, 8);
    await s.client.rpc("org_create", { p_name: "Cascade Electronics Recovery", p_slug: slug });
  }
  assert.equal(s.orgs.length, 2, "two identical names on the picker — the defect this helper closes");
  assert.equal(new Set(s.orgs.map((o) => o.name)).size, 1);
});

test("an archived fixture is refused with the restore door, never re-minted", async () => {
  const s = fakeStore([{ id: "o1", slug: "ironline-fitness", name: "Ironline Fitness", settings: {}, archived_at: "2026-09-23T04:01:55Z" }]);
  await assert.rejects(fixtureOrg(s.client, { name: "Ironline Fitness", slug: "ironline-fitness" }), /archived.*organization_restore/);
  assert.equal(s.creates(), 0);
});

test("a slug that belongs to another business is refused", async () => {
  const s = fakeStore([{ id: "o1", slug: "rincon-plumbing-co", name: "Rincon Plumbing Co", settings: {}, archived_at: null }]);
  await assert.rejects(fixtureOrg(s.client, { name: "Ironclad Mobile Mechanic", slug: "rincon-plumbing-co" }), /One slug is one business/);
});

test("a slug held by an owner this seat cannot see is refused by name, not suffixed", async () => {
  const s = fakeStore();
  const hidden = s.client.schema;
  s.orgs.push({ id: "o9", slug: "the-offside-rule", name: "The Offside Rule", settings: {}, archived_at: null });
  s.client.schema = () => ({ from: () => { const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: null, error: null }) }; return q; } });
  await assert.rejects(fixtureOrg(s.client, { name: "The Offside Rule" }), /cannot see it/);
  s.client.schema = hidden;
  assert.equal(s.orgs.length, 1);
});
