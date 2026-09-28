/**
 * The clone preview's environment and its server pairing (Arman, 2026-09-27: a clone page must
 * never call a Python server wired to the live database). Pure logic of
 * scripts/clone-preview/clone-preview-env.cjs — no network, no database. The live half (a real
 * clone-wired aidream answering /health/database-identity) is exercised by
 * `pnpm preview:start --clone` itself.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type Identity = Record<string, unknown> | null;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const env = require("../clone-preview/clone-preview-env.cjs") as {
  BACKEND_URL_VARS: readonly string[];
  CLONE_SERVER_URL: string;
  AIDREAM_START: string;
  cloneIdentity: (bag: Record<string, string>) => { cloneRef: string; apiUrl: string };
  evaluatePairing: (identity: Identity, cloneRef: string) => { ok: boolean; reason: string };
  generatedRefOf: (text: string) => string | null;
  parseCloneRef: (text: string) => Record<string, string>;
  parseEnvFile: (text: string) => Record<string, string>;
  pickApiKeys: (payload: unknown) => { publishable: string; secret: string };
  renderCloneEnv: (input: { cloneRef: string; apiUrl: string; publishable: string; secret: string }) => string;
  validateCloneEnv: (e: Record<string, string>, cloneRef: string) => string[];
};

const CLONE = "hykobnqyuxspbcijrodb";
const NEXT_CLONE = "abcdefghijklmnopqrst";
const LIVE = "brsgrqvjdzwihsvnfqkf";

describe("CLONE-REF → the clone's identity", () => {
  it("reads the checked-in CLONE-REF shape (the real file)", () => {
    const real = readFileSync(resolve(__dirname, "../../../common-docs/operations/clone/CLONE-REF"), "utf8");
    const { cloneRef, apiUrl } = env.cloneIdentity(env.parseCloneRef(real));
    expect(cloneRef).toMatch(/^[a-z0-9]{20}$/);
    expect(apiUrl).toBe(`https://${cloneRef}.supabase.co`);
  });

  it("refuses a missing ref, production named as the clone, and a mismatched api_url / pooler_user", () => {
    expect(() => env.cloneIdentity({})).toThrow(/no valid clone_ref/);
    expect(() => env.cloneIdentity({ clone_ref: LIVE, parent_ref: LIVE })).toThrow(/production's own ref/);
    expect(() => env.cloneIdentity({ clone_ref: CLONE, api_url: `https://${LIVE}.supabase.co` })).toThrow(/api_url/);
    expect(() => env.cloneIdentity({ clone_ref: CLONE, pooler_user: `postgres.${LIVE}` })).toThrow(/pooler_user/);
  });
});

describe(".env.clone.local generation", () => {
  const rendered = env.renderCloneEnv({
    cloneRef: CLONE,
    apiUrl: `https://${CLONE}.supabase.co`,
    publishable: "sb_publishable_x",
    secret: "sb_secret_y",
  });

  it("points Supabase at the clone and EVERY backend URL at the one paired server", () => {
    const parsed = env.parseEnvFile(rendered);
    expect(parsed.NEXT_PUBLIC_SUPABASE_URL).toBe(`https://${CLONE}.supabase.co`);
    for (const name of env.BACKEND_URL_VARS) expect(parsed[name]).toBe("http://localhost:8200");
    expect(env.validateCloneEnv(parsed, CLONE)).toEqual([]);
  });

  it("covers every backend URL variable the app resolves a server from", () => {
    const endpoints = readFileSync(resolve(__dirname, "../../lib/api/endpoints.ts"), "utf8");
    const read = new Set(endpoints.match(/NEXT_PUBLIC_BACKEND_URL_[A-Z0-9_]+/g));
    for (const name of read) expect(env.BACKEND_URL_VARS).toContain(name);
  });

  it("is regenerated when the clone rotates (the header carries the ref)", () => {
    expect(env.generatedRefOf(rendered)).toBe(CLONE);
    expect(env.generatedRefOf(rendered)).not.toBe(NEXT_CLONE);
    expect(env.generatedRefOf("NEXT_PUBLIC_SUPABASE_URL=x")).toBeNull();
  });

  it("an env that points at live, or leaves one backend URL on another server, fails validation", () => {
    const live = { ...env.parseEnvFile(rendered), NEXT_PUBLIC_SUPABASE_URL: "https://db.matrxserver.com" };
    expect(env.validateCloneEnv(live, CLONE).join(" ")).toMatch(/LIVE database/);
    const stray = { ...env.parseEnvFile(rendered), NEXT_PUBLIC_BACKEND_URL_DEV: "https://dev.server.app.matrxserver.com" };
    expect(env.validateCloneEnv(stray, CLONE).join(" ")).toMatch(/NEXT_PUBLIC_BACKEND_URL_DEV/);
  });

  it("prefers new-style keys, falls back to legacy, refuses masked ones", () => {
    const keys = [
      { name: "anon", type: "legacy", api_key: "eyJ.a" },
      { name: "service_role", type: "legacy", api_key: "eyJ.s" },
      { name: "default", type: "publishable", api_key: "sb_publishable_p" },
      { name: "default", type: "secret", api_key: "sb_secret_s" },
    ];
    expect(env.pickApiKeys(keys)).toEqual({ publishable: "sb_publishable_p", secret: "sb_secret_s" });
    expect(env.pickApiKeys(keys.slice(0, 2))).toEqual({ publishable: "eyJ.a", secret: "eyJ.s" });
    expect(() => env.pickApiKeys([{ type: "publishable", api_key: "p" }, { type: "secret", api_key: "sb_secret_··" }])).toThrow(
      /reveal=true/,
    );
  });
});

describe("pairing — the clone preview never starts against a server wired elsewhere", () => {
  it("proves a server wired to the clone for both database and auth", () => {
    const verdict = env.evaluatePairing({ database_project_ref: CLONE, auth_project_ref: CLONE, paired: true }, CLONE);
    expect(verdict.ok).toBe(true);
  });

  it("refuses an unreachable server with the exact start command", () => {
    const verdict = env.evaluatePairing(null, CLONE);
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain("nothing answers http://localhost:8200/health/database-identity");
    expect(verdict.reason).toContain(env.AIDREAM_START);
    expect(env.AIDREAM_START).toMatch(/aidream && scripts\/clone\/clone_server\.sh start$/);
  });

  it("refuses a LIVE-wired server (the local aidream on the production env)", () => {
    const verdict = env.evaluatePairing({ database_project_ref: LIVE, auth_project_ref: LIVE, paired: true }, CLONE);
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toMatch(/NOT the clone .* would land on LIVE/);
  });

  it("refuses a half-wired server and yesterday's clone", () => {
    expect(env.evaluatePairing({ database_project_ref: CLONE, auth_project_ref: LIVE }, CLONE).reason).toMatch(/HALF-wired/);
    expect(env.evaluatePairing({ database_project_ref: CLONE, auth_project_ref: CLONE }, NEXT_CLONE).ok).toBe(false);
    expect(env.evaluatePairing({}, CLONE).ok).toBe(false);
  });
});
