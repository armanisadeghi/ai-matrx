/**
 * transcript kind — the fleet-standard three legs:
 *
 * 1. STRUCTURAL: the migration's exact examples (fixtures/transcript-fixture)
 *    validate against the CONVERTER-emitted strict schema via the REAL dual
 *    gate ajv path (`validateStructuralLeg`), and the storage transform
 *    round-trips the schemas the migration seeds into kind_definition.data +
 *    kind_edge.
 * 2. BRIDGE: `toLegacyServerData` derives serverData the REAL component
 *    contract accepts — `transcriptParsedFromValue` is TYPED as the
 *    component's own `ParsedTranscript`, so acceptance is compile-checked,
 *    and the values are asserted here.
 * 3. STRATEGY: `transcript_legacy_text` converts a REAL ```transcript fence
 *    body (the live palette-template shape) by WRAPPING the real
 *    `parseTranscript` — segment parity with the parser is asserted, framing
 *    tolerance included.
 */

import { parseTranscript } from "@/components/mardown-display/blocks/transcripts/transcript-parser";
import type { ParsedTranscript } from "@/components/mardown-display/blocks/transcripts/transcript-parser";
import { kindSchemaToJsonSchema } from "../convert/kind-to-json-schema";
import { envelopeFromCompleteValue } from "../core/normalize";
import type { KindSchema } from "../core/kind-schema.types";
import {
  runKindDualGate,
  validateStructuralLeg,
} from "../registry/kind-dual-gate";
import {
  kindSchemaToStorage,
  storageToKindSchema,
} from "../registry/kind-storage-transform";
import {
  TRANSCRIPT_KIND_DEFINITIONS,
  transcriptMarkdownFromValue,
  transcriptParsedFromValue,
  transcriptServerDataFromEnvelope,
} from "../kinds/transcript";
import { transcriptLegacyTextToKindValue } from "../surfaces/transcript-legacy-text";
import {
  TRANSCRIPT_CANONICAL_EXAMPLE,
  TRANSCRIPT_REAL_FENCE_BODY,
  TRANSCRIPT_REAL_FENCE_REGION,
  TRANSCRIPT_SIMPLE_EXAMPLE,
  TRANSCRIPT_TITLED_FENCE_BODY,
} from "./fixtures/transcript-fixture";

const definitionFor = (kind: string) =>
  TRANSCRIPT_KIND_DEFINITIONS.find((def) => def.kind === kind);

const resolveSchema = (kind: string): KindSchema | undefined =>
  definitionFor(kind)?.schema ?? undefined;

const transcriptDef = definitionFor("transcript");
const segmentDef = definitionFor("transcript_segment");

function emittedJsonSchema(): unknown {
  const exported = kindSchemaToJsonSchema("transcript", resolveSchema, {
    strict: true,
    injectKind: false,
  });
  if (!exported) throw new Error("transcript schema failed to export");
  expect(exported.unresolved).toEqual([]);
  return exported.schema;
}

describe("transcript kind — structural leg (the migration's exact examples)", () => {
  it("declares both kinds with the expected facets", () => {
    expect(transcriptDef).toBeDefined();
    expect(segmentDef).toBeDefined();
    expect(transcriptDef?.legacyBlockType).toBe("transcript");
    expect(transcriptDef?.toLegacyServerData).toBe(
      transcriptServerDataFromEnvelope,
    );
    expect(transcriptDef?.artifact?.canvasType).toBe("transcript");
  });

  it("canonical + simple examples pass the REAL dual-gate ajv leg", () => {
    const schema = emittedJsonSchema();
    expect(
      validateStructuralLeg(TRANSCRIPT_CANONICAL_EXAMPLE, schema),
    ).toEqual({ ok: true });
    expect(validateStructuralLeg(TRANSCRIPT_SIMPLE_EXAMPLE, schema)).toEqual({
      ok: true,
    });
  });

  it("a segment without text FAILS the structural leg (negative control)", () => {
    const schema = emittedJsonSchema();
    const broken = {
      __kind: "transcript",
      segments: [{ __kind: "transcript_segment", speaker: "Speaker A" }],
    };
    expect(validateStructuralLeg(broken, schema).ok).toBe(false);
  });

  it("the FULL dual gate passes for both examples (structural + render)", () => {
    const schema = emittedJsonSchema();
    for (const sample of [
      TRANSCRIPT_CANONICAL_EXAMPLE,
      TRANSCRIPT_SIMPLE_EXAMPLE,
    ]) {
      const result = runKindDualGate({
        kind: "transcript",
        sample,
        emittedJsonSchema: schema,
        definition: transcriptDef ?? null,
      });
      expect(result.structural).toEqual({ ok: true });
      expect(result.render.ok).toBe(true);
      expect(result.isActive).toBe(true);
    }
  });

  it("storage transform round-trips both schemas (data[] + edges = the migration rows)", () => {
    for (const def of TRANSCRIPT_KIND_DEFINITIONS) {
      if (!def.schema) throw new Error(`${def.kind} has no schema`);
      const storage = kindSchemaToStorage(def.schema);
      expect(storageToKindSchema(def.kind, storage)).toEqual(def.schema);
    }
    // The one kind_edge the migration seeds.
    const rootStorage = kindSchemaToStorage(
      resolveSchema("transcript") as KindSchema,
    );
    expect(rootStorage.edges).toEqual([
      { fieldPath: "segments", childKind: "transcript_segment", position: 0 },
    ]);
  });
});

