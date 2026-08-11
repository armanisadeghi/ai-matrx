/**
 * `page_brief` — the STREAMING bridge contract.
 *
 * The whole reason this kind exists is that the content plan's "Draft brief"
 * run renders LIVE in the floating run window. The behavior pinned here:
 *
 *  1. MID-STREAM with NOTHING but the discriminator: serverData is defined
 *     (empty brief, null angle) — the component mounts and says "waiting",
 *     it never falls through to a JSON code block.
 *  2. MID-STREAM: the kernel's scalar-array granularity — a `string[]`
 *     commits when its `]` arrives; fields after it are still absent, and
 *     that is a renderable state, not an error.
 *  3. COMPLETE: every field maps, isComplete=true.
 *  4. The markdown facet is human-readable prose, never a JSON dump, and
 *     keeps unknown keys under "Additional details".
 */

import { ParseSession } from "../session/parse-session";
import type { KindSchema } from "../core/kind-schema.types";
import type { SchemaResolver } from "../core/kind-parser";
import {
  PAGE_BRIEF_KIND_SCHEMAS,
  pageBriefMarkdownFromValue,
  pageBriefServerDataFromEnvelope,
} from "../kinds/page-brief";

const resolver: SchemaResolver = {
  get: (kind: string): KindSchema | undefined =>
    PAGE_BRIEF_KIND_SCHEMAS.find((schema) => schema.kind === kind),
  request: () => {},
};

const BRIEF_VALUE = {
  __kind: "page_brief",
  angle: "The only page that prices the decision instead of describing it.",
  brief: [
    "Open with the single decision the reader is trying to make.",
    "Explain the three financing routes side by side, with real numbers.",
    "Close with what to bring to a first consultation.",
  ],
  must_not_cover: ["Procedure recovery timelines — that is /recovery."],
  concerns: ["Pricing claims need a dated source before publishing."],
  suggested_word_count: 1400,
};

const BRIEF_JSON = JSON.stringify(BRIEF_VALUE);

describe("page_brief — streaming bridge", () => {
  it("MID-STREAM: the bare discriminator already yields renderable data", () => {
    const session = new ParseSession({ identity: "pb-empty", schemas: resolver });
    session.write('{"__kind":"page_brief","angle":');

    const serverData = pageBriefServerDataFromEnvelope(session.buildEnvelope());
    expect(serverData).toBeDefined();
    expect(serverData?.isComplete).toBe(false);
    expect(serverData?.brief).toEqual([]);
    expect(serverData?.angle).toBeNull();
    expect(serverData?.suggestedWordCount).toBeNull();
    session.dispose();
  });

  it("MID-STREAM: the brief lands whole at array close, later fields still absent", () => {
    const session = new ParseSession({ identity: "pb-partial", schemas: resolver });
    // Cut just after the brief array closes, before `must_not_cover` exists.
    // This pins the kernel's SCALAR-ARRAY granularity: a string[] commits as
    // ONE value when its `]` arrives (only child-kind arrays stream per
    // element). If that ever changes, this expectation is where you learn it.
    const cut = BRIEF_JSON.indexOf('],"must_not_cover"') + 1;
    session.write(BRIEF_JSON.slice(0, cut));

    const serverData = pageBriefServerDataFromEnvelope(session.buildEnvelope());
    expect(serverData?.isComplete).toBe(false);
    expect(serverData?.angle).toBe(BRIEF_VALUE.angle);
    expect(serverData?.brief).toEqual(BRIEF_VALUE.brief);
    // Fields that have not arrived read as empty, never as a thrown parse.
    expect(serverData?.mustNotCover).toEqual([]);
    expect(serverData?.concerns).toEqual([]);
    expect(serverData?.suggestedWordCount).toBeNull();
    session.dispose();
  });

  it("COMPLETE: every field maps, isComplete=true", () => {
    const session = new ParseSession({ identity: "pb-complete", schemas: resolver });
    session.write(BRIEF_JSON);
    session.end();

    const serverData = pageBriefServerDataFromEnvelope(session.buildEnvelope());
    expect(serverData).toMatchObject({
      angle: BRIEF_VALUE.angle,
      mustNotCover: BRIEF_VALUE.must_not_cover,
      concerns: BRIEF_VALUE.concerns,
      suggestedWordCount: 1400,
      isComplete: true,
    });
    expect(serverData?.brief).toEqual(BRIEF_VALUE.brief);
    session.dispose();
  });

  it("ignores a foreign root kind", () => {
    const session = new ParseSession({ identity: "pb-foreign", schemas: resolver });
    session.write('{"__kind":"task_list","tasks":[]}');
    session.end();
    expect(pageBriefServerDataFromEnvelope(session.buildEnvelope())).toBeUndefined();
    session.dispose();
  });
});

describe("page_brief — markdown facet", () => {
  it("renders prose sections and keeps unknown keys", () => {
    const markdown = pageBriefMarkdownFromValue({
      ...BRIEF_VALUE,
      reviewer_note: "check the pricing source",
    });
    expect(markdown).toContain("# Page brief");
    expect(markdown).toContain(`**Angle:** ${BRIEF_VALUE.angle}`);
    expect(markdown).toContain("**Suggested length:** 1400 words");
    expect(markdown).toContain("## Must not cover");
    expect(markdown).toContain("## Concerns");
    expect(markdown).toContain("Additional details");
    expect(markdown).toContain("check the pricing source");
    expect(markdown).not.toContain("__kind");
  });
});
