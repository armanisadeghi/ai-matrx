// features/applets-host/builder/check-build-answer.ts — the builder's refusal checks, run on every fresh answer.
//
// A refusal saves nothing and goes to the automatic fix round with its reason, so each check must be
// PRECISE: it names a real defect a person would hit, never a valid Applet (lane AL, 2026-10-08). The code
// checks read the syntax tree (./applet-code-checks.ts), which is why this module is loaded on demand by
// the builder, beside the frame's import check — never in its first chunk.
import { checkAppletSources } from "@ai-matrx/applets/platform";
import type { AppletSource } from "@ai-matrx/applets";

import { browserDialogs, deadButtons, fieldsWithNoInput, handBuiltTables, misspelledChoices, parseProblem } from "./applet-code-checks";
import { BuildRefused, dateFieldsAsText, literalNewlineAttributes, newTableGaps, type BuildAnswer, type BuilderFile } from "./build-applet";

const READS_SOURCE = /\buse(?:Rows|Row|Columns)\(\s*["'`]([^"'`$]+)["'`]/g;
/** A hand-built prose box in an Applet: the HTML element or the controls' Textarea. */
const BARE_WRITING_BOX = /<(textarea|Textarea)\b/g;
const RUNS_JOB = /\buseJob\(\s*["'`]([^"'`$]+)["'`]/g;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function namesIn(files: BuilderFile[], pattern: RegExp): Set<string> {
  const out = new Set<string>();
  for (const f of files) for (const m of f.source.matchAll(pattern)) if (m[1]) out.add(m[1]);
  return out;
}

/**
 * NOTHING THE BUILDER WROTE IS DROPPED SILENTLY. A source or job the coercion could not
 * read, a table source without its ids, or code that reads an alias the record never
 * declares refuses the whole answer — the app would otherwise open on
 * `no data source called "tasks"` (2026-10-07). Run on a fresh builder answer only.
 */
export function checkBuildAnswer(
  raw: unknown,
  answer: BuildAnswer,
  context: {
    organizationId?: string;
    tables?: readonly { table_id: string; organization_id: string; name: string }[];
    /**
     * `appletImportProblems` from `@ai-matrx/applets/frame` (imports checked against the modules' REAL exports —
     * `useNavigate` from "@ai-matrx/applets/react" published a page that crashed, 2026-10-08). Passed in, loaded
     * on demand by the builder, so this file keeps the compiler out of the builder's first chunk.
     */
    importProblems?: (files: Readonly<Record<string, string>>) => string[];
  } = {},
): BuildAnswer {
  const { applet } = answer;
  const rawApplet = isRecord(raw) && isRecord(raw.applet) ? raw.applet : {};
  const problems: string[] = [];
  const rawSources = Array.isArray(rawApplet.sources) ? rawApplet.sources.length : 0;
  if (rawSources !== applet.sources.length) problems.push(`${rawSources - applet.sources.length} of its sources had no alias`);
  const rawMandates = Array.isArray(rawApplet.mandates) ? rawApplet.mandates.length : 0;
  if (rawMandates !== applet.mandates.length) problems.push(`${rawMandates - applet.mandates.length} of its jobs had no alias or key`);
  // ONE check for every source (applets 0.9.1): a bound table must be the Applet organization's own (an
  // Applet in one organization bound to another's table opens on data its members cannot read — audit
  // 2026-10-07), and a table the app asks for is checked whole — a missing choice list, a link to nowhere,
  // or a "new" table that repeats one she has is said before anything is saved.
  if (context.organizationId) {
    problems.push(...checkAppletSources(applet.sources as AppletSource[], { organizationId: context.organizationId, ...(context.tables ? { existing: context.tables } : {}) }));
  } else {
    for (const s of applet.sources) {
      if ("table_id" in s && (!s.table_id || !s.organization_id)) problems.push(`source "${s.alias}" names no table_id and organization_id`);
    }
  }
  const declared = new Set(applet.sources.map((s) => s.alias));
  for (const alias of namesIn(applet.files, READS_SOURCE)) {
    if (!declared.has(alias)) problems.push(`the code reads "${alias}" but sources declares no "${alias}"`);
  }
  const jobs = new Set(applet.mandates.map((m) => m.alias));
  for (const alias of namesIn(applet.files, RUNS_JOB)) {
    if (!jobs.has(alias)) problems.push(`the code runs job "${alias}" but mandates declares no "${alias}"`);
  }
  if (context.importProblems) problems.push(...context.importProblems(Object.fromEntries(applet.files.map((f) => [f.name, f.source]))));
  // Every box a person writes words in is <WritingBox> (mic + read-aloud) — never a bare textarea.
  for (const f of applet.files) {
    const bare = [...new Set([...f.source.matchAll(BARE_WRITING_BOX)].map((m) => m[1]))];
    for (const tag of bare) {
      problems.push(
        `${f.name} has a bare <${tag}> where a person writes — use <WritingBox value={text} onValueChange={setText} label="…" /> from "@ai-matrx/applets/react" (it carries the microphone and read-aloud)`,
      );
    }
  }
  for (const f of applet.files) {
    const unreadable = parseProblem(f);
    if (unreadable) {
      problems.push(unreadable);
      continue;
    }
    for (const value of fieldsWithNoInput(f)) {
      problems.push(`${f.name} saves "${value}" but no input ever sets it — every field she asked for needs its own input, labelled for that field alone`);
    }
    for (const name of browserDialogs(f)) {
      problems.push(`${f.name} calls the browser's ${name}() — ask with confirmAction({ title, description, confirmLabel, variant: "destructive" }) from "@ai-matrx/applets/react"; never window.confirm / alert / prompt`);
    }
    for (const attr of literalNewlineAttributes(f)) {
      problems.push(`${f.name} has ${attr}="…\\n…", which shows a literal "\\n" — keep it one line of plain text`);
    }
    for (const label of deadButtons(f)) {
      problems.push(`${f.name} has a button "${label}" that does nothing — give it an onClick (or type="submit" inside its form)`);
    }
    if (handBuiltTables(f)) {
      problems.push(`${f.name} draws its own <table> of rows — use <RecordTable source rows columns /> from "@ai-matrx/applets/react", whose every header sorts and filters (a link by its labels)`);
    }
  }
  for (const key of dateFieldsAsText(applet)) {
    problems.push(`the date "${key}" is a plain text box — use <RecordField source field="${key}" … /> (or <DateField>) so she picks a date`);
  }
  for (const m of misspelledChoices(applet)) {
    problems.push(`the code writes "${m.wrote}" but the choice in "${m.alias}.${m.key}" is "${m.choice}" — read the choices from useColumns("${m.alias}") and use them as they are spelled`);
  }
  problems.push(...newTableGaps(applet));
  if (problems.length > 0) {
    throw new BuildRefused(`Not saved: ${problems.join("; ")}.`, applet);
  }
  return answer;
}