describe("transcript kind — legacy bridge (serverData = the component's ParsedTranscript)", () => {
  it("derives the typed ParsedTranscript the real viewer consumes", () => {
    const serverData = transcriptServerDataFromEnvelope(
      envelopeFromCompleteValue(TRANSCRIPT_CANONICAL_EXAMPLE, "transcript"),
    );
    expect(serverData).toBeDefined();

    // Compile-checked acceptance: transcriptParsedFromValue returns the REAL
    // component type; the bridge output is that same object shape.
    const typed: ParsedTranscript | undefined = transcriptParsedFromValue(
      TRANSCRIPT_CANONICAL_EXAMPLE as Record<string, unknown>,
    );
    expect(typed).toBeDefined();
    if (!typed || !serverData) throw new Error("unreachable");

    expect(serverData.title).toBe("Quarterly Planning Meeting");
    expect(serverData.subtitle).toBe("Q3 Kickoff");
    const segments = serverData.segments;
    if (!Array.isArray(segments)) throw new Error("segments not an array");
    expect(segments).toHaveLength(4);
    expect(segments[0]).toEqual({
      id: "segment-0",
      timecode: "00:05",
      seconds: 5,
      speaker: "Speaker A",
      text: "Hello and welcome to the meeting.",
    });
    // The speakerless sound annotation survives as speakerless text.
    expect(segments[2]).toEqual({
      id: "segment-2",
      timecode: "00:20",
      seconds: 20,
      text: "[Sound of paper shuffling]",
    });
    expect(segments[3]).toMatchObject({ isHighlighted: true });
  });

  it("fills the parser-guaranteed defaults the kind leaves optional", () => {
    const serverData = transcriptServerDataFromEnvelope(
      envelopeFromCompleteValue(TRANSCRIPT_SIMPLE_EXAMPLE, "transcript"),
    );
    expect(serverData).toBeDefined();
    if (!serverData) throw new Error("unreachable");
    expect(serverData.title).toBeNull();
    expect(serverData.subtitle).toBeNull();
    const segments = serverData.segments;
    if (!Array.isArray(segments)) throw new Error("segments not an array");
    // ids synthesized with the parser's own convention.
    expect(segments.map((s) => (s as { id: string }).id)).toEqual([
      "segment-0",
      "segment-1",
    ]);
  });

  it("declines streaming envelopes (complete-only family law) and empty sets", () => {
    const complete = envelopeFromCompleteValue(
      TRANSCRIPT_CANONICAL_EXAMPLE,
      "transcript",
    );
    const streaming = {
      ...complete,
      root: { ...complete.root, status: "streaming" as const },
    };
    expect(transcriptServerDataFromEnvelope(streaming)).toBeUndefined();

    expect(
      transcriptServerDataFromEnvelope(
        envelopeFromCompleteValue(
          { __kind: "transcript", segments: [] },
          "transcript",
        ),
      ),
    ).toBeUndefined();
  });

  it("toMarkdown renders headers + timecoded speaker lines, losing nothing", () => {
    const markdown = transcriptMarkdownFromValue({
      ...TRANSCRIPT_CANONICAL_EXAMPLE,
      custom_note: "captured off the record",
    } as Record<string, unknown>);
    expect(markdown).toContain("# Quarterly Planning Meeting");
    expect(markdown).toContain("## Q3 Kickoff");
    expect(markdown).toContain(
      "- **[00:05] Speaker A:** Hello and welcome to the meeting.",
    );
    expect(markdown).toContain("- **[00:20]** [Sound of paper shuffling]");
    expect(markdown).toContain("## Additional details");
    expect(markdown).toContain("custom_note");
  });
});

