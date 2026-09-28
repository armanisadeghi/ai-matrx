#!/usr/bin/env node
// scripts/clone-preview/clone-preview-env.cjs — the clone preview's environment and its
// server pairing, proven before `pnpm preview:start --clone` launches anything.
//
//   node scripts/clone-preview/clone-preview-env.cjs prepare   # regenerate env if needed, prove pairing
//   node scripts/clone-preview/clone-preview-env.cjs pair      # prove pairing only (reuse / status)
//
// WHAT IT GUARANTEES (Arman, 2026-09-27: "it starts to become a problem for aidream so you have
// to make sure it's properly managed when the changes modify both the client and the server").
// A page served by the clone preview reads and writes the CLONE through supabase-js. The same
// page calls a Python server. If that server were wired to live, one user action would write
// half to the clone and half to production. So:
//
//   1. `.env.clone.local` (gitignored, generated) holds the clone's Supabase URL + keys and
//      points EVERY backend URL the app can select (prod/dev/staging/local/gpu/ec2) at ONE
//      server: the local clone-wired aidream on http://localhost:8200. It is regenerated
//      whenever CLONE-REF's clone_ref changes (the clone rotates nightly; no ref is hardcoded).
//   2. That server must answer /health/database-identity with the clone's ref for its database
//      pool AND its auth issuer. Unreachable, live-wired or half-wired is a REFUSAL naming the
//      exact command that starts the right server. Nothing is ever started unpaired.
//
// Keys come from the Supabase Management API (`GET /v1/projects/<ref>/api-keys?reveal=true`)
// with SUPABASE_ACCESS_TOKEN read from ../aidream/.env. The file's secrets are never printed.

"use strict";

const fs = require("node:fs");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const CLONE_ENV_FILE = path.join(REPO_ROOT, ".env.clone.local");
const CLONE_SERVER_URL = "http://localhost:8200";
const AIDREAM_DIR = path.resolve(REPO_ROOT, "..", "aidream");
const AIDREAM_START = `cd ${AIDREAM_DIR} && scripts/clone/clone_server.sh start`;
const AIDREAM_STATUS = `cd ${AIDREAM_DIR} && scripts/clone/clone_server.sh status`;
const PRODUCTION_DB_HOST = "db.matrxserver.com";
const REF_RE = /^[a-z0-9]{20}$/;

/** Every backend-URL variable the app can resolve a server from (lib/api/endpoints.ts). */
const BACKEND_URL_VARS = Object.freeze([
  "NEXT_PUBLIC_BACKEND_URL_PROD",
  "NEXT_PUBLIC_BACKEND_URL_DEV",
  "NEXT_PUBLIC_BACKEND_URL_STAGING",
  "NEXT_PUBLIC_BACKEND_URL_LOCAL",
  "NEXT_PUBLIC_BACKEND_URL_GPU",
  "NEXT_PUBLIC_BACKEND_URL_EC2",
]);

function cloneRefPath(env = process.env) {
  return env.MATRX_CLONE_REF
    ? path.resolve(env.MATRX_CLONE_REF)
    : path.resolve(REPO_ROOT, "..", "common-docs", "operations", "clone", "CLONE-REF");
}

/** CLONE-REF's `key = value` lines; comments and blanks ignored. */
function parseCloneRef(text) {
  const bag = {};
  for (const raw of String(text).split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = /^([a-z_]+)\s*=\s*(.*)$/.exec(line);
    if (m) bag[m[1]] = m[2].trim();
  }
  return bag;
}

/** The clone's identity from a parsed CLONE-REF, or a thrown refusal naming what is wrong. */
function cloneIdentity(bag) {
  const cloneRef = bag.clone_ref || "";
  if (!REF_RE.test(cloneRef)) {
    throw new Error(`CLONE-REF has no valid clone_ref (got '${cloneRef || "(missing)"}').`);
  }
  if (bag.parent_ref && bag.parent_ref === cloneRef) {
    throw new Error("CLONE-REF names production's own ref as the clone; refusing.");
  }
  const apiUrl = `https://${cloneRef}.supabase.co`;
  if (bag.api_url && bag.api_url.replace(/\/+$/, "") !== apiUrl) {
    throw new Error(`CLONE-REF api_url '${bag.api_url}' does not match clone_ref ${cloneRef}.`);
  }
  if (bag.pooler_user && bag.pooler_user !== `postgres.${cloneRef}`) {
    throw new Error(`CLONE-REF pooler_user '${bag.pooler_user}' does not match clone_ref ${cloneRef}.`);
  }
  return { cloneRef, apiUrl };
}

