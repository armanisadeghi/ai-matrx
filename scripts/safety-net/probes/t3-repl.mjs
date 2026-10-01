// scratch REPL driver for authoring the T3 walk (not a check): evaluates snippets from $D/cmd.N.js
import { openWalk, bodyText, sleep, until, setOrganization } from "../lib/harness.mjs";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
const D = process.env.D;
const ctx = await openWalk("t3-repl");
const pages = { admin: await ctx.page("admin") };
if (process.env.MEMBER) pages.member = await ctx.page("member", { org: null });
const page = pages.admin; const member = pages.member;
const text = async (p = page) => (await p.locator("main").innerText().catch(() => "")).replace(/\s+/g, " ");
writeFileSync(`${D}/ready`, "1");
let n = 1;
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
for (;;) {
  const f = `${D}/cmd.${n}.js`;
  if (existsSync(f)) {
    const src = readFileSync(f, "utf8");
    if (src.trim() === "EXIT") break;
    let out;
    try { out = await new AsyncFunction("page","member","ctx","text","sleep","until","bodyText","setOrganization", src)(page, member, ctx, text, sleep, until, bodyText, setOrganization); } catch (e) { out = "ERR " + String(e?.stack ?? e).slice(0, 1500); }
    writeFileSync(`${D}/out.${n}.txt`, typeof out === "string" ? out : JSON.stringify(out, null, 1));
    n += 1;
  } else await sleep(500);
}
await ctx.finish();
