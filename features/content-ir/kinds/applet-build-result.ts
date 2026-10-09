/**
 * `applet_build_result` → AppletBuildResultBlock bridge (+ compiled definition).
 *
 * What the Applet builder answers (`applets.build` / `applets.fix`, aidream
 * `aidream/kinds/applets.py`): the whole Applet record plus one plain note.
 * Before this kind the answer streamed as bare JSON and the floating "Building
 * your app" window drew it through the generic viewer — raw source code and a
 * "fields did not apply" line, in front of a non-technical person.
 *
 * PARTIAL-READY: a provisional value (closed JSON with whatever has arrived)
 * routes to the SAME component, which shows the app's name and its pages as
 * they arrive. A value with no applet name and no pages declines: the loading
 * skeleton stays up for that frame, and a complete answer with no app at all
 * falls to the readable fallback.
 *
 * The client still saves through `coerceBuildAnswer`
 * (features/applets-host/builder/build-applet.ts), which ignores `__kind`.
 */

import type { KindDefinition, KindSchema } from "@ai-matrx/content-ir";
import { KIND_KEY } from "@ai-matrx/content-ir";

import type { AppletBuildResult } from "./generated/kinds.generated";
import type { PartialKind } from "./kind-payload";
import { isRecord, makeCompleteEnvelopeBridge } from "./legacy-bridge-utils";
import { joinBlocks } from "./kind-markdown-utils";

export const APPLET_BUILD_RESULT_KIND = "applet_build_result";
/** The render key `kind-route` sets `block.type` to (SHAPE_BLOCK_DISPATCH). */
export const APPLET_BUILD_RESULT_BLOCK_TYPE = "applet_build_result";

export const appletBuildResultKindSchema: KindSchema = {
  kind: APPLET_BUILD_RESULT_KIND,
  fields: {
    applet: {
      type: "inline_object",
      open: true,
      fields: {},
      required: true,
      description:
        "The whole Applet record: name, slug, description, entry, files, pages, sources, mandates.",
    },
    note: {
      type: "string",
      required: true,
      description: "One plain sentence saying what was built or changed.",
    },
  },
};

type PartialPayload = Omit<PartialKind<AppletBuildResult>, "__kind">;

export interface AppletBuildPage {
  path: string;
  title: string;
}

export interface AppletBuildSource {
  alias: string;
  /** "table" for one of her tables, "entity" for a platform record type, "new" for a table "Use it" makes. */
  type: "table" | "entity" | "new";
  /** The entity token when `type` is "entity". */
  entity: string | null;
  /** The table's id when `type` is "table" — the card reads its real name and organization by it. */
  tableId: string | null;
  /** A new table's name and its column labels (applets 0.9.0 `new_table`). */
  newTable?: { name: string; fields: string[] };
}

