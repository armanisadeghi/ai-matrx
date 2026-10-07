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
 *              buildPresentation (/operate/pptx). No app file is exempt. Also a VALUE import of `@ai-matrx/print/pdf`: app code
 *              reaches the PDF engine through @ai-matrx/alchemy/operate/capture (captureDocumentPdf, renderElement
 *              + pagesToPdf; rasteriser ruling A6).
 *  doorbypass  applySurfaceWrite / loadSurfaceWriteDoor / surfaceWriteDeclarations referenced as
 *              code outside surfaces/runtime, components/agent-copy/alchemy-door.ts and the agent write thunk
 *              -> dispatch through the surface write door (a declared write target + handler).
 *  registries  a module-level `new Map` of actions/handlers in a file named *registry*, OR (any
 *              file name) a module-level `new Map`/`new Set` beside an exported `register*` function, OR a
 *              module-level object/Record store (`const X: Record<…> = {}`, `= {} as Record<…>`,
 *              `Object.create(null)`) that the file fills by key (`X[k] =` / `Object.assign(X`) beside an
 *              exported `register*`, OR any module Map in a *registry* file beside an exported `register*`, OR a
 *              CLOSURE store (a Map made inside a function, declared under an action/handler/command/… name)
 *              -> register with Alchemy's registry instead of a private one, or ALLOW with the true reason.
 *  handcsv     a SPLIT-based CSV/TSV reader: a line split (`.split("\n")`, `.split(/\r?\n/)`) followed within
 *              6 lines by a field split on `,` / a tab / a delimiter variable, within 20 lines of csv/tsv/delimited
 *              (breaks on every quoted cell and never reverses the formula guard) -> parseDelimited; or
 *              a hand-rolled CSV/TSV writer: quote-doubling (`.replace(/"/g, '""')`) or a
 *              `.join(",")` / `.join("\t")` over rows within 15 lines of a csv/tsv mime or filename
 *              (the join counts only when it follows a row `.map(` / `.forEach(` — a join of a plain list, e.g. a file-extension
 *              accept string beside the word "csv", is not a writer)
 *              or the ROW/LINE STRUCTURE with no csv/tsv word needed: a `.join("\t")` over mapped cells, a
 *              `.join(",")`/`.join("\t")` ending a row whose rows are then joined by a line break, or a line
 *              split followed by a tab split
 *              -> toDelimitedText (/operate/read) or buildFile (/operate), or kit toDelimited / parseDelimited:
 *              ONE dialect, spreadsheet-safe.
 *  windowopen  `window.open(` of a blob / object URL (a file handed to a popup, which blockers kill)
 *              -> downloadFile / downloadUrl (kit), or the Alchemy menu's open/preview action.
 *  anchorclick `a.href = …; a.click()` with no `download` attribute (navigates instead of saving)
 *              -> downloadUrl (kit); a real link is an <a href> element, not a script click.
 *
 * Named exemptions (ALLOW) are exact files (or one named directory) and carry their reason beside
 * them - never a whole feature directory without one. An ALLOW path that no longer exists FAILS the
 * run (a dead exemption silently covers whatever file lands there next). The clipboard-fallback
 * dialog is NOT exempt: its retry goes through kit copyText like every other copy.
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
  // No exemption: the manual-copy dialog's retry goes through kit copyText like everyone else (AP-2
  // fifth check), and no agent-copy file is exempt either.
  clipboard: [],
  downloads: [
    // A static asset of OUR OWN origin (public/) behind a plain <a download>: same-origin, so the browser
    // honors the name and saves it; no blob, no script click, no cross-origin navigation for the kit door to fix.
    "app/(public)/the-landscape/page.tsx",
    "features/messaging/demo/DemoAttachment.tsx",
  ],
  // No exemption: app code reaches every format engine through Alchemy (the gfm-lexer twin is gone).
  formatlibs: [],
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
    // Binds a record's menu rows to the DOM root that shows it (`data-record-menu`), read at open by
    // ContextMenuV3 and joined into that menu's `extraSections`, which the shell hands to Alchemy.
    // A lookup of owner getters by element key; the rows' actions reach the registry the same way
    // every other extraSections row does. Not an action store.
    "features/context-menu-v3/record-menu-registry.ts",
    // AP-2 triage (2026-10-07): each holds ADAPTERS / DATA / HANDLES, no runnable menu or toolbar action.
    // Library tab-source adapters (tab-id prefix -> loader); a data-source lookup.
    "features/code/library-sources/registry.ts",
    // Content-conversion generators keyed by target kind - the converter contract's dispatch table, not a menu.
    "features/education/convert/registry.ts",
    // Cloud-files virtual-root storage adapters (read/write a source); not actions.
    "features/files/virtual-sources/registry.ts",
    // Declared mandate PLACES (where a feature's agent runs) - declarations read by the intelligence page.
    "features/mandates/feature-intelligence/page-intelligence-doors.ts",
    // WindowPanel's own imperative openPopout handle by window id; not a menu action.
    "features/window-panels/popout/usePopoutControl.ts",
    // Providers of client-state payloads sent WITH an agent request (client.capabilities), not user-invoked actions.
    "../aidream/apps/shared/chat/src/agents/redux/execution-system/client-capabilities/registry.ts",
    // Promise resolvers for a pending ask_user tool call (callId -> resolve); a rendezvous, not an action.
    "../aidream/apps/shared/chat/src/agents/ui-first-tools/redux/ask-resolver-registry.ts",
    // Mounted custom-fields section doors (the surface write door's targets for `custom_fields`); not menu actions.
    "../aidream/apps/shared/chat/src/surfaces/runtime/custom-field-targets.ts",
    // AP-2 A5 triage (2026-10-07) of the widened rule (object/Record stores; any Map in a *registry* file):
    // none holds a runnable menu/toolbar/copy/export action, so none folds into Alchemy's registry.
    // conversationId -> threadId lookup for the war-room write tools (data).
    "features/agents/war-room-tools/thread-target-registry.ts",
    // Live audio-session CONTROLS by id (the audio lock family's bookkeeping); a handle table, not an action.
    "features/audio/session/audioSessionRegistry.ts",
    // Tool-result READERS: "did this tool result create a record the canvas can show" (a classifier lookup).
    "features/canvas/tool-results/toolResultCanvasRegistry.ts",
    // Monaco language-environment descriptors and their activation state (editor configuration).
    "features/code/editor/monaco-environments/registry.ts",
    // Render-preview COMPONENTS by library tab prefix (a renderer lookup).
    "features/code/preview/renderPreviewRegistry.ts",
    // Handles to mounted <CodeWorkspace> instances (+ their change listeners); a handle table.
    "features/code/runtime/workspaceRegistry.ts",
    // Kind -> record disposition (how a kind's payload maps onto a record); declarations, not actions.
    "features/content-ir/records/kind-record-registry.ts",
    // Transcript-studio MODULE definitions (feature modules registered at boot); a module catalog.
    "features/transcript-studio/modules/registry.ts",
    // URL -> panel HYDRATORS run once when a URL carrying panel state loads; restoration, never a menu row.
    "features/window-panels/url-sync/UrlPanelRegistry.ts",
    // Guided-setup CHECKLIST definitions (steps + done-tests); declarations read by the checklist UI.
    "lib/guided-setup/registry.ts",
    // AbortControllers of in-flight agent requests by request id; a cancellation handle.
    "../aidream/apps/shared/chat/src/agents/redux/execution-system/thunks/abort-registry.ts",
    // The host's server-side dependency injection (createClient, getAgent); a port.
    "../aidream/apps/shared/chat/src/host/server-deps.ts",
    // The host's UI slot components injected into the package; a port.
    "../aidream/apps/shared/chat/src/host/ui-slots.tsx",
    // Tool-call RENDERER components by tool name; a component lookup.
    "../aidream/apps/shared/chat/src/tool-call-visualization/registry/registry.tsx",
    // Client tools the MODEL calls on a realtime voice surface; an agent tool table, never a menu row.
    "../aidream/apps/shared/chat/src/voice-agent/runtime/client-tool-registry.ts",
    // Applet RESULT components by function name (how a function's output renders); a component lookup.
    "utils/ts-function-registry/component-registry.ts",
    // The applet builder's FUNCTION CATALOG (metadata + execute, run only by an applet's configured step via
    // AppletRunner / SmartFunctionExecutor); not a copy/export/menu action, and Alchemy's registry has no
    // applet-function kind to hold it.
    "utils/ts-function-registry/function-registry.ts",
  ],
  handcsv: [
    // Anki's text import is `front<TAB>back`, ONE note per line (fields collapsed to a single line, no
    // quoting), and the app's own tab importer (parseImportText) is line-based too — a quoted multi-line
    // cell would not re-import and a quote character would land in the card text.
    "features/education/onboard/export/deckFormats.ts",
  ],
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
/** A split-based CSV/TSV READER: a line split... */
const LINE_SPLIT = /\.split\(\s*(?:["'`](?:\\r)?\\n["'`]|\/[^/\n]*\\n[^/\n]*\/)/;
/** ...then a field split on a comma, a tab, or a delimiter variable. */
const FIELD_SPLIT = /\.split\(\s*(?:["'`](?:,|\\t)["'`]|\/,\/|\/\\t\/|delim\w*\s*\)|separator\s*\)|sep\s*\))/i;
/** A tab field split — after a line split it is a TSV reader whatever the file is named. */
const TAB_SPLIT = /\.split\(\s*(?:["'`]\\t["'`]|\/\\t\/)\s*\)/;
/** Row writers: a cell join on a tab or a comma, and the line join that stacks the rows. */
const TAB_JOIN = /\.join\(\s*["'`]\\t["'`]\s*\)/;
/** A template literal that builds a tab row by hand: `${a}\t${b}`. */
const TAB_TEMPLATE = /\$\{[^}]*\}\\t\$\{/;
const COMMA_JOIN = /\.join\(\s*["'`],["'`]\s*\)/;
const COMMA_ROW_END = /\.join\(\s*["'`],["'`]\s*\)(?:\s*\))*\s*(?:[;,]?\s*$|\.join\()/;
/** The NAME/type a closure Map is declared under (not its constructor arguments) says whether it can run. */
const RUNNABLE_NAME = /action|handler|command|provider|adapter|resolver|generator|door|callback|Fn\b/i;
const closureDecl = (l: string) => l.replace(/new\s+Map\s*(<[^(]*>)?\s*\(.*$/, "$1");
const LINE_JOIN = /\.join\(\s*(?:["'`](?:\\r)?\\n["'`]|lineEnding|eol|EOL|newline)\s*\)/;
/** A Map made inside a function: an object-literal property (`actions: new Map(`) or an indented assignment. */
const CLOSURE_MAP = /\b\w+\s*:\s*new\s+Map\b|^\s+(?:(?:const|let)\s+)?\w+\s*(?::[^=]*)?=\s*new\s+Map\b/;
/** A VALUE import of print's PDF engine: app code reaches it through @ai-matrx/alchemy/operate/capture (ruling A6). */
const PRINT_PDF_IMPORT = /(?:from\s*|import\s*\(\s*|require\s*\(\s*)["']@ai-matrx\/print\/pdf["']/;
/** A module-level object store: `const X: Record<…> = {}`, `const X: { [k: string]: … } = {}`, `= {} as Record<…>`, `Object.create(null)`. */
const MODULE_OBJECT = /^(export\s+)?(const|let)\s+(\w+)\s*(?::\s*([^=]+?))?\s*=\s*(?:\{\s*\}|Object\.create\(\s*null\s*\))\s*(?:as\s+([^;]+))?;?\s*$/;
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
  const mutatedByKey = (name: string) =>
    lines.some((x) => new RegExp(`\\b${name}\\s*\\[[^\\]]+\\]\\s*=(?!=)|Object\\.assign\\(\\s*${name}\\b`).test(x));
  // THE ROW/LINE STRUCTURE, no csv/tsv word needed (AP-2 fifth check): a tab join over mapped cells is
  // a TSV row; a comma or tab join over mapped cells whose rows are then joined by a line break is a
  // delimited table. Either one writes a cell holding the delimiter, a quote or a line break wrong.
  const isRowWriter = (i: number) => {
    const l = lines[i];
    const mapped = near(i, 8, 0, (x) => /\.map\(|\.forEach\(|\.push\(/.test(x));
    // ANY tab join is a TSV row (an array-literal row `[a, b, c].join("\t")` has no map nearby), and so is a
    // template literal with a tab between two placeholders.
    if (TAB_JOIN.test(l) || TAB_TEMPLATE.test(l)) return true;
    // A comma join counts only where it ENDS a row (end of the line, or straight into the line join) —
    // `${list.join(",")}` inside a template is a label, not a row.
    return COMMA_ROW_END.test(l) && mapped && near(i, 0, 4, (x) => LINE_JOIN.test(x));
  };
  lines.forEach((l, i) => {
    if (RAW_CLIPBOARD.test(l)) add("clipboard", i);
    if (markLines.has(i) || (hasDownload && /URL\.createObjectURL\s*\(/.test(l))) add("downloads", i);
    if (LIB_IMPORT.test(l)) add("formatlibs", i);
    if (PRINT_PDF_IMPORT.test(l) && !/^\s*(?:import|export)\s+type\b/.test(l)) add("formatlibs", i);
    if (/\b(applySurfaceWrite|loadSurfaceWriteDoor|surfaceWriteDeclarations)\b/.test(l)) add("doorbypass", i);
    if (
      isRegistry &&
      /^(export\s+)?(const|let)\s+\w+\s*(:[^=]*)?=\s*new\s+Map\b/.test(l) &&
      /action|handler/i.test(l)
    )
      add("registries", i);
    else if (hasRegisterFn && /^(export\s+)?(const|let)\s+\w+\s*(:[^=]*)?=\s*new\s+Map\b/.test(l) && (isRegistry || RUNNABLE_VALUE.test(l)) && !LISTENER_SET.test(l)) add("registries", i);
    else if (hasRegisterFn && CLOSURE_MAP.test(l) && !LISTENER_SET.test(l) && RUNNABLE_NAME.test(closureDecl(l))) add("registries", i);
    else {
      const obj = MODULE_OBJECT.exec(l);
      if (obj && hasRegisterFn && (obj[4] || obj[5]) && mutatedByKey(obj[3])) add("registries", i);
    }
    if (FIELD_SPLIT.test(l) && near(i, 6, 0, (x) => LINE_SPLIT.test(x)) && near(i, 20, 20, (x) => /csv|tsv|delimited/i.test(x))) add("handcsv", i);
    else if (TAB_SPLIT.test(l) && near(i, 6, 0, (x) => LINE_SPLIT.test(x))) add("handcsv", i);
    else if (!CSV_QUOTE_DOUBLING.test(l) && isRowWriter(i)) add("handcsv", i);
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

/** The sibling repo the `../aidream/...` ALLOW entries point into. CI has no such checkout. */
const SIBLING_PREFIX = "../aidream/";
export const siblingPresent = (): boolean => existsSync(join(REPO_ROOT, "..", "aidream"));

/**
 * ALLOW entries whose path no longer exists — a dead exemption silently covers whatever lands there next.
 * When the sibling root is absent the `../aidream/` entries cannot be checked: they are skipped HERE and
 * named by `unmeasuredAllows` (never silent); local paths are always checked.
 */
export function staleAllows(
  allow: Record<Rule, string[]> = ALLOW,
  exists = (p: string) => existsSync(join(REPO_ROOT, p)),
  sibling: boolean = siblingPresent(),
): string[] {
  const out: string[] = [];
  for (const r of RULES) for (const a of allow[r]) {
    if (!sibling && a.startsWith(SIBLING_PREFIX)) continue;
    if (!exists(a.replace(/\/$/, ""))) out.push(`${r}: ${a}`);
  }
  return out;
}

/** `../aidream/` ALLOW entries that could not be stale-checked because the sibling root is absent. */
export function unmeasuredAllows(allow: Record<Rule, string[]> = ALLOW, sibling: boolean = siblingPresent()): string[] {
  if (sibling) return [];
  const out: string[] = [];
  for (const r of RULES) for (const a of allow[r]) if (a.startsWith(SIBLING_PREFIX)) out.push(`${r}: ${a}`);
  return out;
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
    { rule: "registries", file: "features/x/Foo.ts", src: "const store: Record<string, Fn> = {};\nexport function registerThing(k: string, f: Fn) { store[k] = f; }\n", red: true, what: "object Record store filled by register*" },
    { rule: "registries", file: "features/x/Foo.ts", src: "const store = {} as Record<string, Fn>;\nexport const registerThing = (k: string, f: Fn) => { store[k] = f; };\n", red: true, what: "`{} as Record` store filled by register*" },
    { rule: "registries", file: "features/x/Foo.ts", src: "const deps: Partial<Deps> = {};\nexport function registerDeps(d: Partial<Deps>) { Object.assign(deps, d); }\n", red: true, what: "Object.assign-filled typed store beside register*" },
    { rule: "registries", file: "features/x/thing-registry.ts", src: "const registry = new Map<string, Definition>();\nexport function registerThing(k: string, d: Definition) { registry.set(k, d); }\n", red: true, what: "any Map in a *registry* file beside register*" },
    { rule: "registries", file: "features/x/Foo.ts", src: "const LABELS: Record<string, string> = {};\nLABELS.a = 'x';\n", red: false, what: "object constant with no register*" },
    { rule: "registries", file: "features/x/Foo.ts", src: "const opts = {};\nexport function registerThing() { use(opts); }\n", red: false, what: "untyped `{}` never filled by key" },
    { rule: "handcsv", file: "features/x/Foo.ts", src: "function readCsv(input: string) {\n  const lines = input.split('\\n');\n  const headers = lines[0].split(',');\n}\n", red: true, what: "split('\\n') then split(',') csv reader" },
    { rule: "handcsv", file: "features/x/Foo.ts", src: "const kind = 'tsv';\nconst rows = text.split(/\\r?\\n/)\n  .filter(Boolean)\n  .map((line) => line.split('\\t'));\n", red: true, what: "split(/\\r?\\n/) then split('\\t') tsv reader" },
    { rule: "handcsv", file: "features/x/Foo.ts", src: "const mime = 'text/csv';\nconst rows = text.split(\"\\n\").map((l) => l.split(delimiter));\n", red: true, what: "split(delimiter) reader" },
    { rule: "handcsv", file: "features/x/Foo.ts", src: "const tags = text.split('\\n').map((l) => l.split(','));\n", red: false, what: "line+comma split with no csv context" },
    { rule: "handcsv", file: "features/x/Foo.ts", src: "const exts = '.csv,.tsv'.split(',');\n", red: false, what: "comma split with no line split near" },
    { rule: "doorbypass", file: "components/agent-copy/AlchemyHost.tsx", src: "await applySurfaceWrite(t, v);\n", red: true, what: "agent-copy beyond the one door file is NOT exempt" },
    { rule: "doorbypass", file: "components/agent-copy/alchemy-door.ts", src: "await applySurfaceWrite(t, v);\n", red: false, what: "the one write door file" },
  ];
  let bad = 0;
  for (const lib of ["html-to-image", "jszip", "pptxgenjs", "file-saver", "docx", "pdf-lib", "dom-to-image-more"]) {
    const src = `const m = await import("${lib}");\n`;
    const red = scanSource("features/x/Foo.ts", src).some((h) => h.rule === "formatlibs");
    console.log(`[self-test] formatlibs ${lib}: ${red ? "RED" : "NOT RED"} ${red ? "ok" : "FAIL"}`);
    if (!red) bad++;
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
  // AP-2 fifth check: the row/line STRUCTURE is a delimited writer/reader with no csv/tsv word near,
  // planted in each fixed site's OLD shape; the negatives keep plain list joins out.
  extra.push(
    { rule: "handcsv", file: "features/google-workspace/X.tsx", src: "const values = sheetValues.split(\"\\n\").map((row) => row.split(\"\\t\"));\n", red: true, what: "Google sheet read: split lines then split tabs (no tsv word)" },
    { rule: "handcsv", file: "features/google-workspace/X.tsx", src: "setSheetValues(\n  outcome.result.values.map((row) => row.join(\"\\t\")).join(\"\\n\"),\n);\n", red: true, what: "Google sheet write: rows.map(join tab).join newline" },
    { rule: "handcsv", file: "features/rag/X.tsx", src: "const lines = header.length ? [header.join(\"\\t\")] : [];\nfor (const row of rows) {\n  lines.push((row.cells.length ? row.cells : [row.fallback]).join(\"\\t\"));\n}\nreturn lines.join(\"\\n\");\n", red: true, what: "RAG table group: tab rows pushed then joined by newline" },
    { rule: "handcsv", file: "features/page-extraction/X.ts", src: "return toMatrix(columns, rows)\n  .map((row) =>\n    row.map((c) => c.replace(/\\t/g, \" \")).join(\"\\t\"),\n  )\n  .join(\"\\n\");\n", red: true, what: "page-extraction TSV: lossy collapse then tab join" },
    { rule: "handcsv", file: "features/legal/X.tsx", src: "  return [\n    String(index + 1),\n    name,\n  ].join(\"\\t\");\n}\nconst lines = rows.map((row, idx) => rowToTsv(row, idx));\nreturn [TSV_HEADER.join(\"\\t\"), ...lines].join(\"\\n\");\n", red: true, what: "a tab row helper, rows joined by newline" },
    { rule: "handcsv", file: "features/x/Foo.ts", src: "const body = rows\n  .map((r) => r.join(\",\"))\n  .join(\"\\n\");\n", red: true, what: "comma rows joined by a line break" },
    { rule: "handcsv", file: "features/x/Foo.ts", src: "const label = items.map((x) => x.name).join(\", \");\n", red: false, what: "a label list joined by ', '" },
    { rule: "handcsv", file: "features/x/Foo.ts", src: "const q = ids.map((id) => encodeURIComponent(id)).join(\",\");\n", red: false, what: "ids joined by ',' with no line join (a query param)" },
    { rule: "handcsv", file: "features/x/Foo.ts", src: "const t = [\n  `orgs=${r.orgs.map((o) => o.name).join(\",\") || \"none\"}`,\n  `id=${r.id}`,\n].join(\"\\n\");\n", red: false, what: "a comma list inside a template, lines joined by newline (a label)" },
    { rule: "handcsv", file: "features/x/Foo.ts", src: "const t = lines.map((l) => l.trim()).join(\"\\n\");\n", red: false, what: "lines trimmed and joined by newline" },
    { rule: "handcsv", file: "features/x/Foo.ts", src: "return toDelimited([header, ...rows], { format: \"tsv\" });\n", red: false, what: "the one writer" },
    { rule: "handcsv", file: "features/legal/X.tsx", src: "const row = [a.label, a.value, a.note].join(\"\\t\");\nnavigator.x(row);\n", red: true, what: "an array-literal tab row (no map, no line join)" },
    { rule: "handcsv", file: "features/legal/X.tsx", src: "const row = `${a.label}\\t${a.value}`;\n", red: true, what: "a template-literal tab row" },
    { rule: "handcsv", file: "features/legal/X.tsx", src: "const row = toDelimited([[a.label, a.value]], { format: \"tsv\" });\n", red: false, what: "the kit writer for a one-row array" },
    { rule: "formatlibs", file: "components/mardown-display/blocks/x/Block.tsx", src: "const { captureBlockElement } = await import(\"@ai-matrx/print/pdf\");\n", red: true, what: "a markdown block loading print/pdf directly" },
    { rule: "formatlibs", file: "features/x/Review.tsx", src: "import { captureElementsToPDF } from \"@ai-matrx/print/pdf\";\n", red: true, what: "a static print/pdf import in app code" },
    { rule: "formatlibs", file: "features/x/Review.tsx", src: "import type { PdfPage } from \"@ai-matrx/print/pdf\";\n", red: false, what: "a type-only print/pdf import" },
    { rule: "formatlibs", file: "features/x/Review.tsx", src: "const { captureDocumentPdf } = await import(\"@ai-matrx/alchemy/operate/capture\");\n", red: false, what: "the alchemy capture door" },
    { rule: "clipboard", file: "components/dialogs/clipboard-fallback/ClipboardFallbackDialog.tsx", src: "await navigator.clipboard.writeText(url);\n", red: true, what: "the clipboard-fallback dialog is NOT exempt (it retries through kit copyText)" },
    { rule: "registries", file: "features/x/provider.ts", src: "function store() {\n  let s = g[key];\n  if (!s) {\n    s = { actions: new Map(), listeners: new Set() };\n    g[key] = s;\n  }\n  return s;\n}\nexport function registerAction(a: A) { store().actions.set(a.id, a); }\n", red: true, what: "a CLOSURE store `{ actions: new Map() }` filled by registerAction" },
    { rule: "registries", file: "features/x/Foo.ts", src: "function watch() {\n  const watching = new Map<string, () => void>();\n}\nexport function registerThing() {}\n", red: false, what: "a closure Map of bare callbacks (cancel handles) beside register*" },
    { rule: "registries", file: "features/x/Foo.ts", src: "function f() {\n  const byId = new Map(ITEMS.map((c) => [c.id, c]));\n}\nexport function registerThing() {}\n", red: false, what: "a closure lookup Map built from a list beside register*" },
  );
  {
    const dead = staleAllows({ ...ALLOW, registries: [...ALLOW.registries, "features/gone/nope.ts"] });
    const live = staleAllows();
    const ok = dead.length === 1 && live.length === 0;
    const noSib = staleAllows({ ...ALLOW, registries: [...ALLOW.registries, "features/gone/nope.ts"] }, undefined, false);
    const unm = unmeasuredAllows(ALLOW, false);
    const sibOk = noSib.length === 1 && noSib[0].endsWith("features/gone/nope.ts") && unm.length > 0 && unm.every((u) => u.includes("../aidream/")) && unmeasuredAllows(ALLOW, true).length === 0;
    console.log(`[self-test] absent sibling: a dead LOCAL path still RED (${noSib.length}), ../aidream entries UNMEASURED (${unm.length}), not red ${sibOk ? "ok" : "FAIL"}`);
    if (!sibOk) bad++;
    console.log(`[self-test] stale ALLOW: a dead path -> ${dead.length === 1 ? "RED" : "not red"}, the live list -> ${live.length === 0 ? "GREEN" : live.join("; ")} ${ok ? "ok" : "FAIL"}`);
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
  const unmeasured = unmeasuredAllows();
  if (unmeasured.length) {
    console.log(`alchemy-doors: UNMEASURED ${unmeasured.length} ../aidream/ ALLOW entr${unmeasured.length === 1 ? "y" : "ies"} (no sibling ../aidream checkout, stale check skipped): ${unmeasured.map((u) => u.split(": ")[1]).join(", ")}`);
  }
  const stale = staleAllows();
  if (stale.length) {
    for (const e of stale) console.error(`stale ALLOW entry (path does not exist — delete it): ${e}`);
    console.error(`alchemy-doors: FAIL ${stale.length} stale ALLOW entr${stale.length === 1 ? "y" : "ies"}`);
    return 1;
  }
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
