/**
 * check:alchemy-doors — THE ALCHEMY DOORS STAY THE ONLY DOORS (ALC-20).
 * Plan: common-docs/systems/platform/ui-shell/projects/matrx-alchemy/PLAN.md.
 *
 * Shrink-only refusal checks in app code. Each rule counts occurrences per file; the baseline
 * (`scripts/alchemy-doors-baseline.json`, shape { rule: { file: count } }) is today's census and
 * is ALC-19's work list. A file whose count goes UP, or a file that is NEW to a rule, fails.
 * Counts only go down: `--update` rewrites the baseline but refuses any rise.
 *
 * Rules (canonical exit named in each finding):
 *  clipboard   raw navigator.clipboard / execCommand('copy'|'cut') / new ClipboardItem
 *              -> an id or plain string: @ai-matrx/kit/clipboard (useClipboard in a component); content: the Alchemy copy menu (CopyButtons).
 *  downloads   hand-built URL.createObjectURL + anchor download / a.click() / saveAs(
 *              -> @ai-matrx/kit/download (downloadFile / downloadUrl); content exports: the Alchemy menu's download action.
 *  formatlibs  direct import of xlsx exceljs jspdf html2canvas html-to-image dom-to-image file-saver jszip
 *              pptxgenjs pdf-lib pdfmake docx mammoth marked dompurify papaparse
 *              -> buildFile (/operate), readFile/readWorkbook/parseDelimited (/operate/read),
 *              captureElement/renderElement/pagesToPdf (/operate/capture), buildZip/readZip (/operate/zip),
 *              buildPresentation (/operate/pptx). The editor's
 *              gfm-lexer `marked` is ruled to stay.
 *  doorbypass  applySurfaceWrite / loadSurfaceWriteDoor / surfaceWriteDeclarations referenced as
 *              code outside surfaces/runtime, components/agent-copy/alchemy-door.ts and the agent write thunk
 *              -> dispatch through the surface write door (a declared write target + handler).
 *  registries  a module-level `new Map` of actions/handlers in a file named *registry*, OR (any
 *              file name) a module-level `new Map`/`new Set` beside an exported `register*` function
 *              -> register with Alchemy's registry instead of a private one.
 *  handcsv     a hand-rolled CSV/TSV writer: quote-doubling (`.replace(/"/g, '""')`) or a
 *              `.join(",")` / `.join("\t")` over rows within 15 lines of a csv/tsv mime or filename
 *              (the join counts only when it follows a row `.map(` / `.forEach(` — a join of a plain list, e.g. a file-extension
 *              accept string beside the word "csv", is not a writer)
 *              -> toDelimitedText (/operate/read) or buildFile (/operate): ONE dialect, spreadsheet-safe.
 *  windowopen  `window.open(` of a blob / object URL (a file handed to a popup, which blockers kill)
 *              -> downloadFile / downloadUrl (kit), or the Alchemy menu's open/preview action.
 *  anchorclick `a.href = …; a.click()` with no `download` attribute (navigates instead of saving)
 *              -> downloadUrl (kit); a real link is an <a href> element, not a script click.
 *
 * Named exemptions (ALLOW) are exact files (or one named directory) and carry their reason beside
 * them - never a whole feature directory without one. components/dialogs/clipboard-fallback/
 * is the dialog that appears when the browser REFUSES the kit clipboard door (permission denied /
 * insecure context) - it holds the person's text in a selectable field to copy by hand, and must
 * itself touch the raw clipboard API / execCommand once to try, so it cannot route through the door
 * that sends people to it.
 *
 * Scanned: tracked .ts/.tsx/.js/.jsx/.mjs under app features components lib hooks providers utils
 * packages (tests, .d.ts, generated, node_modules excluded). Comments are ignored.
 * `--self-test` plants a violation per rule and proves red, then green. `--list` prints every offender.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import { REPO_ROOT, repoFiles } from "./lib/repo-files";

const BASELINE = "scripts/alchemy-doors-baseline.json";
const SCAN_DIRS = ["app", "features", "components", "lib", "hooks", "providers", "utils", "packages"];

type Rule = "clipboard" | "downloads" | "formatlibs" | "doorbypass" | "registries" | "handcsv" | "windowopen" | "anchorclick";
const RULES: Rule[] = ["clipboard", "downloads", "formatlibs", "doorbypass", "registries", "handcsv", "windowopen", "anchorclick"];

const ADVICE: Record<Rule, string> = {
  clipboard: "copy an id or plain string through @ai-matrx/kit/clipboard (useClipboard), and content through the Alchemy copy menu (CopyButtons)",
  downloads: "save a file with downloadFile / downloadUrl from @ai-matrx/kit/download (the one download door), never a hand-built blob + anchor",
  formatlibs: "export with buildFile (@ai-matrx/alchemy/operate), read with readFile/readWorkbook/parseDelimited (@ai-matrx/alchemy/operate/read), capture with @ai-matrx/alchemy/operate/capture, zip with /operate/zip, decks with /operate/pptx — never a direct library import",
  doorbypass: "write through the surface write door (declared write target + handler), never applySurfaceWrite directly",
  registries: "register the action with Alchemy's registry; no private action/handler map",
  handcsv: "write CSV/TSV with toDelimitedText or buildFile (@ai-matrx/alchemy/operate), read it with parseDelimited (@ai-matrx/alchemy/operate/read) — never a hand-rolled quote/join writer or a char-loop quote reader",
  windowopen: "hand a file to downloadFile / downloadUrl (@ai-matrx/kit/download); never window.open of a blob or object URL",
  anchorclick: "save through downloadUrl (@ai-matrx/kit/download); a script-clicked anchor with no download attribute navigates instead of saving",
};

/** Canonical engines + named exceptions, by repo-relative prefix or exact path, per rule. */
const ALLOW: Record<Rule, string[]> = {
  // components/dialogs/clipboard-fallback/: the manual-copy dialog shown when the browser refuses the
  // kit clipboard door; it must try the raw API itself and cannot route through the door that sent it there.
  // No agent-copy file is exempt: the Alchemy copy surfaces copy through the kit door like everyone else.
  clipboard: ["components/dialogs/clipboard-fallback/"],
  downloads: [
    // A static asset of OUR OWN origin (public/) behind a plain <a download>: same-origin, so the browser
    // honors the name and saves it; no blob, no script click, no cross-origin navigation for the kit door to fix.
    "app/(public)/the-landscape/page.tsx",
    "features/messaging/demo/DemoAttachment.tsx",
  ],
  formatlibs: ["components/rich-editor/core/gfm-lexer.ts"],
  doorbypass: [
    "../aidream/apps/shared/chat/src/surfaces/runtime/",
    // THE ONE WRITE DOOR bound for the app (ALC-17): it IS the door - it wraps applySurfaceWrite /
    // loadSurfaceWriteDoor into the Alchemy host's `door` port. Only this file of agent-copy/ is exempt.
    "components/agent-copy/alchemy-door.ts",
    "../aidream/apps/shared/chat/src/agents/redux/execution-system/thunks/dispatch-surface-write.thunk.ts",
  ],
  registries: [
    // Client directives are the server -> client stream INSTRUCTION vocabulary
    // (what the stream tells the page to do), not Actions or menu items (coordinator ruling).
    "lib/client-directives/directiveRegistry.ts",
    // A naming map of surface-config namespaces: validate / merge / empty for
    // `ui.ui_surface_config` JSONB rows. No runnable entries, no actions, no menu items.
    "../aidream/apps/shared/chat/src/surfaces/config/namespace-registry.ts",
    // The DECLARATION store behind a provider that IS registered into Alchemy's one registry
    // (`richDocumentActionProvider`, T0, ensureRichDocumentProvider): handler modules add their
    // RichDocumentAction at load (hoisted store, import-cycle safe) and the provider converts each
    // to an Alchemy Action. Nothing resolves or runs from this Map except through that provider.
    "features/rich-document/actions/provider.ts",
    // Binds a record's menu rows to the DOM root that shows it (`data-record-menu`), read at open by
    // ContextMenuV3 and joined into that menu's `extraSections`, which the shell hands to Alchemy.
    // A lookup of owner getters by element key; the rows' actions reach the registry the same way
    // every other extraSections row does. Not an action store.
    "features/context-menu-v3/record-menu-registry.ts",
    // AP-2 triage (2026-10-07): each holds ADAPTERS / DATA / HANDLES, no runnable menu or toolbar action.
    // Mermaid structural-editing adapters (parse / serialize / applyOp per diagram type) - the workbench's model layer.
    "components/mermaid/model/adapter.ts",
    // Library tab-source adapters (tab-id prefix -> loader); a data-source lookup.
    "features/code/library-sources/registry.ts",
    // Content-conversion generators keyed by target kind - the converter contract's dispatch table, not a menu.
    "features/education/convert/registry.ts",
    // Cloud-files virtual-root storage adapters (read/write a source); not actions.
    "features/files/virtual-sources/registry.ts",
    // Declared mandate PLACES (where a feature's agent runs) - declarations read by the intelligence page.
    "features/mandates/feature-intelligence/page-intelligence-doors.ts",
    // Live-instance lookup providerId -> getCtx + the resolved action list of a mounted RichDocument; those
    // actions are the SAME ones the Alchemy richDocumentActionProvider owns and run through the Alchemy ClickTarget.
    "features/rich-document/runtime/providerBridge.ts",
    // WindowPanel's own imperative openPopout handle by window id; not a menu action.
    "features/window-panels/popout/usePopoutControl.ts",
    // Providers of client-state payloads sent WITH an agent request (client.capabilities), not user-invoked actions.
    "../aidream/apps/shared/chat/src/agents/redux/execution-system/client-capabilities/registry.ts",
    // Promise resolvers for a pending ask_user tool call (callId -> resolve); a rendezvous, not an action.
    "../aidream/apps/shared/chat/src/agents/ui-first-tools/redux/ask-resolver-registry.ts",
    // Mounted custom-fields section doors (the surface write door's targets for `custom_fields`); not menu actions.
    "../aidream/apps/shared/chat/src/surfaces/runtime/custom-field-targets.ts",
  ],
  handcsv: [],
  // QuickHtmlShareModal opens the author's HTML in a new tab as a PREVIEW of the page (a blob URL they look
  // at, with the real download one button over) - there is nothing to save, so it is not a download.
  windowopen: ["features/agent-apps/components/QuickHtmlShareModal.tsx"],
  // The sandbox escape probe clicks a `javascript:` anchor on purpose, to PROVE the sandbox refuses it —
  // it saves nothing and navigates nowhere.
  anchorclick: ["features/content-ir/sandbox/browser/probes.ts"],
};

