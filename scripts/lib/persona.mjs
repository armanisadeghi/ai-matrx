// matrx-agent-traffic: exempt calls only Supabase GoTrue admin; fixtures.aimatrx.com is an email domain, not a request
// scripts/lib/persona.mjs
//
// THE ONE WAY A NODE SCRIPT GETS A TEST PERSON. Twin of aidream/aidream/testing/persona.py.
//
// WHY (junk-data-cleanup, 2026-09-30). Agents hand-made `zzz.*@example.invalid` accounts with inline
// scripts and MCP SQL, ran them once against the live database and never deleted them: 28 reserved-TLD
// accounts, 0 of 1,520 carrying any test marker. The class fix: this factory is the only door, every
// account it makes is tagged `app_metadata.test_fixture = {suite, purpose, created_at, expires_at}`
// (app_metadata is service-role-writable only), and the sweeper
// (aidream/scripts/sweep_expired_fixtures.py) removes expired ones even when teardown never ran.
// The guard `scripts/check-fixture-account-doors.mjs` fails the build when anyone creates an
// auth user any other way.
//
// A persona is a realistic person (name, job title, company drawn from the real use-case templates in
// @ai-matrx/records/use-cases), email `<first>.<last>.<short-id>@fixtures.aimatrx.com` (our own domain;
// null MX + SPF -all make it undeliverable to any person), phone null.
//
// Usage:
//   import { withFixtureUser, testTarget } from "../lib/persona.mjs";
//   await withFixtureUser(testTarget(), { suite: "portal/sign-in", purpose: "invited client" }, async (user) => {
//     // user.id, user.email, user.fullName, user.company
//   });   // teardown ran in `finally`; the sweeper is the net if the process died first

import { randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { faker } from "@faker-js/faker";

const run = promisify(execFile);

export const FIXTURE_EMAIL_DOMAIN = "fixtures.aimatrx.com";
export const DEFAULT_TTL_HOURS = 24;
/** The app's auth cookie (utils/supabase/authCookie.ts AUTH_COOKIE_NAME; its test pins the same string). */
export const AUTH_COOKIE_NAME = "sb-matrx-auth-v2";

/** The refusal every misuse raises; the message is the remedy. */
export class PersonaFactoryRefusal extends Error {}

/** @typedef {{ url: string, secretKey: string, label: string }} FixtureTarget */

/**
 * Where tests and proofs make their personas: the LIVE database (owner ruling 2026-10-03 — tests run
 * on live as admin@admin.com; the nightly clone is only for rehearsing destructive migrations). Every
 * account is tagged and expires, and the sweeper removes it even when teardown never ran.
 * @returns {FixtureTarget}
 */
export function testTarget(env = process.env) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = env.SUPABASE_SECRET_KEY;
  if (!url || !secretKey) throw new PersonaFactoryRefusal("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY are not set.");
  return { url, secretKey, label: "live (tests)" };
}

/**
 * The LIVE database for a named demo persona the owner asked for (the reason is recorded in the label).
 * @returns {FixtureTarget}
 */
export function liveTarget({ reason }, env = process.env) {
  if (!reason || reason.trim().length < 12) {
    throw new PersonaFactoryRefusal("liveTarget needs a real reason (who asked for this and why).");
  }
  return { ...testTarget(env), label: `live (${reason.trim()})` };
}

/** Companies come from the real use-case templates; never invented here. */
async function businesses() {
  let loaded;
  try {
    loaded = await import("@ai-matrx/records/use-cases");
  } catch (error) {
    throw new PersonaFactoryRefusal(
      `the persona factory draws companies from @ai-matrx/records/use-cases and it did not load (${error.message}). ` +
        "Install a records version that ships ./use-cases; never hard-code a company here.",
    );
  }
  const all = await loaded.loadAllUseCases();
  return all.map((useCase) => ({ id: useCase.id, name: useCase.business.name }));
}