/** What `AppletBuildResultBlock` receives — read once, here. */
export interface AppletBuildResultData extends Record<string, unknown> {
  name: string;
  description: string;
  pages: AppletBuildPage[];
  sources: AppletBuildSource[];
  jobs: string[];
  files: { name: string; source: string }[];
  note: string;
  /** Envelope status, not a payload field. */
  isComplete: boolean;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function list(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

export function readAppletBuildResult(
  value: Record<string, unknown>,
  isComplete: boolean,
): AppletBuildResultData {
  const payload = value as PartialPayload & Record<string, unknown>;
  const applet = isRecord(payload.applet) ? payload.applet : {};
  return {
    name: text(applet.name),
    description: text(applet.description),
    pages: list(applet.pages).flatMap((p) =>
      typeof p.path === "string" ? [{ path: p.path, title: text(p.title) || p.path }] : [],
    ),
    sources: list(applet.sources).flatMap((s) =>
      typeof s.alias === "string"
        ? [
            isRecord(s.new_table) && text(s.new_table.name).trim()
              ? {
                  alias: s.alias,
                  type: "new" as const,
                  entity: null,
                  tableId: null,
                  newTable: {
                    name: text(s.new_table.name) || s.alias,
                    fields: list(s.new_table.fields).map((f) => text(f.label) || text(f.key)).filter(Boolean),
                  },
                }
              : typeof s.entity === "string" && s.entity
                ? { alias: s.alias, type: "entity" as const, entity: s.entity, tableId: null }
                : { alias: s.alias, type: "table" as const, entity: null, tableId: text(s.table_id) || null },
          ]
        : [],
    ),
    jobs: list(applet.mandates).flatMap((m) =>
      typeof m.alias === "string" ? [m.alias] : [],
    ),
    files: list(applet.files).flatMap((f) =>
      typeof f.name === "string" ? [{ name: f.name, source: text(f.source) }] : [],
    ),
    note: text(payload.note),
    isComplete,
  };
}

export const appletBuildResultServerDataFromEnvelope =
  makeCompleteEnvelopeBridge<AppletBuildResultData>(
    APPLET_BUILD_RESULT_KIND,
    (value, envelope) => {
      const data = readAppletBuildResult(value, envelope.root.status === "complete");
      // Nothing to show yet (or an answer with no app at all): decline — the skeleton stays up
      // while streaming, and a complete answer with no app falls to the readable fallback.
      // A description or a file being written IS something to show: a provider that orders keys
      // alphabetically (Gemini) sends name and pages LAST, after every file, and declining until
      // then held the window on a spinner for the whole build (lane P, 2026-10-07).
      if (!data.name && data.pages.length === 0 && !data.description && data.files.length === 0) return undefined;
      return data;
    },
    { provisional: true },
  );

export function appletBuildResultMarkdownFromValue(
  value: Record<string, unknown>,
): string {
  const data = readAppletBuildResult(value, true);
  void KIND_KEY;
  return joinBlocks([
    `# ${data.name || "Your Applet"}`,
    data.description || null,
    data.pages.length
      ? `## Pages\n\n${data.pages.map((p) => `- ${p.title} (${p.path})`).join("\n")}`
      : null,
    data.sources.length
      ? `## Built on\n\n${data.sources.map((s) => `- ${s.alias}`).join("\n")}`
      : null,
    data.note || null,
  ]);
}

export const APPLET_BUILD_RESULT_KIND_DEFINITIONS: KindDefinition[] = [
  {
    kind: APPLET_BUILD_RESULT_KIND,
    schemaSource: "system",
    tier: "eager",
    legacyBlockType: APPLET_BUILD_RESULT_BLOCK_TYPE,
    toLegacyServerData: appletBuildResultServerDataFromEnvelope,
    toMarkdown: appletBuildResultMarkdownFromValue,
    persistence: { persistStructured: true },
    partialReady: true,
    schema: appletBuildResultKindSchema,
  },
];

/**
 * A file the builder is writing, said in her words — never a code file name (audit9 B4: the window read
 * "Writing entry.tsx · 7 lines so far"). A file named after one of the Applet's pages is that page; the
 * entry file is the main screen; anything else is said from its name ("BookCard.tsx" → "the book card").
 */
export function plainFileLabel(fileName: string, pages: readonly AppletBuildPage[]): string {
  const base = (fileName.split("/").pop() ?? fileName).replace(/\.[a-z0-9]+$/i, "");
  const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const key = squash(base);
  if (/\.css$/i.test(fileName)) return "the look";
  if (["entry", "index", "app", "main", "root"].includes(key)) return "the main screen";
  const page = pages.find((p) => {
    const t = squash(p.title);
    return t.length > 0 && (key === t || key === `${t}page` || key === `${t}view` || key === `${t}screen`);
  });
  if (page) return `the ${page.title} page`;
  if (/^use[A-Z]/.test(base) || ["lib", "utils", "util", "helpers", "data", "api", "types", "store"].includes(key)) return "the parts behind the pages";
  const words = base
    .replace(/[-_]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim()
    .toLowerCase();
  return words ? `the ${words}` : "the Applet";
}
