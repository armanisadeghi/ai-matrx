/**
 * THE GRAMMAR MAY NOT DRIFT FROM THE SERVER.
 *
 * `features/content-ir/directives/grammar.ts` is the client mirror of aidream's
 * `matrx_graph/content_ir/directives.py`. A mirror that is only hand-kept is a
 * second source of truth waiting to disagree — and a disagreement here means a
 * server-minted directive routes to nothing and the user sees raw JSON, which
 * is precisely the break this campaign closed.
 *
 * So the mirror is asserted against `docs/protocol/kind_directive_grammar.
 * generated.json`, which `pnpm sync:directive-grammar` extracts from the Python
 * source. This test runs OFFLINE (it reads the committed artifact), so the
 * parity claim is measurable in CI, which has no aidream checkout;
 * `pnpm check:directive-grammar` is the other half, verifying the artifact
 * against the live Python.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  CAPABILITY_BY_CLASS,
  CLASSES,
  DIRECTIVE_VERSION,
  IN_CONTENT_CLASSES,
  RESERVED_PREFIX,
  SLUG_PREFIX,
  buildDirectiveSlug,
  buildKindDirective,
  directiveSlugOf,
  executesAtOutputRoot,
  isKindDirective,
  isReservedDirectiveSlug,
  parseDirectiveSlug,
  resolvesInContent,
} from "@/features/content-ir/directives/grammar";

interface GrammarMirror {
  reserved_prefix: string;
  directive_version: number;
  classes: string[];
  capability_by_class: Record<string, string>;
  in_content_classes: string[];
}

const mirror = JSON.parse(
  readFileSync(
    join(process.cwd(), "docs/protocol/kind_directive_grammar.generated.json"),
    "utf8",
  ),
) as GrammarMirror;

describe("Kind Directives grammar — parity with the aidream source", () => {
  it("mirrors the reserved prefix and version", () => {
    expect(RESERVED_PREFIX).toBe(mirror.reserved_prefix);
    expect(DIRECTIVE_VERSION).toBe(mirror.directive_version);
    expect(SLUG_PREFIX).toBe(`${mirror.reserved_prefix}${mirror.directive_version}_`);
  });

  it("mirrors the CLOSED class vocabulary, in order", () => {
    expect([...CLASSES]).toEqual(mirror.classes);
  });

  it("mirrors class → capability exactly (no extra, no missing)", () => {
    expect(CAPABILITY_BY_CLASS).toEqual(mirror.capability_by_class);
  });

  it("mirrors the in-content class set", () => {
    expect([...IN_CONTENT_CLASSES].sort()).toEqual(mirror.in_content_classes);
  });
});

describe("the slug grammar", () => {
  it("round-trips build → parse", () => {
    for (const cls of CLASSES) {
      const slug = buildDirectiveSlug(cls, "task");
      const parsed = parseDirectiveSlug(slug);
      expect(parsed).not.toBeNull();
      expect(parsed!.directiveClass).toBe(cls);
      expect(parsed!.noun).toBe("task");
      expect(parsed!.version).toBe(DIRECTIVE_VERSION);
      expect(parsed!.capability).toBe(CAPABILITY_BY_CLASS[cls]);
    }
  });

  it("is unambiguous when the noun itself contains a class word", () => {
    const parsed = parseDirectiveSlug("directive_v1_reference_create_task");
    expect(parsed?.directiveClass).toBe("reference");
    expect(parsed?.noun).toBe("create_task");
  });

  it("refuses to mint a slug it could not parse back", () => {
    expect(() => buildDirectiveSlug("mutate", "task")).toThrow(/CLOSED/);
    expect(() => buildDirectiveSlug("create", "Task")).toThrow(/noun/);
    expect(() => buildDirectiveSlug("create", "")).toThrow(/noun/);
    expect(() => buildDirectiveSlug("create", "1task")).toThrow(/noun/);
  });

  it("treats a MALFORMED directive slug as reserved but unparseable", () => {
    // The pairing every protocol caller relies on: reserved says "this is ours",
    // parse says "and it is well-formed". A near-miss must never slip through as
    // an ordinary kind.
    expect(isReservedDirectiveSlug("directive_v1_mutate_task")).toBe(true);
    expect(parseDirectiveSlug("directive_v1_mutate_task")).toBeNull();
    expect(isReservedDirectiveSlug("flashcard_set")).toBe(false);
    expect(parseDirectiveSlug("flashcard_set")).toBeNull();
  });
});

describe("the position law", () => {
  it("executes only side-effect classes at an output root", () => {
    for (const cls of CLASSES) {
      expect(executesAtOutputRoot(cls)).toBe(
        CAPABILITY_BY_CLASS[cls] === "side_effect",
      );
    }
  });

  it("resolves only reference + secret inside content", () => {
    for (const cls of CLASSES) {
      expect(resolvesInContent(cls)).toBe(
        mirror.in_content_classes.includes(cls),
      );
    }
    // A side effect sitting in prose is NEVER executed.
    expect(resolvesInContent("create")).toBe(false);
    expect(executesAtOutputRoot("reference")).toBe(false);
  });
});

describe("the two-key shell", () => {
  it("puts __kind FIRST — the streaming detector types by the first key alone", () => {
    const shell = buildKindDirective("directive_v1_reference_note", [{ id: "x" }]);
    expect(Object.keys(shell)).toEqual(["__kind", "items"]);
    expect(JSON.stringify(shell).startsWith('{"__kind":')).toBe(true);
  });

  it("detects a directive by its reserved __kind, and nothing else", () => {
    expect(isKindDirective({ __kind: "directive_v1_reference_note", items: [] })).toBe(true);
    expect(directiveSlugOf({ __kind: "directive_v1_reference_note" })).toBe(
      "directive_v1_reference_note",
    );
    // An ordinary kind instance is NOT a directive.
    expect(isKindDirective({ __kind: "flashcard_set", cards: [] })).toBe(false);
    // The retired sentinel alone never makes something a directive here — that
    // is the shim's job, at decode, and nowhere else.
    expect(isKindDirective({ matrx_version: 1, kind: "reference", type: "note" })).toBe(false);
    expect(isKindDirective(null)).toBe(false);
    expect(isKindDirective([{ __kind: "directive_v1_reference_note" }])).toBe(false);
  });
});