const asciiSlug = (word) =>
  word
    .normalize("NFKD")
    .replace(/[^\x00-\x7f]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");

/**
 * A realistic persona. `useCase` picks the company by template id (default: random draw).
 * @returns {Promise<{ firstName: string, lastName: string, fullName: string, jobTitle: string, company: string, email: string, useCaseId: string, shortId: string, phone: null }>}
 */
export async function makePersona({ useCase, seed } = {}) {
  if (seed !== undefined) faker.seed(seed);
  const all = await businesses();
  const chosen = useCase ? all.find((b) => b.id === useCase) : faker.helpers.arrayElement(all);
  if (!chosen) throw new PersonaFactoryRefusal(`use case "${useCase}" is not a template. Available: ${all.map((b) => b.id).join(", ")}`);
  const firstName = faker.person.firstName();
  const lastName = faker.person.lastName();
  const shortId = seed === undefined ? randomBytes(3).toString("hex") : faker.string.hexadecimal({ length: 6, prefix: "", casing: "lower" });
  return {
    firstName,
    lastName,
    fullName: `${firstName} ${lastName}`,
    jobTitle: faker.person.jobTitle(),
    company: chosen.name,
    email: `${asciiSlug(firstName)}.${asciiSlug(lastName)}.${shortId}@${FIXTURE_EMAIL_DOMAIN}`,
    useCaseId: chosen.id,
    shortId,
    phone: null, // a test person is never reachable by SMS or voice
  };
}

/** The `app_metadata.test_fixture` object. `ttlHours: null` is for a NAMED permanent demo persona only. */
export function buildTag({ suite, purpose, ttlHours = DEFAULT_TTL_HOURS, now = new Date() }) {
  if (!suite?.trim() || !purpose?.trim()) {
    throw new PersonaFactoryRefusal("a fixture account needs a suite name and a purpose; both are stamped on it.");
  }
  return {
    suite,
    purpose,
    created_at: now.toISOString(),
    expires_at: ttlHours === null ? null : new Date(now.getTime() + ttlHours * 3600_000).toISOString(),
  };
}

async function gotrue(target, method, path, body) {
  // matrx-fixture:factory-only the single GoTrue admin door
  const response = await fetch(`${target.url}/auth/v1/admin/${path}`, {
    method,
    headers: {
      apikey: target.secretKey,
      Authorization: `Bearer ${target.secretKey}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new PersonaFactoryRefusal(`GoTrue admin ${method} ${path} refused (HTTP ${response.status}): ${text.slice(0, 300)}`);
  }
  return text ? JSON.parse(text) : {};
}

/**
 * Create a tagged, passwordless auth user through the GoTrue admin API.
 * @param {FixtureTarget} target
 */
export async function createFixtureUser(target, { suite, purpose, ttlHours = DEFAULT_TTL_HOURS, persona, useCase } = {}) {
  const who = persona ?? (await makePersona({ useCase }));
  const tag = buildTag({ suite, purpose, ttlHours });
  const created = await gotrue(target, "POST", "users", {
    email: who.email,
    email_confirm: true,
    app_metadata: { test_fixture: tag },
    user_metadata: { full_name: who.fullName, job_title: who.jobTitle, company: who.company },
  });
  return { id: created.id, email: who.email, fullName: who.fullName, jobTitle: who.jobTitle, company: who.company, persona: who, tag, targetLabel: target.label };
}

export function aidreamDir(env = process.env) {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [env.AIDREAM_DIR, join(here, "..", "..", "..", "aidream")].filter(Boolean);
  const found = candidates.find((dir) => existsSync(join(dir, "scripts", "sweep_expired_fixtures.py")));
  if (!found) throw new PersonaFactoryRefusal("aidream checkout not found; set AIDREAM_DIR to it (it owns the sweeper).");
  return found;
}

/**
 * The sweeper invocation that removes exactly one persona. The sweeper has ONE database (live; the
 * clone resolver and its `--target` flag were removed 2026-10-03), so nothing here names a target.
 * persona.test.mjs parses these args with the sweeper's own argparse parser.
 * @param {string} userId
 */
export function teardownArgs(userId) {
  if (!/^[0-9a-f-]{36}$/i.test(String(userId))) throw new PersonaFactoryRefusal(`teardown needs a user id, got "${userId}".`);
  return ["--apply", "--user-id", userId, "--live-reason", "teardown of a persona this process created"];
}

/**
 * Remove a fixture account. Every account has dependent rows (a CRM party at minimum) that block
 * GoTrue's own delete, so the one deletion implementation is aidream's sweeper: the same code the
 * Python factory uses, run with `--user-id`. It refuses anything without the tag.
 * @param {FixtureTarget} _target
 */
export async function deleteFixtureUser(_target, userId) {
  const args = ["run", "python", "scripts/sweep_expired_fixtures.py", ...teardownArgs(userId)];
  try {
    await run("uv", args, { cwd: aidreamDir(), maxBuffer: 10_000_000, timeout: 600_000 });
  } catch (error) {
    throw new PersonaFactoryRefusal(
      `teardown of ${userId} failed: ${String(error.stderr || error.message).slice(0, 400)}. ` +
        "The account is tagged and expires on its own; the sweeper (aidream/scripts/sweep_expired_fixtures.py) removes it.",
    );
  }
}

/**
 * Create a persona, run `fn(user)`, and delete it in `finally`.
 * @param {FixtureTarget} target
 */
export async function withFixtureUser(target, options, fn) {
  const user = await createFixtureUser(target, options);
  try {
    return await fn(user);
  } finally {
    await deleteFixtureUser(target, user.id);
  }
}

// ---------------------------------------------------------------------------------------------
// The organization-admin seat (plain admin: not the org's owner, not a platform super admin).
// Twin of aidream/aidream/testing/persona_org_admin.py. The Python side owns the database writes
// (membership + optional workflow/trigger rows), so this shells out to
// aidream/scripts/fixture_org_admin.py exactly like teardown shells out to the sweeper.
// ---------------------------------------------------------------------------------------------

/**
 * Create an owner persona (its organization is renamed to a real use-case business), an ADMIN persona
 * with `role = admin` on it, and optionally one workflow + one PAUSED cron trigger in that organization.
 * Everything is tagged and expires; tear down with `deleteOrgAdminFixture`.
 * @param {FixtureTarget} _target
 * @param {{ suite: string, purpose: string, ttlHours?: number, useCase?: string, withWorkflowTrigger?: boolean }} options
 */
export async function createOrgAdminFixture(_target, { suite, purpose, ttlHours = DEFAULT_TTL_HOURS, useCase, withWorkflowTrigger = false }) {
  buildTag({ suite, purpose, ttlHours }); // same refusals as every other persona
  const args = ["run", "python", "scripts/fixture_org_admin.py", "create", "--suite", suite, "--purpose", purpose, "--ttl-hours", String(ttlHours)];
  if (useCase) args.push("--use-case", useCase);
  if (withWorkflowTrigger) args.push("--with-workflow-trigger");
  try {
    const { stdout } = await run("uv", args, { cwd: aidreamDir(), maxBuffer: 10_000_000, timeout: 600_000 });
    return JSON.parse(stdout.trim().split("\n").at(-1));
  } catch (error) {
    throw new PersonaFactoryRefusal(`org-admin persona creation failed: ${String(error.stderr || error.message).slice(0, 400)}`);
  }
}

/** Remove everything `createOrgAdminFixture` made (rows first, then both accounts through the sweeper's one delete). */
export async function deleteOrgAdminFixture(_target, fixture) {
  const args = ["run", "python", "scripts/fixture_org_admin.py", "delete", "--json", JSON.stringify(fixture)];
  try {
    await run("uv", args, { cwd: aidreamDir(), maxBuffer: 10_000_000, timeout: 600_000 });
  } catch (error) {
    throw new PersonaFactoryRefusal(
      `teardown of org-admin fixture ${fixture.organizationSlug} failed: ${String(error.stderr || error.message).slice(0, 400)}. ` +
        "Both accounts are tagged and expire on their own; the sweeper removes them.",
    );
  }
}

export async function withOrgAdminFixture(target, options, fn) {
  const fixture = await createOrgAdminFixture(target, options);
  try {
    return await fn(fixture);
  } finally {
    await deleteOrgAdminFixture(target, fixture);
  }
}

/**
 * Browser cookies that sign a fixture persona in (for a headless walk). Redeems a one-time code the
 * GoTrue admin API mints for that persona, then writes the session in @supabase/ssr's cookie format.
 * Refuses any account without the `test_fixture` tag, so it can never sign anyone real in.
 * @param {FixtureTarget} target
 * @param {{ id: string, email: string }} user
 * @param {{ host: string, publishableKey?: string, env?: NodeJS.ProcessEnv }} options host = the preview hostname the cookies are for
 */
export async function fixtureSessionCookies(target, user, { host, env = process.env }) {
  const publishableKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!publishableKey) throw new PersonaFactoryRefusal("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is not set.");
  const account = await gotrue(target, "GET", `users/${user.id}`);
  if (!account.app_metadata?.test_fixture) {
    throw new PersonaFactoryRefusal(`${user.email} carries no test_fixture tag; the persona factory only signs in its own accounts.`);
  }
  const link = await gotrue(target, "POST", "generate_link", { type: "magiclink", email: user.email });
  const otp = link.email_otp ?? link.properties?.email_otp;
  if (!otp) throw new PersonaFactoryRefusal("GoTrue minted no one-time code for the persona.");
  const response = await fetch(`${target.url}/auth/v1/verify`, {
    method: "POST",
    headers: { apikey: publishableKey, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "email", email: user.email, token: otp }),
  });
  const session = await response.json();
  if (!response.ok || !session.access_token) throw new PersonaFactoryRefusal(`GoTrue refused the persona's code (HTTP ${response.status}).`);
  const name = AUTH_COOKIE_NAME;
  const value = `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`;
  const CHUNK = 3180;
  const parts = value.length <= CHUNK ? [[name, value]] : Array.from({ length: Math.ceil(value.length / CHUNK) }, (_, i) => [`${name}.${i}`, value.slice(i * CHUNK, (i + 1) * CHUNK)]);
  return parts.map(([n, v]) => ({ name: n, value: v, domain: host, path: "/", httpOnly: false, secure: false, sameSite: "Lax" }));
}
