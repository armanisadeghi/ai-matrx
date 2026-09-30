/**
 * The clone-only guard, preloaded into EVERY row of `run.mjs --target clone` (NODE_OPTIONS
 * --require). The frontend half of aidream `scripts/checks/clone_target.py`.
 *
 * WHY (checks-run-in-the-app PLAN decision 1 / C7): a check that reads the database runs ONLY on
 * the nightly copy. The runner hands each row an environment that names only the copy; this file
 * makes the rule hold even for a row that builds its OWN connection: it refuses, BY NAME, before a
 * byte leaves the process,
 *   1. any DNS lookup or socket (net, tls, fetch — undici connects through net.Socket) to a
 *      production host, and
 *   2. any `pg` connection whose user is not the copy's `postgres.<ref>` — the pooler host is
 *      SHARED by production and the copy, so the user is the only thing that tells them apart.
 *
 * A refusal prints `[clone-target] REFUSED check <id>: …` on stderr (run.mjs reads that line as an
 * ERROR finding even when the row swallows the exception) and throws.
 */
"use strict";

const PRODUCTION_REF = "brsgrqvjdzwihsvnfqkf";
const PRODUCTION_HOSTS = new Set([
  "db.matrxserver.com",
  `db.${PRODUCTION_REF}.supabase.co`,
  `${PRODUCTION_REF}.supabase.co`,
  "server.app.matrxserver.com",
]);
const MARKER = "[clone-target] REFUSED";

const expected = process.env.MATRX_CLONE_EXPECT_USER || "";

function refuse(what) {
  const check = process.env.MATRX_CHECK_ID || "this check";
  const message =
    `${MARKER} check ${check}: ${what}. This run reads ONLY the nightly copy ` +
    `(${process.env.MATRX_CLONE_REF_NAME || "?"}); production (${PRODUCTION_REF}) is never a check's target ` +
    "(common-docs/projects/checks-run-in-the-app/PLAN.md decision 1). Remedy: read the database through " +
    "SUPABASE_MATRIX_* / CLONE_DATABASE_URL, which this run points at the copy.";
  process.stderr.write(`${message}\n`);
  return new Error(message);
}

function isProductionHost(host) {
  const h = String(host || "").trim().toLowerCase().replace(/\.$/, "");
  return PRODUCTION_HOSTS.has(h) || h.includes(PRODUCTION_REF);
}

function hostOf(args) {
  const first = args[0];
  if (Array.isArray(first)) return hostOf(first); // net internals pass [options, cb]
  if (first && typeof first === "object") return first.host || first.hostname || "";
  if (typeof args[1] === "string") return args[1];
  return "";
}

if (process.env.MATRX_CHECK_DB_TARGET === "clone") {
  if (!expected) throw refuse("the run says clone-only but names no copy user (MATRX_CLONE_EXPECT_USER unset)");

  const net = require("node:net");
  const rawConnect = net.Socket.prototype.connect;
  net.Socket.prototype.connect = function connect(...args) {
    const host = hostOf(args);
    if (isProductionHost(host)) throw refuse(`a socket to production host ${host}`);
    return rawConnect.apply(this, args);
  };

  const dns = require("node:dns");
  const rawLookup = dns.lookup;
  dns.lookup = function lookup(host, ...rest) {
    if (isProductionHost(host)) throw refuse(`resolving production host ${host}`);
    return rawLookup.call(this, host, ...rest);
  };
  const rawPromiseLookup = dns.promises.lookup;
  dns.promises.lookup = async function lookup(host, ...rest) {
    if (isProductionHost(host)) throw refuse(`resolving production host ${host}`);
    return rawPromiseLookup.call(this, host, ...rest);
  };

  // `pg` (the only Postgres client the checks use): the startup packet carries the user.
  try {
    // Before the socket: the Client carries its user and host from the constructor on.
    const Client = require("pg/lib/client");
    const rawClientConnect = Client.prototype.connect;
    Client.prototype.connect = function connect(...args) {
      const user = String(this.user || "");
      if (isProductionHost(this.host)) throw refuse(`a pg connection to production host ${this.host}`);
      if (user.includes(PRODUCTION_REF) || user !== expected) {
        throw refuse(`${user.includes(PRODUCTION_REF) ? "a PRODUCTION database connection" : "a database connection"} as ${user || "(no user)"} (the copy's user is ${expected})`);
      }
      return rawClientConnect.apply(this, args);
    };
    const Connection = require("pg/lib/connection");
    const rawStartup = Connection.prototype.startup;
    Connection.prototype.startup = function startup(config) {
      const user = String((config && config.user) || "");
      if (user.includes(PRODUCTION_REF) || user !== expected) {
        throw refuse(`${user.includes(PRODUCTION_REF) ? "a PRODUCTION database connection" : "a database connection"} as ${user || "(no user)"} (the copy's user is ${expected})`);
      }
      return rawStartup.call(this, config);
    };
  } catch (error) {
    if (error && error.code !== "MODULE_NOT_FOUND") throw error;
  }
}
