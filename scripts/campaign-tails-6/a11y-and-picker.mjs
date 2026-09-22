import { chromium } from "playwright";
import { signIn, setOrganization, sleep } from "../lib/seat-browser.mjs";
const ORIGIN = "http://127.0.0.1:3001";
const b = await chromium.launch({ headless: true });
const p = await (await b.newContext({ viewport: { width: 1680, height: 1050 } })).newPage();
await signIn(p, ORIGIN, process.env.AI_ADMIN_USERNAME, process.env.AI_ADMIN_PASSWORD);
await setOrganization(p, "Rincon Plumbing Co");
await p.route("**/rest/v1/rpc/checklist_templates*", (r) => r.abort("failed"));
await p.goto(`${ORIGIN}/data-v2/af3bfff6-a255-41e5-9ac2-879d53816163`, { waitUntil: "domcontentloaded" });
await sleep(6000);
await p.evaluate(() => Array.from(document.querySelectorAll("button")).find((x)=>x.textContent?.trim()==="Checklists")?.click());
await sleep(6000);
// What a screen reader would say: the document with every aria-hidden subtree
// taken out, text nodes joined by a space. Playwright dropped `accessibility`
// in 1.6x, and this is the same question asked of the live page.
const say = await p.evaluate(() => {
  const clone = document.body.cloneNode(true);
  for (const hidden of Array.from(clone.querySelectorAll("[aria-hidden='true']"))) hidden.remove();
  // A <script> is not read aloud; Next.js's inline flight payload names every
  // chunk path in node_modules and would otherwise answer this question wrong.
  for (const mute of Array.from(clone.querySelectorAll("script, style, template, noscript"))) mute.remove();
  const walker = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT);
  const parts = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = (n.textContent ?? "").trim();
    if (t) parts.push(t);
  }
  return parts.join(" ");
});
console.log("ACCESSIBILITY TREE mentions @ai-matrx:", /@ai-matrx/.test(say));
if (/@ai-matrx/.test(say)) { const i = say.indexOf("@ai-matrx"); console.log("CONTEXT:", JSON.stringify(say.slice(Math.max(0,i-200), i+200))); }
console.log("ACCESSIBILITY TREE mentions checklistTemplates:", /checklistTemplates/.test(say));
console.log("ACCESSIBILITY TREE mentions SQLSTATE :", /SQLSTATE/i.test(say));
console.log("ACCESSIBILITY TREE mentions the honest sentence:", /could not reach your data/i.test(say));
console.log("DOM still keeps it for engineers:", await p.evaluate(() => !!document.querySelector("[data-for-engineers]")));
// And the Group by picker on the drill-through board.
await p.goto(`${ORIGIN}/data-v2/af3bfff6-a255-41e5-9ac2-879d53816163?view=kanban&group=job_number&from=By+job_number+%C2%B7+RPC-1019`, { waitUntil: "domcontentloaded" });
await sleep(9000);
console.log("Group by picker says:", await p.evaluate(() => {
  const s = document.querySelector("select#view-field-kanban");
  return s ? { value: s.value, label: s.selectedOptions[0]?.textContent } : null;
}));
await p.screenshot({ path: "/Users/armanisadeghi/code/common-docs/operations/for-arman/2026-09-22/tails6-drill-through.png", fullPage: true });
await b.close();
