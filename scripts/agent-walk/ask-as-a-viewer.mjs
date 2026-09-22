/**
 * THE AGENT, REACHED DIRECTLY BY SOMEBODY WHO MAY NOT BUILD.
 *
 * Half B of the shut-door ruling (chair, 2026-09-21): the button is absent on a
 * shut door, AND the agent itself — reached by ANY other route — refuses in one
 * turn with the door's own sentence, before it calls any tool.
 *
 * This bypasses the screen entirely: it signs test@test.com in through Supabase
 * (she is a VIEWER on Ironclad Mobile Mechanic's Service Calls table) and POSTs
 * the build-ask straight at the live server, exactly the way the button would.
 *
 * "CREATES NOTHING" IS READ FROM THE DATABASE, never off the agent's sentence —
 * the caller counts custom.anon_form for this table before and after.
 *
 *   node scripts/agent-walk/ask-as-a-viewer.mjs
 */
import { formatDurationMs } from "@ai-matrx/kit/format";
import { readFileSync, existsSync } from "node:fs";

const SERVER = process.env.MATRX_SERVER ?? "https://server.app.matrxserver.com";
const TABLE = process.env.TABLE ?? "ad769621-04ba-499b-8414-dc48d589770e";
const ORG = process.env.ORG ?? "719980a1-75f1-410f-88aa-0223f38f2872";
const MANDATE = "data.page_guidance";

function env(name) {
  if (process.env[name]) return process.env[name];
  for (const file of [".env.local", ".env"]) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
      if (m?.[1] === name) return (m[2] ?? "").replace(/^["']|["']$/g, "");
    }
  }
  throw new Error(`${name} is not set and no env file up the tree carries it`);
}

const SUPABASE_URL = env("NEXT_PUBLIC_SUPABASE_URL");
const ANON = env("NEXT_PUBLIC_SUPABASE_ANON_KEY");

const signIn = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: ANON, "content-type": "application/json" },
  body: JSON.stringify({
    email: "test@test.com",
    password: process.env.TEST_USER_PASSWORD ?? "Password1234#",
  }),
});
const session = await signIn.json();
if (!session.access_token) throw new Error(`could not sign test@test.com in: ${JSON.stringify(session).slice(0, 300)}`);
console.log("signed in as:", session.user?.email);

const started = Date.now();
const answered = await fetch(`${SERVER}/ai/mandates/${MANDATE}`, {
  method: "POST",
  headers: {
    authorization: `Bearer ${session.access_token}`,
    "content-type": "application/json",
    "x-organization-id": ORG,
  },
  body: JSON.stringify({
    user_input: "make me a signup form",
    stream: true,
    context: {
      records_table_id: TABLE,
      records_wanted: "form",
      records_suggested_wording: "A sign-up sheet people can fill in",
    },
  }),
});

const body = await answered.text();
console.log("HTTP", answered.status, `in ${formatDurationMs(Date.now() - started, { style: "compact" })}`);
console.log("----- WHAT THE AGENT SAID -----");
// NDJSON: print the text the person would read, and every tool call if any.
const said = [];
const tools = [];
for (const line of body.split("\n")) {
  if (!line.trim()) continue;
  let event;
  try {
    event = JSON.parse(line);
  } catch {
    said.push(line);
    continue;
  }
  if (typeof event.data === "string") said.push(event.data);
  else if (typeof event.text === "string") said.push(event.text);
  if (/tool/i.test(event.event ?? event.type ?? "")) tools.push(event.event ?? event.type);
}
console.log(said.join("").trim() || body.slice(0, 2000));
console.log("----- TOOL CALLS -----");
console.log(tools.length === 0 ? "none" : JSON.stringify(tools));
