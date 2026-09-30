/* Throwaway planner: proposes a metadata layout for every sibling tab that inherits its shell's STATIC title. */
import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { join, relative } from "node:path";
import ts from "typescript";
import { getFaviconConfigByPath } from "./utils/favicon-utils";

const SP = process.argv[2];
const data = JSON.parse(readFileSync(join(SP, "tabs.json"), "utf8"));
const route = (dir: string) =>
  "/" + dir.replace(/^app\//, "").split("/").filter((s) => s && !(s.startsWith("(") && s.endsWith(")"))).join("/");

// ---- label index: every `href|path: "<url>"` near a label/title/name string, across the UI.
const labelFiles = execSync(`git ls-files 'app/**/*.tsx' 'app/**/*.ts' 'features/**/*.ts' 'features/**/*.tsx' 'components/**/*.tsx' 'components/**/*.ts' 'lib/**/*.ts'`, { encoding: "utf8", maxBuffer: 256 << 20 }).split("\n").filter(Boolean);
const labels = new Map<string, string[]>();
for (const f of labelFiles) {
  let s: string; try { s = readFileSync(f, "utf8"); } catch { continue; }
  if (!/(href|path|route)\s*:\s*["'`]\//.test(s)) continue;
  const lines = s.split("\n");
  lines.forEach((l, i) => {
    const m = /(?:href|path|route)\s*:\s*["'`](\/[^"'`$]+)["'`]/.exec(l);
    if (!m) return;
    for (let j = Math.max(0, i - 3); j <= Math.min(lines.length - 1, i + 3); j++) {
      const lm = /\b(?:label|title|name)\s*:\s*["']([^"']{2,40})["']/.exec(lines[j]);
      if (lm) { const a = labels.get(m[1]) ?? []; a.push(lm[1]); labels.set(m[1], a); break; }
    }
  });
}
const ACR: Record<string, string> = { ai: "AI", mcp: "MCP", cx: "CX", api: "API", seo: "SEO", pdf: "PDF", ui: "UI", crm: "CRM", sms: "SMS", llm: "LLM", url: "URL", urls: "URLs", id: "ID", gsc: "GSC", rag: "RAG", qr: "QR", csv: "CSV", ocr: "OCR", tts: "TTS", stt: "STT", db: "DB", sql: "SQL", rls: "RLS", faq: "FAQ", kpi: "KPI", v2: "v2", v3: "v3" };
const titleCase = (seg: string) => seg.split(/[-_]/).map((w) => ACR[w] ?? w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
// Reviewed by hand against the tab bars: the label index misfires when two nav
// entries sit within a few lines of each other, so these are the checked names.
const NAMES: Record<string, string> = {
  "/administration/agents/mcp-tools/new": "New Tool",
  "/administration/knowledge/cms-agents": "CMS Agents",
  "/agent-connections/mcp-servers": "MCP Servers",
  "/agent-connections/plugins": "Plugins",
  "/agent-connections/render-blocks": "Render Blocks",
  "/agent-connections/sub-agents": "Sub-agents",
  "/agents/shortcuts/new": "New Shortcut",
  "/agents/admin": "Admin",
  "/agents/all": "All",
  "/agents/categories": "Categories",
  "/chat/new": "New Chat",
  "/cms/html-pages": "HTML Pages",
  "/files/folders": "Folders",
  "/files/recents": "Recents",
  "/files/requests": "Requests",
  "/files/shared": "Shared with Me",
  "/files/trash": "Trash",
  "/knowledge/hub": "Knowledge Hub",
  "/mandates/list-preview": "List Preview",
  "/masterwork/vision-interview/new": "New Interview",
  "/masterwork/all": "All",
  "/masterwork/approaches": "Approaches",
  "/podcast/studio/create": "New Episode",
  "/scraper/batch": "Batch",
  "/tools/product-capture/manage": "Manage",
  "/settings/integrations": "Integrations",
  "/settings/organizations": "Organizations",
  "/settings/secrets": "Secrets",
};
const smallWords = new Set(["and", "with", "of", "to", "in", "a", "the", "&"]);
const titleWords = (x: string) =>
  x.split(" ").map((w, i) => (i > 0 && smallWords.has(w.toLowerCase()) ? w.toLowerCase() : /^[a-z]/.test(w) ? w[0].toUpperCase() + w.slice(1) : w)).join(" ");
function nameFor(url: string, seg: string): { name: string; from: string } {
  if (NAMES[url]) return { name: NAMES[url], from: "reviewed" };
  const c = labels.get(url);
  if (c && c.length) {
    // most common label wins
    const counts = new Map<string, number>(); for (const x of c) counts.set(x, (counts.get(x) ?? 0) + 1);
    const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    return { name: titleWords(best), from: "label" };
  }
  return { name: titleCase(seg), from: "segment" };
}

// ---- the shell owner's createRouteMetadata call: path + title + titlePrefix + description.
function ownerCall(file: string) {
  const sf = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let out: { fn: string; path: string; title?: string; titlePrefix?: string } | null = null;
  const lit = (n?: ts.Node) => n && (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) ? n.text : undefined;
  const visit = (n: ts.Node) => {
    if (out) return;
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && /^create(Dynamic)?RouteMetadata$/.test(n.expression.text)) {
      const [p, o] = n.arguments; const path = lit(p);
      if (path && o && ts.isObjectLiteralExpression(o)) {
        const get = (k: string) => { for (const pr of o.properties) if (ts.isPropertyAssignment(pr) && pr.name.getText() === k) return lit(pr.initializer); };
        out = { fn: n.expression.text, path, title: get("title"), titlePrefix: get("titlePrefix") };
        return;
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

// ---- letters in use, per colour, from the same sources the favicon guard reads.
const taken = new Map<string, Set<string>>();
const addTaken = (r: string, letter: string) => {
  const c = getFaviconConfigByPath(r)?.color ?? "?"; const s = taken.get(c) ?? new Set(); s.add(letter.toUpperCase()); taken.set(c, s);
};
{
  const rs = readFileSync("constants/favicon-route-data.ts", "utf8").split("\n");
  rs.forEach((l, i) => { const m = /letter:\s*"([^"]+)"/.exec(l); if (!m) return; for (let j = i; j >= Math.max(0, i - 4); j--) { const h = /href:\s*"([^"]+)"/.exec(rs[j]); if (h) { addTaken(h[1], m[1]); break; } } });
  for (const f of execSync(`git ls-files --cached --others --exclude-standard 'app/**/layout.tsx' 'app/**/layout.dev.tsx'`, { encoding: "utf8" }).split("\n").filter(Boolean)) {
    const s = readFileSync(f, "utf8"); const m = /letter:\s*"([^"]+)"/.exec(s); if (m) addTaken(route(f.replace(/\/layout(\.dev)?\.tsx$/, "")), m[1]);
  }
}
function pickLetter(color: string, name: string): string {
  const s = taken.get(color) ?? new Set<string>();
  const words = name.replace(/[^A-Za-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
  const w0 = (words[0] ?? "X").toUpperCase(), all = words.join("").toUpperCase();
  const cands: string[] = [];
  if (words.length >= 2) cands.push(w0[0] + words[1][0].toUpperCase());
  cands.push(w0.slice(0, 2));
  for (const ch of all.slice(1)) cands.push(w0[0] + ch);
  for (const w of words.slice(1)) for (const ch of w.toUpperCase()) cands.push(w0[0] + ch);
  for (const a of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") for (const b of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") cands.push(a + b);
  for (const c of cands) if (c.length === 2 && /^[A-Z0-9]{2}$/.test(c) && !s.has(c)) { s.add(c); taken.set(color, s); return c; }
  throw new Error("no letter");
}

const plan: string[] = [];
const skipped: string[] = [];
// Record shells: the section path whose colour the tabs wear.
const DYN_SECTION: Record<string, string> = {
  "app/(core)/research/topics/[topicId]/layout.tsx": "/research",
  "app/(core)/organizations/[orgId]/layout.tsx": "/organizations",
  "app/(core)/shapes/(workspace)/[kind]/layout.tsx": "/shapes",
  "app/(core)/agents/[id]/shortcuts/layout.tsx": "/agents",
  "app/(core)/cms/[siteId]/layout.tsx": "/cms",
};
const DYN_NAMES: Record<string, string> = { "org-2": "Workspace", "context-items": "Context Items", "performance-reviews": "Performance Reviews", "agent-apps": "Agent Apps", hr: "HR" };
if (process.argv[3] === "--dynamic") {
  for (const o of data.offences) {
    if (o.kind !== "dynamic" || !DYN_SECTION[o.owner]) continue;
    const path = DYN_SECTION[o.owner];
    const color = getFaviconConfigByPath(path)?.color ?? "?";
    for (const child of o.children as string[]) {
      const seg = child.split("/").pop()!;
      if (seg.startsWith("[")) { skipped.push(`DYNAMIC-SEG\t${child}`); continue; }
      if (existsSync(join(child, "layout.tsx"))) { skipped.push(`HAS-LAYOUT\t${child}`); continue; }
      const name = DYN_NAMES[seg] ?? titleCase(seg);
      plan.push([child, path, name, "", pickLetter(color, name), "dynamic", route(child)].join("\t"));
    }
  }
  console.log(plan.join("\n")); console.error(skipped.join("\n")); process.exit(0);
}
for (const o of data.offences) {
  if (o.kind !== "title" || o.shell.includes("(dev)")) continue;
  const call = ownerCall(o.owner);
  if (!call) { skipped.push(`NO-CALL\t${o.owner}`); continue; }
  const base = call.titlePrefix ?? call.title;
  const color = getFaviconConfigByPath(call.path)?.color ?? "?";
  for (const child of o.children as string[]) {
    const seg = child.split("/").pop()!;
    if (seg.startsWith("[")) { skipped.push(`DYNAMIC-SEG\t${child}`); continue; }
    if (existsSync(join(child, "layout.tsx"))) { skipped.push(`HAS-LAYOUT-NO-META\t${child}`); continue; }
    const url = route(child);
    const { name, from } = nameFor(url, seg);
    const letter = pickLetter(color, name);
    plan.push([child, call.path, name, base, letter, from, url].join("\t"));
  }
}
console.log(plan.join("\n"));
console.error(skipped.join("\n"));
