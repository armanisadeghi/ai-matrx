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
            isRecord(s.new_table)
              ? {
                  alias: s.alias,
                  type: "new" as const,
                  entity: null,
                  newTable: {
                    name: text(s.new_table.name) || s.alias,
                    fields: list(s.new_table.fields).map((f) => text(f.label) || text(f.key)).filter(Boolean),
                  },
                }
              : typeof s.entity === "string" && s.entity
                ? { alias: s.alias, type: "entity" as const, entity: s.entity }
                : { alias: s.alias, type: "table" as const, entity: null },
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
      if (!data.name && data.pages.length === 0) return undefined;
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
    `# ${data.name || "Your app"}`,
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