const LIBS =
  "xlsx|exceljs|jspdf|jspdf-autotable|html2canvas|marked|dompurify|isomorphic-dompurify|papaparse" +
  "|html-to-image|dom-to-image|dom-to-image-more|modern-screenshot|file-saver|jszip|pptxgenjs|pdf-lib|pdfmake|html2pdf\\.js|docx|mammoth|canvas-to-blob";
const LIB_IMPORT = new RegExp(
  `(?:from\\s*|import\\s*\\(\\s*|require\\s*\\(\\s*|import\\s+)["'](?:${LIBS})(?:/[^"']*)?["']`,
);

const CSV_QUOTE_DOUBLING = /\.replace(?:All)?\(\s*(?:\/"\/g|["']"["'])\s*,\s*(?:["']""["']|`""`)\s*\)/;
/** A hand-rolled CSV READER: a char loop that toggles an in-quotes flag and compares chars to `"` and `,`. */
const CSV_QUOTE_FLAG_TOGGLE = /\b(?:in|inside|is)_?(?:Double)?Quot(?:e|es|ed)\w*\s*=\s*(?:!\s*\w+|true|false)\b/i;
const CSV_QUOTE_CHAR = /(?:===?|!==?)\s*(?:'"'|"\\""|`"`)|(?:'"'|"\\""|`"`)\s*(?:===?|!==?)/;
const CSV_COMMA_CHAR = /(?:===?|!==?)\s*(?:","|',')|(?:","|',')\s*(?:===?|!==?)|case\s+(?:","|',')/;
const CSV_JOIN = /\.join\(\s*["'`](?:,|\\t)["'`]\s*\)/;
const CSV_NAME = /text\/csv|text\/tab-separated|["'`.][\w-]*\.(?:csv|tsv)\b|\b(?:csv|tsv)\b/i;
/** A module Map whose declared value can RUN (a handler, action, command, provider, adapter, resolver, door, callback). */
const RUNNABLE_VALUE = /action|handler|command|menu|provider|adapter|resolver|generator|door|callback|=>|Fn\b/i;
/** A Map/Set of bare `() => void` listeners (pub/sub, abort waiters) holds subscriptions, not runnable actions. */
const LISTENER_SET = /Set<\s*\(\s*\)\s*=>\s*void\s*>/;
/**
 * The raw clipboard, however it is reached: `navigator.clipboard` / `navigator?.clipboard` /
 * `navigator["clipboard"]`, a clipboard method on ANY receiver (a cast `(navigator as …).clipboard
 * .writeText(`, `window.navigator.clipboard?.read(`, a destructured `clipboard.writeText(`), the
 * destructuring itself (`const { clipboard } = navigator`), execCommand copy/cut, new ClipboardItem.
 */
const RAW_CLIPBOARD =
  /navigator\s*\??\.\s*clipboard\b|navigator\s*\[\s*["'`]clipboard["'`]\s*\]|\bclipboard\s*[!?]?\.\s*(?:writeText|write|readText|read)\s*\(|\{[^}]*\bclipboard\b[^}]*\}\s*=\s*(?:window\.)?navigator\b|execCommand\(\s*["'](copy|cut)["']|new\s+ClipboardItem\b/;
const OBJECT_URL = /URL\.createObjectURL\s*\(|["'`]blob:/;

const DOWNLOAD_MARK = [/\.download\s*=/, /setAttribute\(\s*["']download["']/, /\bsaveAs\s*\(/];
/** Whole-source marks (whitespace/newlines allowed inside), so a call split over lines still counts. */
const DOWNLOAD_MARK_ML = [/\.download\s*=(?!=)/g, /setAttribute\(\s*["']download["']/g, /\bsaveAs\s*\(/g];

/**
 * 0-based line indexes of every JSX `<a …download…>` opening tag, however many lines the tag spans.
 * Scans each `<a` tag to its closing `>` at brace depth 0, skipping `{…}` expressions (an `=>` inside
 * `onClick={() => …}` is not the end of the tag) and quoted strings.
 */
export function anchorDownloadLines(src: string): number[] {
  const out: number[] = [];
  const re = /<a(?=[\s>])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    let i = m.index + 2, depth = 0, quote = "";
    for (; i < src.length; i++) {
      const c = src[i];
      if (quote) { if (c === quote) quote = ""; continue; }
      if (depth === 0 && (c === '"' || c === "'")) quote = c;
      else if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth <= 0) break;
    }
    const tag = src.slice(m.index, i);
    // Drop {expression} bodies and quoted values so only attribute NAMES are searched.
    const names = tag.replace(/\{[\s\S]*?\}/g, "{}").replace(/"[^"]*"|'[^']*'/g, '""');
    const d = /\sdownload\b/.exec(names);
    if (d) {
      // line of the `download` attribute in the original tag
      const at = tag.search(/\sdownload\b/);
      out.push(src.slice(0, m.index + (at < 0 ? 0 : at) + 1).split("\n").length - 1);
    }
  }
  return out;
}

/** 0-based line indexes where a multi-line-safe download mark begins. */
function downloadMarkLines(src: string): Set<number> {
  const set = new Set<number>(anchorDownloadLines(src));
  for (const r of DOWNLOAD_MARK_ML) {
    r.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = r.exec(src))) set.add(src.slice(0, m.index).split("\n").length - 1);
  }
  return set;
}

/** Remove comments, keeping line structure. */
function stripComments(src: string): string {
  const noBlock = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  return noBlock
    .split("\n")
    .map((l) => (/^\s*\/\//.test(l) ? "" : l.replace(/(^|[^:"'`\\])\/\/[^"'`]*$/, "$1")))
    .join("\n");
}

export interface Hit { rule: Rule; file: string; line: number; text: string }

export function scanSource(file: string, src: string): Hit[] {
  const hits: Hit[] = [];
  const stripped = stripComments(src);
  const lines = stripped.split("\n");
  const markLines = downloadMarkLines(stripped);
  const base = file.split("/").pop() ?? file;
  const allowed = (rule: Rule) => ALLOW[rule].some((a) => file === a || file.startsWith(a));
  const add = (rule: Rule, i: number) => {
    if (!allowed(rule)) hits.push({ rule, file, line: i + 1, text: lines[i].trim().slice(0, 100) });
  };
  const hasDownload = markLines.size > 0;
  const isRegistry = /registry/i.test(base);
  const near = (i: number, back: number, fwd: number, test: (l: string) => boolean) =>
    lines.slice(Math.max(0, i - back), i + fwd + 1).some(test);
  const readsCsvByHand = lines.some((l) => CSV_QUOTE_CHAR.test(l)) && lines.some((l) => CSV_COMMA_CHAR.test(l)) &&
    lines.some((l) => /csv|tsv|delimited/i.test(l));
  const hasRegisterFn = lines.some((l) => /^export\s+(?:async\s+)?(?:function\s+register\w*\s*[(<]|const\s+register\w*\s*[:=])/.test(l));
  lines.forEach((l, i) => {
    if (RAW_CLIPBOARD.test(l)) add("clipboard", i);
    if (markLines.has(i) || (hasDownload && /URL\.createObjectURL\s*\(/.test(l))) add("downloads", i);
    if (LIB_IMPORT.test(l)) add("formatlibs", i);
    if (/\b(applySurfaceWrite|loadSurfaceWriteDoor|surfaceWriteDeclarations)\b/.test(l)) add("doorbypass", i);
    if (
      isRegistry &&
      /^(export\s+)?(const|let)\s+\w+\s*(:[^=]*)?=\s*new\s+Map\b/.test(l) &&
      /action|handler/i.test(l)
    )
      add("registries", i);
    else if (hasRegisterFn && /^(export\s+)?(const|let)\s+\w+\s*(:[^=]*)?=\s*new\s+Map\b/.test(l) && RUNNABLE_VALUE.test(l) && !LISTENER_SET.test(l)) add("registries", i);
    if (CSV_QUOTE_DOUBLING.test(l) || (CSV_JOIN.test(l) && near(i, 8, 0, (x) => /\.map\(|\.forEach\(/.test(x)) && near(i, 15, 15, (x) => CSV_NAME.test(x)))) add("handcsv", i);
    if (readsCsvByHand && CSV_QUOTE_FLAG_TOGGLE.test(l)) add("handcsv", i);
    if (/\bwindow\.open\s*\(/.test(l) && near(i, 6, 3, (x) => OBJECT_URL.test(x))) add("windowopen", i);
    if (/\.click\s*\(\s*\)/.test(l) && near(i, 6, 0, (x) => /\.href\s*=(?!=)/.test(x)) && ![...markLines].some((m) => m >= i - 8 && m <= i + 3))
      add("anchorclick", i);
  });
  return hits;
}

type Counts = Record<Rule, Record<string, number>>;
const emptyCounts = (): Counts => ({ clipboard: {}, downloads: {}, formatlibs: {}, doorbypass: {}, registries: {}, handcsv: {}, windowopen: {}, anchorclick: {} });

export function tally(hits: Hit[]): Counts {
  const c = emptyCounts();
  for (const h of hits) c[h.rule][h.file] = (c[h.rule][h.file] ?? 0) + 1;
  return c;
}

/** Violations = files over (or absent from) the baseline. */
export function compare(now: Counts, base: Counts): string[] {
  const out: string[] = [];
  for (const r of RULES)
    for (const [f, n] of Object.entries(now[r])) {
      const was = base[r]?.[f] ?? 0;
      if (n > was) out.push(`${r}: ${f} has ${n} (baseline ${was})`);
    }
  return out;
}

function scanRepo(): Hit[] {
  const files = repoFiles(REPO_ROOT, { under: SCAN_DIRS, match: /\.(tsx?|jsx?|mjs)$/ }).filter(
    (f) => !/\.d\.ts$|\.test\.|\.spec\.|__tests__|\/generated\/|\.generated\.|node_modules/.test(f),
  );
  const hits: Hit[] = [];
  for (const f of files) {
    let src: string;
    try { src = readFileSync(join(REPO_ROOT, f), "utf8"); } catch { continue; }
    hits.push(...scanSource(f, src));
  }
  return hits;
}

function loadBaseline(): Counts {
  const p = join(REPO_ROOT, BASELINE);
  if (!existsSync(p)) return emptyCounts();
  return { ...emptyCounts(), ...JSON.parse(readFileSync(p, "utf8")) };
}

function sorted(c: Counts): Counts {
  const o = emptyCounts();
  for (const r of RULES) for (const k of Object.keys(c[r]).sort()) o[r][k] = c[r][k];
  return o;
}

function selfTest(): number {
  const plant: Record<Rule, [string, string]> = {
    clipboard: ["components/x/Foo.tsx", "navigator.clipboard.writeText(a);\n"],
    downloads: ["components/x/Foo.tsx", "const a = document.createElement('a'); a.download = 'f'; a.href = URL.createObjectURL(b); a.click();\n"],
    formatlibs: ["features/x/Foo.ts", "import * as XLSX from 'xlsx';\n"],
    doorbypass: ["features/x/Foo.ts", "import { applySurfaceWrite } from 'w';\nawait applySurfaceWrite(t, v);\n"],
    registries: ["features/x/action-registry.ts", "const handlers = new Map<string, Handler>();\n"],
    handcsv: ["features/x/Foo.ts", "const csv = rows.map((r) => r.map((c) => `\"${c.replace(/\"/g, '\"\"')}\"`).join(\",\"));\n"],
    windowopen: ["features/x/Foo.ts", "const u = URL.createObjectURL(blob);\nwindow.open(u, '_blank');\n"],
    anchorclick: ["features/x/Foo.ts", "const a = document.createElement('a');\na.href = url;\na.click();\n"],
  };
  // Extra plants for the second detection paths and for the shapes each rule must NOT flag.
  const extra: { rule: Rule; file: string; src: string; red: boolean; what: string }[] = [
    { rule: "registries", file: "features/x/Foo.ts", src: "const store = new Map<string, () => void>();\nexport function registerThing(k: string, f: () => void) { store.set(k, f); }\n", red: true, what: "module Map beside exported register*" },
    { rule: "registries", file: "features/x/Foo.ts", src: "const store = new Map<string, number>();\nexport function lookup(k: string) { return store.get(k); }\n", red: false, what: "module Map with no register*" },
    { rule: "handcsv", file: "features/x/Foo.ts", src: "const mime = 'text/csv';\nconst body = rows.map((r) => r.join(','));\n", red: true, what: "join(',') beside a csv mime" },
    { rule: "handcsv", file: "features/x/Foo.ts", src: "const label = parts.join(',');\n", red: false, what: "join(',') with no csv nearby" },
    { rule: "handcsv", file: "features/x/Foo.ts", src: "const ACCEPT = '.pdf,.csv';\nconst only = ACCEPT.split(',').filter(ok).join(',');\n", red: false, what: "join(',') of an extension list beside the word csv" },
    { rule: "handcsv", file: "features/x/Foo.ts", src: "function parseCsv(text: string) {\nlet inQuotes = false;\nfor (const ch of text) {\n  if (ch === '\"') inQuotes = !inQuotes;\n  else if (ch === ',' && !inQuotes) endField();\n}\n}\n", red: true, what: "char loop toggling an inQuotes flag over quote and comma" },
    { rule: "handcsv", file: "features/x/Foo.ts", src: "function splitMailboxField(raw: string) {\nlet inQuotes = false;\nfor (const ch of raw) {\n  if (ch === '\"') inQuotes = !inQuotes;\n  else if (ch === ',' && !inQuotes) cut();\n}\n}\n", red: false, what: "quote-aware comma split with no csv/tsv/delimited context (an address-list splitter)" },
    { rule: "handcsv", file: "features/x/Foo.ts", src: "let inQuotes = false;\nfor (const ch of text) {\n  if (ch === '\"') inQuotes = !inQuotes;\n}\n", red: false, what: "quote toggle with no comma split (not a CSV reader)" },
    { rule: "registries", file: "features/x/Foo.ts", src: "const subs = new Map<string, Set<() => void>>();\nexport function registerSub(k: string) { subs.set(k, new Set()); }\n", red: false, what: "listener-set Map beside register*" },
    { rule: "downloads", file: "features/x/Foo.tsx", src: "const x = (\n  <a\n    href={url}\n    target=\"_blank\"\n    download={name}\n    className=\"c\"\n  >\n    Save\n  </a>\n);\n", red: true, what: "multi-line JSX <a download=...> anchor" },
    { rule: "downloads", file: "features/x/Foo.tsx", src: "const x = (\n  <a\n    href={url}\n    onClick={() => go(url)}\n    className=\"c\"\n  >\n    Open\n  </a>\n);\n", red: false, what: "multi-line JSX <a> with an => handler and no download attribute" },
    { rule: "downloads", file: "features/x/Foo.tsx", src: "const x = (\n  <a\n    href={url}\n    onClick={() => go(url)}\n    download\n  >\n    Save\n  </a>\n);\n", red: true, what: "multi-line JSX <a> with an => handler THEN a bare download attribute" },
    { rule: "downloads", file: "features/x/Foo.ts", src: "a.setAttribute(\n  'download',\n  name,\n);\n", red: true, what: "setAttribute('download') split over lines" },
    { rule: "windowopen", file: "features/x/Foo.ts", src: "const u = URL.createObjectURL(blob);\nwindow.open(\n  u,\n  '_blank',\n);\n", red: true, what: "multi-line window.open of an object URL" },
    { rule: "windowopen", file: "features/x/Foo.ts", src: "window.open('https://example.com', '_blank');\n", red: false, what: "window.open of a plain URL" },
    { rule: "anchorclick", file: "features/x/Foo.ts", src: "const a = document.createElement('a');\na.href = url;\na.download = 'f.csv';\na.click();\n", red: false, what: "anchor click WITH a download attribute (the downloads rule owns it)" },
    { rule: "clipboard", file: "components/x/Foo.tsx", src: "await (\n  navigator as { clipboard?: { writeText(t: string): Promise<void> } }\n).clipboard.writeText(url);\n", red: true, what: "clipboard reached through a cast receiver" },
    { rule: "clipboard", file: "components/x/Foo.tsx", src: "await navigator[\"clipboard\"].writeText(url);\n", red: true, what: "navigator[\"clipboard\"]" },
    { rule: "clipboard", file: "components/x/Foo.tsx", src: "const { clipboard } = window.navigator;\n", red: true, what: "clipboard destructured off navigator" },
    { rule: "clipboard", file: "components/x/Foo.tsx", src: "const items = await nav.clipboard?.read();\n", red: true, what: "clipboard?.read( on an alias receiver" },
    { rule: "clipboard", file: "components/agent-copy/CopyButtons.tsx", src: "navigator.clipboard.writeText(a);\n", red: true, what: "an agent-copy file is NOT exempt" },
    { rule: "clipboard", file: "components/x/Foo.tsx", src: "const text = e.clipboardData.getData('text/plain');\n", red: false, what: "a paste event's clipboardData" },
    { rule: "clipboard", file: "components/x/Foo.tsx", src: "const ok = await copyText(url, 'Link copied');\n", red: false, what: "the kit copy" },
    { rule: "doorbypass", file: "components/agent-copy/AlchemyHost.tsx", src: "await applySurfaceWrite(t, v);\n", red: true, what: "agent-copy beyond the one door file is NOT exempt" },
    { rule: "doorbypass", file: "components/agent-copy/alchemy-door.ts", src: "await applySurfaceWrite(t, v);\n", red: false, what: "the one write door file" },
  ];
  let bad = 0;
  for (const lib of ["html-to-image", "jszip", "pptxgenjs", "file-saver", "docx", "pdf-lib", "dom-to-image-more"]) {
    const src = `const m = await import("${lib}");\n`;
    const red = scanSource("features/x/Foo.ts", src).some((h) => h.rule === "formatlibs");
    const exempt = scanSource("components/rich-editor/core/gfm-lexer.ts", src).length === 0;
    console.log(`[self-test] formatlibs ${lib}: ${red ? "RED" : "NOT RED"}, allowlist ${exempt ? "exempt" : "NOT exempt"} ${red && exempt ? "ok" : "FAIL"}`);
    if (!(red && exempt)) bad++;
  }
  for (const r of RULES) {
    const [file, src] = plant[r];
    const hits = scanSource(file, src).filter((h) => h.rule === r);
    const red = compare(tally(hits), emptyCounts()).length > 0;
    const green = compare(tally(hits), tally(hits)).length === 0;
    const allowedFile = ALLOW[r].length ? (ALLOW[r][0].endsWith("/") ? ALLOW[r][0] + "x.ts" : ALLOW[r][0]) : null;
    const allowedHits = allowedFile ? scanSource(allowedFile, src).filter((h) => h.rule === r) : [];
    const commentOnly = scanSource(file, `// ${src.split("\n").join("\n// ")}`).filter((h) => h.rule === r);
    const ok = hits.length > 0 && red && green && allowedHits.length === 0 && commentOnly.length === 0;
    console.log(`[self-test] ${r}: planted->${red ? "RED" : "not red"}, baselined->${green ? "GREEN" : "not green"}, allowlist ${allowedFile === null ? "none" : allowedHits.length === 0 ? "exempt" : "NOT exempt"}, comment ${commentOnly.length === 0 ? "ignored" : "COUNTED"} ${ok ? "ok" : "FAIL"}`);
    if (!ok) bad++;
  }
  for (const e of extra) {
    const hit = scanSource(e.file, e.src).some((h) => h.rule === e.rule);
    const ok = hit === e.red;
    console.log(`[self-test] ${e.rule}: ${e.what} -> ${hit ? "RED" : "green"} ${ok ? "ok" : "FAIL"}`);
    if (!ok) bad++;
  }
  return bad ? 1 : 0;
}

function main(): number {
  const args = process.argv.slice(2);
  if (args.includes("--self-test")) return selfTest();
  const hits = scanRepo();
  const now = tally(hits);
  if (args.includes("--list")) for (const h of hits) console.log(`${h.rule}  ${h.file}:${h.line}  ${h.text}\n   -> ${ADVICE[h.rule]}`);
  const totals = RULES.map((r) => `${r}=${Object.values(now[r]).reduce((a, b) => a + b, 0)}`).join(" ");
  const p = join(REPO_ROOT, BASELINE);
  if (args.includes("--init") || (args.includes("--update") && !existsSync(p))) {
    writeFileSync(p, JSON.stringify(sorted(now), null, 2) + "\n");
    console.log(`alchemy-doors: baseline written. ${totals}`);
    return 0;
  }
  const base = loadBaseline();
  const rises = compare(now, base);
  if (args.includes("--update")) {
    if (rises.length) { console.error("alchemy-doors: refusing --update, counts rose:\n" + rises.join("\n")); return 1; }
    writeFileSync(p, JSON.stringify(sorted(now), null, 2) + "\n");
    console.log(`alchemy-doors: baseline ratcheted down. ${totals}`);
    return 0;
  }
  if (rises.length) {
    console.error("alchemy-doors: FAIL (counts may only go down)");
    for (const v of rises) {
      const rule = v.split(":")[0] as Rule;
      console.error(`  ${v}\n    -> ${ADVICE[rule]}`);
      const f = v.split(": ")[1].split(" has ")[0];
      for (const h of hits.filter((x) => x.rule === rule && x.file === f)) console.error(`       ${h.file}:${h.line}  ${h.text}`);
    }
    return 1;
  }
  console.log(`alchemy-doors: ok (no file above baseline). ${totals}`);
  return 0;
}

if (require.main === module) process.exit(main());