/** (publishable, secret) — new-style first, legacy anon/service_role second; masked keys refused. */
function pickApiKeys(payload) {
  if (!Array.isArray(payload)) throw new Error("the api-keys response was not a list");
  const found = {};
  for (const item of payload) {
    if (!item || typeof item !== "object") continue;
    const key = String(item.api_key || "");
    if (!key || key.includes("·") || key.includes("*")) continue;
    if (item.type === "publishable" || item.type === "secret") found[item.type] ??= key;
    else if (item.type === "legacy" && (item.name === "anon" || item.name === "service_role"))
      found[`legacy:${item.name}`] ??= key;
  }
  const publishable = found.publishable || found["legacy:anon"];
  const secret = found.secret || found["legacy:service_role"];
  if (!publishable || !secret) {
    throw new Error(
      `the clone's api-keys response had no usable publishable+secret pair (found: ${
        Object.keys(found).sort().join(", ") || "none"
      }); the request must carry ?reveal=true.`,
    );
  }
  return { publishable, secret };
}

/** The generated file. Line 2 carries the ref it was generated for. */
function renderCloneEnv({ cloneRef, apiUrl, publishable, secret, serverUrl = CLONE_SERVER_URL }) {
  const lines = [
    "# GENERATED by scripts/clone-preview/clone-preview-env.cjs — do not edit, never commit.",
    `# clone_ref=${cloneRef}`,
    "# Read ONLY by `pnpm preview:start --clone` (port 3002). Regenerated when CLONE-REF rotates.",
    `NEXT_PUBLIC_SUPABASE_URL=${apiUrl}`,
    `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${publishable}`,
    `SUPABASE_SECRET_KEY=${secret}`,
    "# Every server the app can select is the ONE clone-wired local aidream (pairing rule).",
    ...BACKEND_URL_VARS.map((name) => `${name}=${serverUrl}`),
  ];
  return `${lines.join("\n")}\n`;
}

/** The ref an existing generated file was made for, or null. */
function generatedRefOf(text) {
  const m = /^# clone_ref=([a-z0-9]{20})$/m.exec(String(text || ""));
  return m ? m[1] : null;
}

/** KEY=VALUE pairs of a generated file (comments dropped). */
function parseEnvFile(text) {
  const env = {};
  for (const raw of String(text).split("\n")) {
    if (!raw || raw.startsWith("#")) continue;
    const i = raw.indexOf("=");
    if (i > 0) env[raw.slice(0, i)] = raw.slice(i + 1);
  }
  return env;
}

/** Everything a generated env must say before a clone preview may boot on it. */
function validateCloneEnv(env, cloneRef) {
  const problems = [];
  let host = "";
  try {
    host = new URL(env.NEXT_PUBLIC_SUPABASE_URL).host;
  } catch {
    /* reported below */
  }
  if (host !== `${cloneRef}.supabase.co`) problems.push(`NEXT_PUBLIC_SUPABASE_URL host is '${host || "(unset)"}'`);
  if (host === PRODUCTION_DB_HOST) problems.push("it points at the LIVE database");
  if (!env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) problems.push("no publishable key");
  if (!env.SUPABASE_SECRET_KEY) problems.push("no secret key");
  for (const name of BACKEND_URL_VARS) {
    if (env[name] !== CLONE_SERVER_URL) problems.push(`${name} is '${env[name] || "(unset)"}', not ${CLONE_SERVER_URL}`);
  }
  return problems;
}

/**
 * The pairing verdict for one /health/database-identity answer (or a fetch failure).
 * `identity === null` means the server did not answer.
 */
function evaluatePairing(identity, cloneRef, serverUrl = CLONE_SERVER_URL) {
  const remedy =
    `Start the clone-wired server: ${AIDREAM_START}\n` +
    `  It boots in 4-8 minutes; when \`${AIDREAM_STATUS}\` shows database_project_ref ${cloneRef}, re-run pnpm preview:start --clone.`;
  if (identity === null || identity === undefined) {
    return { ok: false, reason: `nothing answers ${serverUrl}/health/database-identity.\n  ${remedy}` };
  }
  if (typeof identity !== "object") {
    return { ok: false, reason: `${serverUrl}/health/database-identity answered something that is not an identity.\n  ${remedy}` };
  }
  const db = identity.database_project_ref ?? null;
  const auth = identity.auth_project_ref ?? null;
  if (db === cloneRef && auth === cloneRef) return { ok: true, reason: `${serverUrl} is wired to the clone ${cloneRef} (database and auth)` };
  const what =
    db !== cloneRef && auth !== cloneRef
      ? `wired to '${db ?? "unknown"}' (database) / '${auth ?? "unknown"}' (auth) — NOT the clone ${cloneRef}. If that is production, every server-side write from a clone page would land on LIVE.`
      : `HALF-wired: database '${db ?? "unknown"}', auth '${auth ?? "unknown"}'; both must be the clone ${cloneRef}.`;
  return {
    ok: false,
    reason: `the server at ${serverUrl} is ${what}\n  Stop whatever holds port 8200, then: ${remedy}`,
  };
}