describe("transcript_legacy_text strategy — wraps the REAL fence parser", () => {
  it("converts a REAL palette-template fence body to the canonical value", () => {
    const value = transcriptLegacyTextToKindValue(TRANSCRIPT_REAL_FENCE_BODY);
    expect(value).not.toBeNull();
    if (!value) throw new Error("unreachable");

    expect(value.__kind).toBe("transcript");
    // Boilerplate "**Audio Transcription**" label is NOT a title.
    expect(value.title).toBeUndefined();
    expect(value.subtitle).toBeUndefined();

    const segments = value.segments;
    if (!Array.isArray(segments)) throw new Error("segments not an array");
    expect(segments).toHaveLength(6);
    expect(segments[0]).toEqual({
      __kind: "transcript_segment",
      id: "segment-0",
      timecode: "0:05",
      seconds: 5,
      text: "Hello and welcome to the meeting.",
      speaker: "Speaker A",
    });
    // The speakerless sound annotation line.
    expect(segments[4]).toEqual({
      __kind: "transcript_segment",
      id: "segment-4",
      timecode: "0:52",
      seconds: 52,
      text: "[Sound of paper shuffling]",
    });
    expect(segments[5]).toMatchObject({
      timecode: "1:00",
      seconds: 60,
      speaker: "Speaker A",
    });
  });

  it("NEVER re-implements the grammar — segment parity with parseTranscript", () => {
    const value = transcriptLegacyTextToKindValue(TRANSCRIPT_REAL_FENCE_BODY);
    if (!value || !Array.isArray(value.segments)) throw new Error("no value");

    const parsed = parseTranscript(TRANSCRIPT_REAL_FENCE_BODY);
    const stripped = value.segments.map((segment) =>
      Object.fromEntries(
        Object.entries(segment as Record<string, unknown>).filter(
          ([key]) => key !== "__kind",
        ),
      ),
    );
    // The parser's segments carry `speaker: undefined` explicitly on
    // speakerless lines; the canonical value omits the key. Compare on the
    // parser's own normalized JSON form (undefined keys dropped).
    expect(stripped).toEqual(JSON.parse(JSON.stringify(parsed.segments)));
  });

  it("accepts BOTH host framings (full fenced region ≡ inner body)", () => {
    expect(transcriptLegacyTextToKindValue(TRANSCRIPT_REAL_FENCE_REGION)).toEqual(
      transcriptLegacyTextToKindValue(TRANSCRIPT_REAL_FENCE_BODY),
    );
  });

  it("carries real headers + time-range sections through", () => {
    const value = transcriptLegacyTextToKindValue(TRANSCRIPT_TITLED_FENCE_BODY);
    expect(value).not.toBeNull();
    if (!value) throw new Error("unreachable");
    expect(value.title).toBe("Budget Review Meeting");
    expect(value.subtitle).toBe("Finance Team Q4 Summary");
    const segments = value.segments;
    if (!Array.isArray(segments)) throw new Error("segments not an array");
    expect(segments).toHaveLength(2);
    expect(segments[0]).toMatchObject({
      timecode: "00:00 - 02:30",
      seconds: 0,
      text: "Introduction and opening remarks.",
    });
  });

  it("strategy output validates against the emitted schema (fence ≡ __kind JSON convergence)", () => {
    const schema = emittedJsonSchema();
    for (const body of [
      TRANSCRIPT_REAL_FENCE_BODY,
      TRANSCRIPT_TITLED_FENCE_BODY,
    ]) {
      const value = transcriptLegacyTextToKindValue(body);
      expect(value).not.toBeNull();
      expect(validateStructuralLeg(value, schema)).toEqual({ ok: true });
    }
  });

  it("an empty region fails LOUDLY (null, legacy rendering stands)", () => {
    expect(transcriptLegacyTextToKindValue("```transcript\n\n```")).toBeNull();
    expect(transcriptLegacyTextToKindValue("")).toBeNull();
  });

  it("prose with no time marker parses as the parser's orphan segment (component parity)", () => {
    // The REAL parser anchors marker-less prose at 00:00 — the strategy must
    // mirror that, not invent a stricter grammar.
    const value = transcriptLegacyTextToKindValue(
      "```transcript\nJust prose without any marker.\n```",
    );
    expect(value).not.toBeNull();
    if (!value) throw new Error("unreachable");
    expect(value.segments).toEqual([
      {
        __kind: "transcript_segment",
        id: "segment-0",
        timecode: "00:00",
        seconds: 0,
        text: "Just prose without any marker.",
      },
    ]);
  });
});
