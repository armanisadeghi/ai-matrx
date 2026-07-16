/**
 * Pure TEXT-level extraction of the shape doctor's code-derived inputs —
 * detector tokens from the FROZEN literals (stream-block-accumulator /
 * content-splitter-v2) and compiled render paths (system-kinds bridges,
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

export interface DetectorSourceTexts {
  /** features/agents/redux/execution-system/utils/stream-block-accumulator.ts */
  accumulatorText: string;
  /** components/mardown-display/markdown-classification/processors/utils/content-splitter-v2.ts */
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
    "stream-block-accumulator.ts",
    "xml_tag",
  );
  setLiteral(
    accumulatorText,
    "ATTR_XML_TAGS",
    "stream-block-accumulator.ts",
    "xml_tag",
  );

  const attrBlocks = /const ATTRIBUTE_XML_BLOCKS = \[([\s\S]*?)\]/.exec(splitterText);
  const attrItems = attrBlocks ? extractQuotedStrings(attrBlocks[1]) : [];
  if (attrItems.length === 0) {
    failures.push({ literal: "ATTRIBUTE_XML_BLOCKS", file: "content-splitter-v2.ts" });
  } else {
    for (const token of attrItems) {
      tokens.push({
        token,
        surfaceType: "xml_tag",
        source: "content-splitter-v2.ts#ATTRIBUTE_XML_BLOCKS",
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
    failures.push({ literal: "JSON_BLOCK_PATTERNS", file: "content-splitter-v2.ts" });
  } else {
    for (const token of jsonKeys) {
      tokens.push({
        token,
        surfaceType: "json_root",
        source: "content-splitter-v2.ts#JSON_BLOCK_PATTERNS",
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
    "stream-block-accumulator.ts",
    tokens.xml_tag,
    /const SIMPLE_XML_TAGS = new Set\(\[([\s\S]*?)\]\)/,
  );
  collectSet(
    accumulatorText,
    "ATTR_XML_TAGS",
    "stream-block-accumulator.ts",
    tokens.xml_tag,
    /const ATTR_XML_TAGS = new Set\(\[([\s\S]*?)\]\)/,
  );
  collectSet(
    splitterText,
    "ATTRIBUTE_XML_BLOCKS",
    "content-splitter-v2.ts",
    tokens.xml_tag,
    /const ATTRIBUTE_XML_BLOCKS = \[([\s\S]*?)\]/,
  );

  // Splitter XML_TAG_BLOCKS values are "<tag>" strings — strip the brackets.
  const xmlTagBlocks = /const XML_TAG_BLOCKS = \{([\s\S]*?)\} as const;/.exec(splitterText);
  const tagStrings = xmlTagBlocks ? extractQuotedStrings(xmlTagBlocks[1]) : [];
  if (tagStrings.length === 0) {
    failures.push({ literal: "XML_TAG_BLOCKS", file: "content-splitter-v2.ts" });
  } else {
    for (const raw of tagStrings) {
      const m = /^<([a-z0-9_-]+)>$/i.exec(raw);
      if (m) tokens.xml_tag.add(m[1].toLowerCase());
    }
  }

  collectSet(
    splitterText,
    "SPECIAL_CODE_LANGUAGES",
    "content-splitter-v2.ts",
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
    failures.push({ literal: "CODE_LANGUAGE_ALIASES", file: "content-splitter-v2.ts" });
  } else {
    for (const key of aliasKeys) tokens.fence_lang.add(key.toLowerCase());
  }

  const jsonPatterns = /const JSON_BLOCK_PATTERNS = \{([\s\S]*?)\n\} as const;/.exec(splitterText);
  const rootKeys = jsonPatterns
    ? [...jsonPatterns[1].matchAll(/rootKey: "([^"]+)"/g)].map((m) => m[1])
    : [];
  if (rootKeys.length === 0) {
    failures.push({ literal: "JSON_BLOCK_PATTERNS.rootKey", file: "content-splitter-v2.ts" });
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

/** Kinds referenced by artifact-type-registry `kinds: ["…"]` facade entries. */
export function artifactKindSlugsFromText(registryText: string): string[] {
  const slugs = new Set<string>();
  for (const match of registryText.matchAll(/kinds:\s*\[([^\]]*)\]/g)) {
    for (const slug of extractQuotedStrings(match[1])) slugs.add(slug);
  }
  return [...slugs].sort();
}
