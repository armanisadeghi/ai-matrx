/**
 * Pure TEXT-level extraction of the shape doctor's code-derived inputs —
 * detector tokens from the FROZEN literals (stream-block-accumulator /
 * content-splitter-core) and compiled render paths (system-kinds bridges,
 * artifact-type-registry `kinds:` facades).
 *
 * Why text, not imports: system-kinds.ts TDZ-crashes when the module graph is
 * entered from its side (require cycle with kind-registry.ts), and the
 * artifact registry lazy-imports React components — so BOTH the CLI
 * (scripts/shape/check-shapes.ts) and the server-side admin board
 * (features/content-ir/admin/shape-doctor-server.ts) scan file TEXT instead.
 * This module is the ONE implementation of that scan: pure string-in /
 * tokens-out, no fs, no supabase — the caller reads the files.
 */

import type { DoctorDetectorToken } from "./shape-doctor";

/** A frozen literal the extraction depends on vanished/renamed — the census
 * is blind for that literal. The caller escalates (CLI: red finding). */
export interface DetectorExtractFailure {
  literal: string;
  file: string;
}

/**
 * THE ONE place the shape doctor's package source files are named (repo-relative to the
 * matrx-frontend root). Every reader — the CLI census (check-shapes), the admin
 * board (shape-doctor-server), the crosswalk generator and the frozen-literal
 * doctrine scan — resolves through this map, so a move is ONE edit here and a
 * missing file is reported by NAME (`missingShapeSourceMessage`), never a
 * bare ENOENT. All three now live in aidream's shared packages (the splitter and
 * block-dispatch moved into `@ai-matrx/rich-content` on 2026-10-06; the
 * splitter literals sit in content-splitter-core.ts), so every path reaches
 * the sibling checkout.
 */
export const SHAPE_SOURCE_FILES = {
  accumulator: {
    path: "../aidream/apps/shared/chat/src/agents/redux/execution-system/utils/stream-block-accumulator.ts",
    label: "stream-block-accumulator.ts",
  },
  splitter: {
    path: "../aidream/apps/shared/rich-content/src/display/markdown-classification/processors/utils/content-splitter-core.ts",
    label: "content-splitter-core.ts",
  },
  /** The engine's half of the dispatch tables (generic entries). */
  blockDispatch: {
    path: "../aidream/apps/shared/rich-content/src/display/chat-markdown/block-registry/block-dispatch.tsx",
    label: "block-dispatch.tsx",
  },
  /** This app's half — domain kinds registered via `registerBlockDispatch`. */
  domainBlockDispatch: {
    path: "features/rich-content-host/domain-block-dispatch.tsx",
    label: "domain-block-dispatch.tsx",
  },
} as const;

/** Both dispatch halves, in the order `resolveBlockDispatch` consults them. */
export const DISPATCH_SOURCE_KEYS = ["domainBlockDispatch", "blockDispatch"] as const;

export type ShapeSourceKey = keyof typeof SHAPE_SOURCE_FILES;

/** The named failure for a shape source that is not where the map says. */
export function missingShapeSourceMessage(key: ShapeSourceKey, absPath: string): string {
  const { path } = SHAPE_SOURCE_FILES[key];
  return `shape source "${key}" not found at ${path} (resolved ${absPath}) — it moved or the aidream sibling checkout is absent; update SHAPE_SOURCE_FILES in features/content-ir/registry/shape-doctor-extract.ts`;
}

const ACC = SHAPE_SOURCE_FILES.accumulator.label;
const SPL = SHAPE_SOURCE_FILES.splitter.label;

export interface DetectorSourceTexts {
  /** SHAPE_SOURCE_FILES.accumulator */
  accumulatorText: string;
  /** SHAPE_SOURCE_FILES.splitter */
  splitterText: string;
}

export interface DetectorExtraction {
  tokens: DoctorDetectorToken[];
  failures: DetectorExtractFailure[];
}

