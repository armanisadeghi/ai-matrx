// scripts/lib/fixture-org.mjs
//
// THE ONE WAY A NODE SCRIPT GETS ITS FIXTURE ORGANIZATION: BY SLUG, REUSED, NEVER MINTED PER RUN.
//
// WHY IT EXISTS (lane FIXTURE-ORGS, 2026-09-23). The seeders under scripts/campaign-tests
// (the use-case crews, the Ironline waiver, electronics recycling) each called `org_create` with
// a fresh random slug suffix on every run, under the SAME realistic business name. Run twice, and
// the picker and every member's Shared-with-me show two identical "Ironline Fitness" rows nobody
// can tell apart. By 2026-09-23 the main database held eight Ironline Fitness, eight Ironclad
// Mobile Mechanic and thirteen Rincon Plumbing Co organizations; FIXTURE-ORGS archived 44.
//
// THE RULE: one business, one slug, one organization. `fixtureOrg()` finds it by slug and reuses
// it; it creates it only when the slug has never existed. The psql twin of this helper is
// scripts/campaign-tests/_fixture_org.sql — same rule, same refusals.
//
// WHAT IT REFUSES, LOUDLY, WITH THE REMEDY:
//   * the slug is archived     -> restore it through iam.organization_restore; never a sibling
//   * the slug carries another name -> one slug is one business
//   * the slug exists but this seat cannot see it -> a different owner holds it
//
// Usage:
//   import { fixtureOrg } from "../lib/fixture-org.mjs";
//   const { org, fresh } = await fixtureOrg(client, { name: "Ironline Fitness", description, settings });

/**
 * Families whose kept organization carries a slug that is NOT the plain slug of its name
 * (they were created before this helper and kept by FIXTURE-ORGS because suites and the owner
 * guide already reach them by that slug). Every other family's slug is `slugOf(name)`.
 */
export const FIXTURE_SLUGS = Object.freeze({
  "Birchwood Avenue Renovation": "home-renovation",
  "Ironline Fitness": "fixture-ironline-fitness-f1wa0s",
  "Signal & Scale Podcast": "signal-scale-podcast-muaj1a8i",
});

/** "Hands & Hope Alliance" -> "hands-and-hope-alliance". No random suffix, ever. */
export function slugOf(name) {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/** The slug a fixture family lives at. */
export function fixtureSlug(name) {
  return FIXTURE_SLUGS[name] ?? slugOf(name);
}

/**
 * Find the fixture organization by slug and reuse it; create it once if the slug is new.
 * `client` is a signed-in supabase-js client (the seat — never the service role).
 * Returns { org: {id, slug, name, settings}, fresh: boolean }.
 *
 * @param {any} client
 * @param {{ name: string, slug?: string, description?: string | null, settings?: Record<string, unknown>, abbreviation?: string }} spec
 * @returns {Promise<{ org: { id: string, slug: string, name: string, settings: Record<string, unknown> }, fresh: boolean }>}
 */
export async function fixtureOrg(client, spec) {
  const { name, description = null, settings = { test_fixture: true }, abbreviation } = spec ?? {};
  const slug = spec?.slug ?? (name ? fixtureSlug(name) : undefined);
  if (!name) throw new Error("fixtureOrg: a name is required");
  const { data: found, error: readErr } = await client
    .schema("iam")
    .from("organizations")
    .select("id, slug, name, settings, archived_at")
    .eq("slug", slug)
    .maybeSingle();
  if (readErr) throw new Error(`fixtureOrg: could not look up slug ${slug}: ${readErr.message}`);

  if (found) {
    if (found.archived_at) {
      throw new Error(
        `fixtureOrg REFUSED: "${found.name}" (${slug}, ${found.id}) is archived since ${found.archived_at}. ` +
          `Restore it through iam.organization_restore from the admin@admin.com seat — this helper never mints a second copy.`,
      );
    }
    if (found.name !== name) {
      throw new Error(`fixtureOrg REFUSED: slug ${slug} belongs to "${found.name}", not "${name}". One slug is one business.`);
    }
    console.log(`fixture organization reused by slug: ${found.name} (${slug}) ${found.id}`);
    const { archived_at: _a, ...org } = found;
    return { org, fresh: false };
  }

  const args = { p_name: name, p_slug: slug, p_description: description, p_settings: settings };
  if (abbreviation) args.p_abbreviation = abbreviation;
  const { data, error } = await client.rpc("org_create", args);
  if (error) {
    if (error.code === "23505") {
      throw new Error(
        `fixtureOrg REFUSED: slug ${slug} already exists but this seat cannot see it — another owner holds it. ` +
          `Pass a slug of this business's own; never a random suffix.`,
      );
    }
    throw new Error(`fixtureOrg: org_create refused "${name}" (${slug}): ${error.code}: ${error.message}`);
  }
  const org = Array.isArray(data) ? data[0] : data;
  console.log(`fixture organization created once: ${name} (${slug}) ${org?.id}`);
  return { org, fresh: true };
}
