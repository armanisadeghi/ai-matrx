// scripts/filtergroups/seat-proof.mjs — LANE S2-PRIME FILTER-GROUPS, the seat proof.
//
// Rosa Delgado (test@test.com) dispatches for Topa Topa Plumbing & Rooter. She signs in through
// the app's own login form (scripts/lib/seat-browser.mjs — never a cookie, a nonce or an admin
// token) on a dev server pointed at the dev clone, and with HER session the store is asked her
// morning view — (Open or Scheduled) and (Ojai or Maria) and not Low — three ways:
//   members   custom.rule_members_visible (the saved view's membership Rule, walled and paged)
//   grid      custom.read_records_matching with the same expression (the list door)
//   board     custom.pipeline_board(org, table, 'amount', expression) (the headings)
//   refused   custom.rule_members, the server lane's loop, answers 403 to her
// All three must be her seven jobs (TT-4111, no priority yet, is "not Low"); the two warranty
// call-backs the owner kept to himself are in none.
//
// Env: FG_ORIGIN (the dev server on the clone), FG_EMAIL, FG_PASSWORD (never printed),
// FG_API (the clone's API URL), FG_KEY (its publishable key), FG_ORG, FG_JOBS, FG_RULE,
// FG_STATUS, FG_CITY, FG_TECH, FG_PRIORITY.

import { chromium } from "playwright";
import { signIn } from "../lib/seat-browser.mjs";

const E = (k) => {
  const v = process.env[k];
  if (!v) throw new Error(`${k} is not set`);
  return v;
};
const ORIGIN = E("FG_ORIGIN");
const API = E("FG_API");
const KEY = E("FG_KEY");
const ORG = E("FG_ORG");
const JOBS = E("FG_JOBS");
const RULE = E("FG_RULE");
const F = { status: E("FG_STATUS"), city: E("FG_CITY"), tech: E("FG_TECH"), priority: E("FG_PRIORITY") };
const ROSAS_SEVEN = ["TT-4101", "TT-4102", "TT-4104", "TT-4111", "TT-4112", "TT-4115", "TT-4116"];
const is = (field, v) => ({ op: "eq", args: [{ field }, { const: v }] });
const VIEW = {
  op: "and",
  args: [
    { op: "or", args: [is(F.status, "Open"), is(F.status, "Scheduled")] },
    { op: "or", args: [is(F.city, "Ojai"), is(F.tech, "Maria")] },
    { op: "not", args: [is(F.priority, "Low")] },
  ],
};

const results = [];
const pass = (clause, ok, said) => {
  results.push({ clause, ok });
  console.log(`${ok ? "PASS" : "FAIL"} ${clause} — ${said}`);
};

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();
const who = await signIn(page, ORIGIN, E("FG_EMAIL"), E("FG_PASSWORD"), "test seat");
pass("signed-in", who === "test@test.com", `the app says ${who}`);

// Her session, as the login form left it in the browser (supabase-js cookie, possibly chunked).
const cookies = (await context.cookies()).filter((c) => /^sb-.*-auth-token(\.\d+)?$/.test(c.name));
cookies.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
let raw = cookies.map((c) => decodeURIComponent(c.value)).join("");
if (raw.startsWith("base64-")) raw = Buffer.from(raw.slice(7), "base64").toString("utf8");
const session = JSON.parse(raw);
const ref = cookies[0]?.name.match(/^sb-([a-z0-9]+)-auth-token/)?.[1];
pass("session-is-the-clone", API.includes(ref ?? "?"), `the session cookie names project ${ref}`);

const call = (fn, body) =>
  fetch(`${API}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: KEY,
      authorization: `Bearer ${session.access_token}`,
      "content-type": "application/json",
      "content-profile": "custom",
      "accept-profile": "custom",
    },
    body: JSON.stringify(body),
  }).then(async (r) => ({ status: r.status, body: await r.json() }));
const jobs = (rows) => (Array.isArray(rows) ? rows.map((r) => r.document?.job_no).sort() : rows);

const members = await call("rule_members_visible", { p_organization_id: ORG, p_rule_id: RULE, p_limit: 200, p_offset: 0 });
pass("members", members.status === 200 && JSON.stringify(jobs(members.body)) === JSON.stringify(ROSAS_SEVEN),
  `${members.status} ${JSON.stringify(jobs(members.body))}`);
const grid = await call("read_records_matching", { p_organization_id: ORG, p_table_id: JOBS, p_filter: VIEW, p_by_id: false, p_limit: 200, p_offset: 0 });
pass("grid", grid.status === 200 && JSON.stringify(jobs(grid.body)) === JSON.stringify(ROSAS_SEVEN),
  `${grid.status} ${JSON.stringify(jobs(grid.body))}`);
const board = await call("pipeline_board", { p_organization_id: ORG, p_table_id: JOBS, p_measure: "amount", p_filter: VIEW });
const cols = Array.isArray(board.body) ? Object.fromEntries(board.body.map((c) => [c.stage_key, `${c.cards}/$${c.total ?? 0}`])) : board.body;
pass("board", board.status === 200 && cols.open === "3/$1255" && cols.scheduled === "4/$2345",
  `${board.status} ${JSON.stringify(cols)}`);
const noCallbacks = ![...(jobs(members.body) ?? []), ...(jobs(grid.body) ?? [])].some((j) => j === "TT-4108" || j === "TT-4117");
pass("walls", noCallbacks, "the owner's two warranty call-backs (TT-4108, TT-4117) are in no answer");
const server = await call("rule_members", { p_organization_id: ORG, p_rule_id: RULE });
pass("server-only", server.status === 403, `${server.status} ${server.body?.message ?? ""}`);

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`${results.length - failed}/${results.length} clauses PASS`);
process.exit(failed ? 1 : 0);
