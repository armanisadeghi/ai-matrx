// scripts/lib/persona.test.mjs — node --test scripts/lib/persona.test.mjs
//
// The Node persona factory's guarantees (junk-data-cleanup, 2026-09-30). Breaks it must catch: the email
// leaves the fixtures domain (it could reach a real inbox), a phone appears (SMS/voice tests could ring
// someone), the tag loses its expiry (nothing ever sweeps it), a person is numbered or zzz-named, the
// account is made without the tag, or an unlabelled account is allowed.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FIXTURE_EMAIL_DOMAIN,
  PersonaFactoryRefusal,
  buildTag,
  createFixtureUser,
  liveTarget,
  aidreamDir,
  makePersona,
  teardownArgs,
  testTarget,
} from "./persona.mjs";
import { execFileSync } from "node:child_process";

const SHAPE = /^[a-z]+\.[a-z]+\.[0-9a-f]{6}@fixtures\.aimatrx\.com$/;

test("a persona is a realistic person on the fixtures domain, never reachable by phone", async () => {
  const people = await Promise.all(Array.from({ length: 25 }, () => makePersona()));
  for (const p of people) {
    assert.match(p.email, SHAPE);
    assert.ok(p.email.endsWith(`@${FIXTURE_EMAIL_DOMAIN}`));
    assert.equal(p.phone, null);
    assert.ok(p.firstName && p.lastName && p.jobTitle);
    assert.doesNotMatch(p.fullName, /\d|zz|test|fixture|throwaway/i);
  }
  assert.equal(new Set(people.map((p) => p.email)).size, 25);
});

test("the company comes from the real use-case templates and a named one is honoured", async () => {
  const p = await makePersona({ useCase: "harbor-dental-new-patient-intake" });
  assert.equal(p.company, "Harbor Dental Group");
  await assert.rejects(makePersona({ useCase: "acme-widgets" }), /not a template/);
});

test("the tag carries suite, purpose and a 24 hour expiry by default; only a named persona may have none", () => {
  const now = new Date("2026-10-01T09:00:00Z");
  assert.deepEqual(buildTag({ suite: "portal/sign-in", purpose: "invited client", now }), {
    suite: "portal/sign-in",
    purpose: "invited client",
    created_at: "2026-10-01T09:00:00.000Z",
    expires_at: "2026-10-02T09:00:00.000Z",
  });
  assert.equal(buildTag({ suite: "demo/orchard-clinic", purpose: "walkthrough", ttlHours: null, now }).expires_at, null);
  assert.throws(() => buildTag({ suite: "", purpose: "x" }), PersonaFactoryRefusal);
  assert.throws(() => liveTarget({ reason: "x" }, {}), PersonaFactoryRefusal);
});

test("the account is created through the GoTrue admin door with the tag and no password", async () => {
  const seen = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    seen.push({ url, init });
    return new Response(JSON.stringify({ id: "7b0f3c2e-0000-4000-8000-000000000001" }), { status: 200 });
  };
  try {
    const user = await createFixtureUser(
      { url: "https://example-project.supabase.co", secretKey: "k", label: "clone:test" },
      { suite: "portal/sign-in", purpose: "invited client" },
    );
    const body = JSON.parse(seen[0].init.body);
    assert.equal(seen[0].url, "https://example-project.supabase.co/auth/v1/admin/users");
    assert.equal(seen[0].init.method, "POST");
    assert.equal(body.app_metadata.test_fixture.suite, "portal/sign-in");
    assert.ok(body.app_metadata.test_fixture.expires_at);
    assert.equal(body.email_confirm, true);
    assert.equal("password" in body, false);
    assert.equal(body.email, user.email);
    assert.match(user.email, SHAPE);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("tests make their personas on the live database (owner ruling 2026-10-03), never by a clone wiring", () => {
  const env = { NEXT_PUBLIC_SUPABASE_URL: "https://db.matrxserver.com", SUPABASE_SECRET_KEY: "k" };
  assert.deepEqual(testTarget(env), { url: "https://db.matrxserver.com", secretKey: "k", label: "live (tests)" });
  assert.throws(() => testTarget({}), PersonaFactoryRefusal);
});

// The sweeper's OWN argparse parser judges the teardown args (2026-10-08: teardown passed `--target live`
// after the sweeper dropped that flag, so every persona outlived its test until it expired). Needs uv and
// the aidream checkout the factory itself needs to tear down; without them this fails, never skips.
function sweeperAccepts(args) {
  const probe =
    "import importlib.util, json, sys\n" +
    "spec = importlib.util.spec_from_file_location('sweeper', 'scripts/sweep_expired_fixtures.py')\n" +
    "m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)\n" +
    "m.build_parser().parse_args(json.loads(sys.argv[1]))\n";
  try {
    execFileSync("uv", ["run", "--quiet", "python", "-c", probe, JSON.stringify(args)], { cwd: aidreamDir(), stdio: "pipe" });
    return { ok: true };
  } catch (error) {
    return { ok: false, stderr: String(error.stderr) };
  }
}

test("teardown removes exactly one persona with args the sweeper accepts", () => {
  const id = "b870aae4-0000-4000-8000-000000000001";
  const args = teardownArgs(id);
  assert.deepEqual(args.slice(0, 3), ["--apply", "--user-id", id]);
  const verdict = sweeperAccepts(args);
  assert.ok(verdict.ok, `the sweeper refused the factory's teardown args: ${verdict.stderr}`);
  // the call that shipped before 2026-10-08, judged by the same parser, is refused
  assert.equal(sweeperAccepts(["--target", "live", ...args]).ok, false);
  assert.throws(() => teardownArgs("--target"), PersonaFactoryRefusal);
});