function extractQuotedStrings(blob: string): string[] {
  return [...blob.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

/** Detector tokens from the two frozen detector literals' source text. */
export function extractDetectorTokensFromTexts({
  accumulatorText,
  splitterText,
}: DetectorSourceTexts): DetectorExtraction {
  const tokens: DoctorDetectorToken[] = [];
  const failures: DetectorExtractFailure[] = [];

  const setLiteral = (
    text: string,
    name: string,
    file: string,
    surfaceType: string,
  ): void => {
    const match = new RegExp(`const ${name} = new Set\\(\\[([\\s\\S]*?)\\]\\)`).exec(
      text,
    );
    const items = match ? extractQuotedStrings(match[1]) : [];
    if (items.length === 0) {
      failures.push({ literal: name, file });
      return;
    }
    for (const token of items) {
      tokens.push({ token, surfaceType, source: `${file}#${name}` });
    }
  };

  setLiteral(
    accumulatorText,
    "SIMPLE_XML_TAGS",
    ACC,
    "xml_tag",
  );
  setLiteral(
    accumulatorText,
    "ATTR_XML_TAGS",
    ACC,
    "xml_tag",
  );

  const attrBlocks = /const ATTRIBUTE_XML_BLOCKS = \[([\s\S]*?)\]/.exec(splitterText);
  const attrItems = attrBlocks ? extractQuotedStrings(attrBlocks[1]) : [];
  if (attrItems.length === 0) {
    failures.push({ literal: "ATTRIBUTE_XML_BLOCKS", file: SPL });
  } else {
    for (const token of attrItems) {
      tokens.push({
        token,
        surfaceType: "xml_tag",
        source: `${SPL}#ATTRIBUTE_XML_BLOCKS`,
      });
    }
  }

  const jsonPatterns = /const JSON_BLOCK_PATTERNS = \{([\s\S]*?)\n\} as const;/.exec(
    splitterText,
  );
  const jsonKeys = jsonPatterns
    ? [...jsonPatterns[1].matchAll(/^\s{2}([a-z_][a-z0-9_]*):\s*\{/gm)].map((m) => m[1])
    : [];
  if (jsonKeys.length === 0) {
    failures.push({ literal: "JSON_BLOCK_PATTERNS", file: SPL });
  } else {
    for (const token of jsonKeys) {
      tokens.push({
        token,
        surfaceType: "json_root",
        source: `${SPL}#JSON_BLOCK_PATTERNS`,
      });
    }
  }

  return { tokens, failures };
}

/** The hosts' full detection-token surface, keyed by kind_surface.surface_type. */
export interface HostSurfaceTokens {
  xml_tag: Set<string>;
  fence_lang: Set<string>;
  json_root_key: Set<string>;
}

export interface HostSurfaceExtraction {
  tokens: HostSurfaceTokens;
  failures: DetectorExtractFailure[];
}

/**
 * Every token the detection HOSTS can actually recognize, per surface type —
 * the reconciliation counterpart of the generated `kind_surface` bootstrap
 * (Wave 1 C2): a registered surface whose token appears in NO host literal is
 * undetectable, i.e. registry↔host drift. Sources:
 *   xml_tag       — accumulator SIMPLE_XML_TAGS + ATTR_XML_TAGS, splitter
 *                   XML_TAG_BLOCKS tags + ATTRIBUTE_XML_BLOCKS
 *   fence_lang    — splitter SPECIAL_CODE_LANGUAGES + CODE_LANGUAGE_ALIASES
 *                   keys (the accumulator imports the same literals)
 *   json_root_key — splitter JSON_BLOCK_PATTERNS `rootKey:` values
 */
export function extractHostSurfaceTokensFromTexts({
  accumulatorText,
  splitterText,
}: DetectorSourceTexts): HostSurfaceExtraction {
  const failures: DetectorExtractFailure[] = [];
  const tokens: HostSurfaceTokens = {
    xml_tag: new Set<string>(),
    fence_lang: new Set<string>(),
    json_root_key: new Set<string>(),
  };

  const collectSet = (
    text: string,
    name: string,
    file: string,
    into: Set<string>,
    // Set(...) literals and plain arrays both close with `]`.
    pattern: RegExp,
  ): void => {
    const match = pattern.exec(text);
    const items = match ? extractQuotedStrings(match[1]) : [];
    if (items.length === 0) {
      failures.push({ literal: name, file });
      return;
    }
    for (const item of items) into.add(item.toLowerCase());
  };

  collectSet(
    accumulatorText,
    "SIMPLE_XML_TAGS",
    ACC,
    tokens.xml_tag,
    /const SIMPLE_XML_TAGS = new Set\(\[([\s\S]*?)\]\)/,
  );
  collectSet(
    accumulatorText,
    "ATTR_XML_TAGS",
    ACC,
    tokens.xml_tag,
    /const ATTR_XML_TAGS = new Set\(\[([\s\S]*?)\]\)/,
  );
  collectSet(
    splitterText,
    "ATTRIBUTE_XML_BLOCKS",
    SPL,
    tokens.xml_tag,
    /const ATTRIBUTE_XML_BLOCKS = \[([\s\S]*?)\]/,
  );

  // Splitter XML_TAG_BLOCKS values are "<tag>" strings — strip the brackets.
  const xmlTagBlocks = /const XML_TAG_BLOCKS = \{([\s\S]*?)\} as const;/.exec(splitterText);
  const tagStrings = xmlTagBlocks ? extractQuotedStrings(xmlTagBlocks[1]) : [];
  if (tagStrings.length === 0) {
    failures.push({ literal: "XML_TAG_BLOCKS", file: SPL });
  } else {
    for (const raw of tagStrings) {
      const m = /^<([a-z0-9_-]+)>$/i.exec(raw);
      if (m) tokens.xml_tag.add(m[1].toLowerCase());
    }
  }

  collectSet(
    splitterText,
    "SPECIAL_CODE_LANGUAGES",
    SPL,
    tokens.fence_lang,
    /const SPECIAL_CODE_LANGUAGES = \[([\s\S]*?)\]/,
  );
  const aliases = /const CODE_LANGUAGE_ALIASES: Record<string, string> = \{([\s\S]*?)\}/.exec(
    splitterText,
  );
  const aliasKeys = aliases
    ? [...aliases[1].matchAll(/^\s*([a-z0-9_]+):/gm)].map((m) => m[1])
    : [];
  if (aliasKeys.length === 0) {
    failures.push({ literal: "CODE_LANGUAGE_ALIASES", file: SPL });
  } else {
    for (const key of aliasKeys) tokens.fence_lang.add(key.toLowerCase());
  }

  const jsonPatterns = /const JSON_BLOCK_PATTERNS = \{([\s\S]*?)\n\} as const;/.exec(splitterText);
  const rootKeys = jsonPatterns
    ? [...jsonPatterns[1].matchAll(/rootKey: "([^"]+)"/g)].map((m) => m[1])
    : [];
  if (rootKeys.length === 0) {
    failures.push({ literal: "JSON_BLOCK_PATTERNS.rootKey", file: SPL });
  } else {
    for (const key of rootKeys) tokens.json_root_key.add(key.toLowerCase());
  }

  return { tokens, failures };
}

/**
 * Kinds with a compiled bridge/component facet, from system-kinds.ts TEXT:
 * each definition object opens with `kind: "<slug>"`; a `legacyBlockType:` /
 * `component:` facet after it (and before the next def's `kind:`) marks a
 * compiled render path. Nested `schema.kind` re-states the SAME slug, so
 * "nearest preceding kind:" stays correct.
 */
export function compiledKindSlugsFromText(systemKindsText: string): string[] {
  const slugs = new Set<string>();
  const kindPositions: Array<{ index: number; slug: string }> = [];
  for (const m of systemKindsText.matchAll(/kind: "([a-z0-9_]+)"/g)) {
    kindPositions.push({ index: m.index ?? 0, slug: m[1] });
  }
  for (const m of systemKindsText.matchAll(/\n\s+(?:legacyBlockType|component): /g)) {
    const at = m.index ?? 0;
    const owner = [...kindPositions].reverse().find((k) => k.index < at);
    if (owner) slugs.add(owner.slug);
  }
  return [...slugs].sort();
}

/**
 * Compiled per-kind `loadingComponent` declarations, from kind-definition
 * source TEXT (system-kinds.ts + each kinds/*.ts). Same nearest-preceding-
 * `kind:` attribution as `compiledKindSlugsFromText`. Later files never
 * overwrite an earlier attribution for the same kind (definitions are unique
 * per kind in practice; first wins keeps the result order-stable).
 */
export function compiledLoadingSlugsFromTexts(
  texts: readonly string[],
): Map<string, string> {
  const bySlug = new Map<string, string>();
  for (const text of texts) {
    const kindPositions: Array<{ index: number; slug: string }> = [];
    for (const m of text.matchAll(/kind: "([a-z0-9_]+)"/g)) {
      kindPositions.push({ index: m.index ?? 0, slug: m[1] });
    }
    for (const m of text.matchAll(/\n\s+loadingComponent: "([a-z0-9-]+)"/g)) {
      const at = m.index ?? 0;
      const owner = [...kindPositions].reverse().find((k) => k.index < at);
      if (owner && !bySlug.has(owner.slug)) bySlug.set(owner.slug, m[1]);
    }
  }
  return bySlug;
}

/** Kinds referenced by artifact-type-registry `kinds: ["…"]` facade entries. */
export function artifactKindSlugsFromText(registryText: string): string[] {
  const slugs = new Set<string>();
  for (const match of registryText.matchAll(/kinds:\s*\[([^\]]*)\]/g)) {
    for (const slug of extractQuotedStrings(match[1])) slugs.add(slug);
  }
  return [...slugs].sort();
}

// ─── Render-block dispatch keys (the render leg's LAST mile) ────────────────

/**
 * The four classification tables. The dispatch is SPLIT across two files since
 * the rich-content switch (2026-10-06): the engine's generic half
 * (SHAPE_SOURCE_FILES.blockDispatch) and this app's domain half
 * (SHAPE_SOURCE_FILES.domainBlockDispatch, registered at load through
 * `registerBlockDispatch`). Both declare all four tables; each opens
 * `const <NAME> = {` and closes `\n} satisfies` at column 0.
 */
const DISPATCH_TABLE_NAMES = [
  "PROTOCOL_BLOCK_DISPATCH",
  "SCALAR_GENERIC_BLOCK_DISPATCH",
  "SHAPE_BLOCK_DISPATCH",
  "OPAQUE_BLOCK_DISPATCH",
] as const;

export interface DispatchKeyExtraction {
  keys: string[];
  failures: DetectorExtractFailure[];
}

/** One dispatch half's source text and the file it was read from. */
export interface DispatchSourceText {
  text: string;
  file: string;
}

/**
 * Every block type `resolveBlockDispatch` can answer, from the TEXT of every
 * dispatch half — the code side of the dangling-`component_key` check.
 *
 * Why it matters: a `content_ir.kind_component` row naming a key these tables
 * do NOT hold is invisible at runtime for every kind carrying a
 * `legacyBlockType` facet, because `applyIrKindRoute` routes those through the
 * compiled bridge regardless of the row. The block still renders, and the
 * registry keeps advertising a component that does not exist (proven
 * 2026-08-23 by sabotaging `rating`'s row: nothing moved).
 *
 * Text, not import, for the reason the rest of this module is: the dispatch
 * table pulls the whole lazy React component tree behind it.
 *
 * A table missing from ANY half is a failure (a rename there would silently
 * drop that half's keys). A table empty in one half is fine (the engine's
 * OPAQUE table is empty by design); a table empty across EVERY half is a
 * failure. Computed keys (`[DB_KIND_COMPONENT_KEY]:`) are resolved through
 * `computedKeyValues` — the caller passes the imported constants, so a rename
 * cannot silently shrink the key set. An unresolved identifier is a FAILURE,
 * never a dropped key.
 */
export function extractDispatchKeysFromTexts(
  sources: readonly DispatchSourceText[],
  computedKeyValues: Readonly<Record<string, string>>,
): DispatchKeyExtraction {
  const keys = new Set<string>();
  const failures: DetectorExtractFailure[] = [];
  if (sources.length === 0) {
    failures.push({ literal: "BLOCK_DISPATCH (no source texts)", file: "-" });
    return { keys: [], failures };
  }

  for (const name of DISPATCH_TABLE_NAMES) {
    let found = 0;
    for (const { text, file } of sources) {
      const start = text.indexOf(`const ${name} = {`);
      const end = start < 0 ? -1 : text.indexOf("\n} satisfies", start);
      if (start < 0 || end < 0) {
        failures.push({ literal: name, file });
        continue;
      }
      const body = text.slice(start, end);
      // Top-level entries only: exactly two spaces of indent (entry bodies are
      // indented four or more).
      for (const m of body.matchAll(/\n {2}"?([A-Za-z_][A-Za-z0-9_]*)"?:/g)) {
        keys.add(m[1]);
        found += 1;
      }
      for (const m of body.matchAll(/\n {2}\[([A-Za-z_][A-Za-z0-9_]*)\]:/g)) {
        const value = computedKeyValues[m[1]];
        if (!value) {
          failures.push({ literal: `${name}[${m[1]}]`, file });
          continue;
        }
        keys.add(value);
        found += 1;
      }
    }
    if (found === 0) {
      failures.push({ literal: name, file: sources.map((s) => s.file).join(" + ") });
    }
  }

  return { keys: [...keys].sort(), failures };
}