async function fetchIdentity(serverUrl = CLONE_SERVER_URL) {
  try {
    const res = await fetch(`${serverUrl}/health/database-identity`, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function readAccessToken() {
  if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN;
  const envPath = path.join(AIDREAM_DIR, ".env");
  let text = "";
  try {
    text = fs.readFileSync(envPath, "utf8");
  } catch {
    throw new Error(`cannot read ${envPath} for SUPABASE_ACCESS_TOKEN`);
  }
  const m = /^SUPABASE_ACCESS_TOKEN=(.*)$/m.exec(text);
  const value = m ? m[1].trim().replace(/^(['"])(.*)\1$/, "$2") : "";
  if (!value) throw new Error(`SUPABASE_ACCESS_TOKEN is missing from ${envPath}`);
  return value;
}

async function fetchApiKeys(cloneRef) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${cloneRef}/api-keys?reveal=true`, {
    headers: { Authorization: `Bearer ${readAccessToken()}`, "User-Agent": "matrx-clone-preview" },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`Management API answered HTTP ${res.status} for the clone ${cloneRef}'s keys`);
  return pickApiKeys(await res.json());
}

/** Regenerate `.env.clone.local` when missing, invalid, or made for another clone. */
async function ensureCloneEnv() {
  const { cloneRef, apiUrl } = cloneIdentity(parseCloneRef(fs.readFileSync(cloneRefPath(), "utf8")));
  let existing = "";
  try {
    existing = fs.readFileSync(CLONE_ENV_FILE, "utf8");
  } catch {
    /* first run */
  }
  const current =
    generatedRefOf(existing) === cloneRef && validateCloneEnv(parseEnvFile(existing), cloneRef).length === 0;
  if (current) return { cloneRef, regenerated: false, previousRef: cloneRef };
  const { publishable, secret } = await fetchApiKeys(cloneRef);
  const text = renderCloneEnv({ cloneRef, apiUrl, publishable, secret });
  const problems = validateCloneEnv(parseEnvFile(text), cloneRef);
  if (problems.length) throw new Error(`generated env failed its own check: ${problems.join("; ")}`);
  fs.writeFileSync(CLONE_ENV_FILE, text, { mode: 0o600 });
  return { cloneRef, regenerated: true, previousRef: generatedRefOf(existing) };
}

async function main(argv) {
  const cmd = argv[0];
  try {
    if (cmd === "prepare") {
      const env = await ensureCloneEnv();
      if (env.regenerated) {
        console.error(
          `[preview:clone] ${path.basename(CLONE_ENV_FILE)} regenerated for the clone ${env.cloneRef}` +
            (env.previousRef ? ` (was ${env.previousRef})` : ""),
        );
      }
      const verdict = evaluatePairing(await fetchIdentity(), env.cloneRef);
      if (!verdict.ok) throw new Error(`REFUSING to start an unpaired clone preview: ${verdict.reason}`);
      console.error(`[preview:clone] pairing proven: ${verdict.reason}`);
      console.log(`CLONE_REF=${env.cloneRef}`);
      console.log(`CLONE_ENV_FILE=${CLONE_ENV_FILE}`);
      return 0;
    }
    if (cmd === "pair") {
      const { cloneRef } = cloneIdentity(parseCloneRef(fs.readFileSync(cloneRefPath(), "utf8")));
      const verdict = evaluatePairing(await fetchIdentity(), cloneRef);
      console.log(`CLONE_REF=${cloneRef}`);
      if (!verdict.ok) {
        console.error(`[preview:clone] NOT PAIRED: ${verdict.reason}`);
        return 2;
      }
      console.error(`[preview:clone] ${verdict.reason}`);
      return 0;
    }
    console.error("usage: clone-preview-env.cjs {prepare|pair}");
    return 64;
  } catch (error) {
    console.error(`[preview:clone] ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }
}

module.exports = {
  AIDREAM_START,
  BACKEND_URL_VARS,
  CLONE_ENV_FILE,
  CLONE_SERVER_URL,
  cloneIdentity,
  evaluatePairing,
  generatedRefOf,
  parseCloneRef,
  parseEnvFile,
  pickApiKeys,
  renderCloneEnv,
  validateCloneEnv,
};

if (require.main === module) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
