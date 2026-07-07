/**
 * THE ALL-SURFACES CONVERGENCE GATE (Shape System) — the "prove it's real,
 * not unit-green" proof.
 *
 * Every gold-mine kind has a per-kind unit test that drives its strategy
 * function in isolation. This suite is different: it drives EACH of the 14
 * compiled `content_ir.kind_surface` entries (system-surfaces.ts) through the
 * REAL host pipeline — the same `StreamBlockAccumulator` live traffic flows
 * through and the same `splitContentIntoBlocksV2` a DB reload flows through —
 * from that surface's NATIVE wire text (XML tag body or fenced body, never
 * pre-shaped JSON), and asserts all of them converge on `metadata.__ir`:
 *
 *   (a) STREAMING — the accumulator's finalized block for the region carries a
 *       complete envelope with the expected root kind, `status==='complete'`,
 *       `kindState==='resolved'`, and the correct wire discriminator
 *       (`xml`/tag or `fence`/language, the language NORMALIZED — ```mmd →
 *       "mermaid").
 *   (b) STATIC — the splitter one-shot path converges to the SAME kind +
 *       discriminator, and the whole envelope is byte-identical to the
 *       streaming path's (stream ≡ static — the fingerprint hashes the
 *       canonical value, so both host framings meet at one envelope).
 *
 * Plus three cross-cutting adversarial gates:
 *   - a malformed body for a representative surface FAILS OPEN — no envelope,
 *     the block survives intact, nothing throws, and the fallback is loud.
 *   - routing parity for 3 representative kinds: the surface envelope, run
 *     through `applyIrKindRoute`, routes to the same component type + derives
 *     the same serverData as a direct `__kind` JSON arrival of the same value
 *     (one pipeline, two surfaces).
 *
 * If ANY surface does NOT converge (null envelope, wrong kind, missing
 * discriminator), the corresponding case FAILS LOUDLY here — that is a real
 * strategy/registration bug, never papered over.
 *
 * Wire samples are the exact bodies the per-kind unit tests prove converge, so
 * a failure here is a HOST/registration regression, not a bad sample.
 */

import type { RenderBlockPayload } from "@/types/python-generated/stream-events";
import { StreamBlockAccumulator } from "@/features/agents/redux/execution-system/utils/stream-block-accumulator";
import { splitContentIntoBlocksV2 } from "@/components/mardown-display/markdown-classification/processors/utils/content-splitter-v2";
import { applyIrKindRoute, type IrRoutableBlock } from "../react/kind-route";
import { normalizeJsonRegion, isCanonicalBlockIR } from "../core/normalize";
import { kindRegistry } from "../registry/kind-registry";
import {
  IR_ENVELOPE_KEY,
  type CanonicalBlockIR,
  type IrDiscriminator,
} from "../core/ir-types";
import { chunkText } from "./seeded-random";

// ───────────────────────────────────────────────────────────────────────────
// Wire-body samples — inner text only, verbatim from each kind's proven unit
// test. `wire()` frames them the way the real surface framing arrives.
// ───────────────────────────────────────────────────────────────────────────

/** flashcards (xml + fence) — the keystone Front/Back body. */
const FLASHCARDS_BODY = [
  "---",
  "",
  "Front: What is the capital of France?",
  "Back: Paris",
  "",
  "---",
  "",
  "Front: Name three primary colors",
  "Back:",
  "- Red",
  "- Blue",
  "- Yellow",
  "",
  "---",
].join("\n");

/** mermaid / mmd — DSL with frontmatter title (kind-mermaid-diagram.test.ts). */
const MERMAID_BODY = [
  "---",
  "title: Deploy Pipeline",
  "---",
  "flowchart LR",
  "  A[Commit] --> B[Build]",
  "  B --> C{Tests pass?}",
  "  C -- Yes --> D[Deploy]",
  '  C -- No --> E["Fix (rework)"]',
].join("\n");

/** tasks fence — sections, nesting, and the parser's real drop cases. */
const TASKS_BODY = [
  "## Sprint 12",
  "- [x] Ship the auth fix",
  "- [ ] **Write the postmortem**",
  "  - [x] Collect the timeline",
  "  - [ ] Draft the doc",
  "* [ ] Update the changelog",
  "- [X] Uppercase marker line",
  "- [ ]No space after checkbox",
  "- plain bullet without a checkbox",
  "# single-hash heading",
  "- [ ] Final review",
].join("\n");

/** resources xml — the render-block-resources skill grammar. */
const RESOURCES_BODY = [
  "### TypeScript Learning Path",
  "Everything you need to go from JavaScript to confident TypeScript.",
  "",
  "**Official Docs**",
  "- [TypeScript Handbook](https://www.typescriptlang.org/docs/) - The canonical reference [documentation] {beginner} *5*",
  "",
  "**Practice**",
  "- [Type Challenges](https://github.com/type-challenges/type-challenges) - Solve real type puzzles (20 hours) [tool] {advanced} *5* #free",
].join("\n");

/** progress_tracker xml. */
const PROGRESS_BODY = [
  "### Learning Progress",
  "",
  "**React Fundamentals** (80% complete)",
  "- [x] Components & JSX",
  "- [x] Props & State  ",
  "- [x] Event Handling",
  "- [ ] Lifecycle Methods",
  "- [ ] Hooks",
  "",
  "**Advanced Topics** (20% complete)",
  "- [x] Context API",
  "- [ ] Performance Optimization",
  "- [ ] Testing",
  "- [ ] Custom Hooks",
].join("\n");

/** timeline xml — periods, dated events, indented descriptions. */
const TIMELINE_BODY = [
  "### Product Launch Timeline",
  "A phased plan from kickoff to GA.",
  "",
  "**Phase 1: Foundation (Weeks 1-4)**",
  "- **Project kickoff** (Week 1) [Planning] completed",
  "  Align on scope and success metrics.",
  "- **Architecture spike** (Week 2) [Engineering] in progress",
  "  Prototype the streaming pipeline.",
  "",
  "**Phase 2: Build**",
  "- Feature complete (Week 8)",
  "- Beta release (Week 10) [Release]",
].join("\n");

/** structured_info fence — bold headings + asterisk bullets. */
const STRUCTURED_INFO_BODY = [
  "**Project: Atlas Migration**",
  "",
  "**Goal**",
  "* Move billing off the legacy monolith by Q3.",
  "* Zero customer-visible downtime.",
  "",
  "**Owners**",
  "* Backend: Priya",
  "* Frontend: Marco",
  "* QA: Dana",
  "",
  "**Open risks**",
  "* Data backfill window is tight.",
  "* Third-party webhook contract is unversioned.",
].join("\n");

/** transcript fence — timecoded lines with speakers + one annotation. */
const TRANSCRIPT_BODY = [
  "**Audio Transcription**",
  "",
  "[00:00:05] Speaker A: Hello and welcome to the meeting.",
  "[00:00:08] Speaker B: Thanks for having me.",
  "[00:00:30] Speaker B: And that's why the rollout slipped.",
  "[00:00:45] Speaker Unknown: Let's start with the first item.",
  "[00:00:52] [Sound of paper shuffling]",
  "[00:01:00] Speaker A: The quarterly results are looking positive.",
].join("\n");

/** troubleshooting xml — symptom/causes/solutions with nested command fences. */
const TROUBLESHOOTING_BODY = [
  "### API Connection Issues",
  "Common problems and fixes for API connectivity.",
  "",
  "**Symptom:** Timeout errors when calling the API",
  "",
  "**Possible Causes:**",
  "1. Network connectivity issues",
  "2. Server overload",
  "3. Invalid or expired credentials",
  "",
  "**Solutions:**",
  "1. **Check the network path**: Confirm the endpoint is reachable",
  "   - **Test with curl**: Hit the health endpoint directly (easy) (2 min)",
  "     ```",
  "     curl -X GET https://api.example.com/health",
  "     ```",
  "   - **Check DNS resolution**: Confirm the domain resolves (easy) (1 min)",
  "     ```",
  "     dig api.example.com",
  "     ```",
  "2. **Verify credentials**: Ensure the API key is valid and unexpired",
  "   - **Inspect the key**: Confirm it is active in the dashboard [API Keys](https://example.com/keys) (medium)",
  "",
  "**Related Issues:**",
  "- Slow response times",
  "- Authentication failures",
].join("\n");

/** cooking_recipe (xml + fence) — H3 title, yields/time, ingredients, steps. */
const RECIPE_BODY = [
  "### Classic Banana Bread",
  "**Yields:** 1 loaf (Serves 8)",
  "**Time:** 1 hour 15 minutes (15 minutes prep, 60 minutes baking)",
  "",
  "#### Ingredients:",
  "- 3 ripe bananas, mashed",
  "- 1/3 cup melted butter",
  "- 3/4 cup sugar",
  "- 1 large egg, beaten",
  "- 1 tsp vanilla extract",
  "- 1 tsp baking soda",
  "- 1 1/2 cups all-purpose flour",
  "",
  "#### Instructions:",
  "1. **Prep:** Preheat the oven to 175 C and butter a 9x5 inch loaf pan.",
  "2. **Mix wet:** Stir the mashed bananas into the melted butter, then mix in the sugar, egg, and vanilla.",
  "3. **Combine:** Sprinkle the baking soda over the mixture, then fold in the flour until just combined.",
  "4. **Bake:** Pour into the pan and bake for 60 minutes, until a toothpick comes out clean.",
  "5. **Cool:** Cool in the pan for 10 minutes, then turn out onto a wire rack.",
  "",
  "A drizzle of honey while warm makes it extra good.",
].join("\n");

/** research xml — overview/summary/introduction/findings/conclusion/methodology. */
const RESEARCH_BODY = [
  "# AI Code Assistants in Enterprise Development",
  "",
  "## Research Overview",
  "This report reviews field evidence on AI code assistants in enterprise teams.",
  "**Research Scope:** Enterprise deployments 2024-2026",
  "**Key Focus Areas:** Productivity, code quality, review load",
  "**Analysis Period:** 2024-2026",
  "",
  "## Executive Summary",
  "Adoption doubled while measured quality effects stayed mixed.",
  "",
  "## Introduction",
  "This review asks what field studies actually establish.",
  "1. Does assistant adoption improve delivery speed?",
  "2. What are the effects on code quality and review load?",
  "",
  "## Key Research and Discoveries",
  "Across twelve field studies, delivery speed rose consistently while review load grew in proportion to generated-code volume.",
  "",
  "## Conclusion",
  "Evidence supports adoption paired with review guardrails.",
  "1. Speed gains are real and repeatable.",
  "2. Quality effects hinge on review practice, not on the assistant.",
  "",
  "## Methodology",
  "**Search Strategy:** Systematic review of published field studies",
  "**Source Selection Criteria:** Production deployments only",
  "**Analysis Framework:** Before/after delivery-metric comparison",
].join("\n");

// ───────────────────────────────────────────────────────────────────────────
// The surface table — one row per COMPILED kind_surface entry (14 total).
// `token` is what appears on the wire; `blockType` is what the hosts emit;
// `discriminator` is what a converged envelope must carry (fence languages
// are NORMALIZED — the ```mmd surface converges under "mermaid").
// ───────────────────────────────────────────────────────────────────────────

interface SurfaceCase {
  id: string;
  format: "xml" | "fence";
  /** The literal tag name / fence language written on the wire. */
  token: string;
  /** Block type the accumulator + splitter emit for this surface. */
  blockType: string;
  /** Expected converged root kind. */
  kind: string;
  /** Expected wire discriminator on the envelope root. */
  discriminator: IrDiscriminator;
  /** Inner body (no framing). */
  body: string;
}

const xml = (tag: string): IrDiscriminator => ({ format: "xml", tag });
const fence = (language: string): IrDiscriminator => ({
  format: "fence",
  language,
});

const SURFACES: SurfaceCase[] = [
  // flashcards — both framings converge to flashcard_set.
  {
    id: "flashcards_xml",
    format: "xml",
    token: "flashcards",
    blockType: "flashcards",
    kind: "flashcard_set",
    discriminator: xml("flashcards"),
    body: FLASHCARDS_BODY,
  },
  {
    id: "flashcards_fence",
    format: "fence",
    token: "flashcards",
    blockType: "flashcards",
    kind: "flashcard_set",
    discriminator: fence("flashcards"),
    body: FLASHCARDS_BODY,
  },
  // mermaid — ```mermaid and its ```mmd alias both converge to mermaid_diagram
  // under the NORMALIZED "mermaid" language.
  {
    id: "mermaid_fence",
    format: "fence",
    token: "mermaid",
    blockType: "mermaid",
    kind: "mermaid_diagram",
    discriminator: fence("mermaid"),
    body: MERMAID_BODY,
  },
  {
    id: "mmd_fence",
    format: "fence",
    token: "mmd",
    blockType: "mermaid",
    kind: "mermaid_diagram",
    discriminator: fence("mermaid"),
    body: MERMAID_BODY,
  },
  {
    id: "tasks_fence",
    format: "fence",
    token: "tasks",
    blockType: "tasks",
    kind: "task_list",
    discriminator: fence("tasks"),
    body: TASKS_BODY,
  },
  {
    id: "resources_xml",
    format: "xml",
    token: "resources",
    blockType: "resources",
    kind: "resource_collection",
    discriminator: xml("resources"),
    body: RESOURCES_BODY,
  },
  {
    id: "progress_tracker_xml",
    format: "xml",
    token: "progress_tracker",
    blockType: "progress_tracker",
    kind: "progress_tracker",
    discriminator: xml("progress_tracker"),
    body: PROGRESS_BODY,
  },
  {
    id: "timeline_xml",
    format: "xml",
    token: "timeline",
    blockType: "timeline",
    kind: "timeline",
    discriminator: xml("timeline"),
    body: TIMELINE_BODY,
  },
  {
    id: "structured_info_fence",
    format: "fence",
    token: "structured_info",
    blockType: "structured_info",
    kind: "structured_info",
    discriminator: fence("structured_info"),
    body: STRUCTURED_INFO_BODY,
  },
  {
    id: "transcript_fence",
    format: "fence",
    token: "transcript",
    blockType: "transcript",
    kind: "transcript",
    discriminator: fence("transcript"),
    body: TRANSCRIPT_BODY,
  },
  {
    id: "troubleshooting_xml",
    format: "xml",
    token: "troubleshooting",
    blockType: "troubleshooting",
    kind: "troubleshooting_guide",
    discriminator: xml("troubleshooting"),
    body: TROUBLESHOOTING_BODY,
  },
  // cooking_recipe — both framings converge to cooking_recipe.
  {
    id: "cooking_recipe_xml",
    format: "xml",
    token: "cooking_recipe",
    blockType: "cooking_recipe",
    kind: "cooking_recipe",
    discriminator: xml("cooking_recipe"),
    body: RECIPE_BODY,
  },
  {
    id: "cooking_recipe_fence",
    format: "fence",
    token: "cooking_recipe",
    blockType: "cooking_recipe",
    kind: "cooking_recipe",
    discriminator: fence("cooking_recipe"),
    body: RECIPE_BODY,
  },
  {
    id: "research_xml",
    format: "xml",
    token: "research",
    blockType: "research",
    kind: "research_report",
    discriminator: xml("research"),
    body: RESEARCH_BODY,
  },
];

// ───────────────────────────────────────────────────────────────────────────
// Host drivers — the REAL accumulator and the REAL splitter, verbatim from the
// keystone test's harness.
// ───────────────────────────────────────────────────────────────────────────

type Upsert = { requestId: string; block: RenderBlockPayload };

function runAccumulator(
  stream: string,
  requestId: string,
  seed: number,
): Upsert[] {
  const upserts: Upsert[] = [];
  const accumulator = new StreamBlockAccumulator(requestId, (payload) => {
    upserts.push(payload as Upsert);
    return { type: "test/upsert", payload };
  });
  const dispatch = (action: unknown) => action;
  for (const chunk of chunkText(stream, seed, 9)) {
    accumulator.ingest(chunk, dispatch);
  }
  accumulator.finalize(dispatch);
  return upserts;
}

function envelopeOf(
  metadata: Record<string, unknown> | null | undefined,
): CanonicalBlockIR | null {
  const candidate = metadata?.[IR_ENVELOPE_KEY];
  return isCanonicalBlockIR(candidate) ? candidate : null;
}

/** Last COMPLETE block of `type` in the accumulator's emit stream. */
function lastCompleteBlockOfType(
  upserts: Upsert[],
  type: string,
): RenderBlockPayload {
  for (let i = upserts.length - 1; i >= 0; i--) {
    const block = upserts[i].block;
    if (block.type === type && block.status === "complete") return block;
  }
  throw new Error(`no complete "${type}" block emitted`);
}

/** Frames a body the way the real surface arrives on the wire. */
function wire(c: SurfaceCase): string {
  if (c.format === "xml") {
    return `<${c.token}>\n${c.body}\n</${c.token}>`;
  }
  return "```" + c.token + "\n" + c.body + "\n```";
}

function surfaceEnvelopeFromStream(c: SurfaceCase, seed: number): CanonicalBlockIR {
  const source = `Intro line before the region.\n\n${wire(c)}\n\nOutro line after.\n`;
  const upserts = runAccumulator(source, `req-${c.id}-${seed}`, seed);
  const block = lastCompleteBlockOfType(upserts, c.blockType);
  const envelope = envelopeOf(
    block.metadata as Record<string, unknown> | null | undefined,
  );
  if (!envelope) {
    throw new Error(
      `[convergence] surface "${c.id}" did NOT converge in the accumulator: ` +
        `block type "${c.blockType}" carried no metadata.__ir envelope.`,
    );
  }
  return envelope;
}

// Several legacy parsers (tasks, recipe, research…) carry debug console.log on
// every parse — silence it so a real console.error stands out. console.error
// is left live: an unexpected one during a happy-path convergence is a signal.
let logSpy: jest.SpyInstance;
let warnSpy: jest.SpyInstance;
beforeAll(() => {
  logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
  warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
});
afterAll(() => {
  logSpy.mockRestore();
  warnSpy.mockRestore();
});

// ───────────────────────────────────────────────────────────────────────────
// (a) + (b): every compiled surface converges, streaming ≡ static.
// ───────────────────────────────────────────────────────────────────────────

describe.each(SURFACES)(
  "surface convergence — $id → $kind ($format)",
  (c) => {
    const source = `Intro line before the region.\n\n${wire(c)}\n\nOutro line after.\n`;

    it("(a) streaming: the accumulator stamps a complete envelope with the right kind + discriminator", () => {
      const upserts = runAccumulator(source, `req-${c.id}-stream`, 3);
      const block = lastCompleteBlockOfType(upserts, c.blockType);
      const envelope = envelopeOf(
        block.metadata as Record<string, unknown> | null | undefined,
      );

      // Loud, precise failure if this surface did not converge.
      expect(envelope).not.toBeNull();
      if (!envelope) throw new Error("unreachable");

      expect(envelope.root.kind).toBe(c.kind);
      expect(envelope.root.status).toBe("complete");
      expect(envelope.root.kindState).toBe("resolved");
      expect(envelope.root.discriminator).toEqual(c.discriminator);
    });

    it("(b) static: the splitter one-shot converges to the SAME envelope (stream ≡ static)", () => {
      const fromStream = surfaceEnvelopeFromStream(c, 2);

      const blocks = splitContentIntoBlocksV2(source);
      const block = blocks.find((b) => b.type === c.blockType);
      expect(block).toBeDefined();
      const fromSplitter = envelopeOf(
        block?.metadata as Record<string, unknown> | null | undefined,
      );

      expect(fromSplitter).not.toBeNull();
      if (!fromSplitter) throw new Error("unreachable");

      expect(fromSplitter.root.kind).toBe(c.kind);
      expect(fromSplitter.root.discriminator).toEqual(c.discriminator);

      // stream ≡ static: identical canonical value AND identical fingerprint,
      // so the whole envelope matches — both host framings meet at one shape.
      expect(fromSplitter.root.value).toEqual(fromStream.root.value);
      expect(fromSplitter.fingerprint).toBe(fromStream.fingerprint);
      expect(fromSplitter).toEqual(fromStream);
    });
  },
);

// ───────────────────────────────────────────────────────────────────────────
// Malformed body — a representative FENCE surface fails OPEN (loudly), keeping
// the block intact with no envelope. The keystone covers the XML malformed
// path; this covers the fence path.
// ───────────────────────────────────────────────────────────────────────────

describe("malformed body fails OPEN — no envelope, block intact, no throw", () => {
  // A ```tasks fence with nothing checkable — the real parser yields no item,
  // so the strategy declines to null and the region stays on legacy rendering.
  const MALFORMED = "```tasks\nJust prose, nothing checkable here.\n```";
  const source = `Before.\n\n${MALFORMED}\n\nAfter.\n`;

  let errorSpy: jest.SpyInstance;
  beforeEach(() => {
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    errorSpy.mockRestore();
  });

  it("accumulator: the tasks block is emitted intact, with NO envelope, and the fallback is loud", () => {
    let upserts: Upsert[] | null = null;
    expect(() => {
      upserts = runAccumulator(source, "req-malformed-tasks", 4);
    }).not.toThrow();
    if (!upserts) throw new Error("unreachable");

    const block = lastCompleteBlockOfType(upserts, "tasks");
    expect(
      envelopeOf(block.metadata as Record<string, unknown> | null | undefined),
    ).toBeNull();
    expect(block.content).toContain("Just prose");
    // Loud fail-open: the strategy's no-value decline emits a console.error.
    expect(errorSpy).toHaveBeenCalled();
  });

  it("splitter: same region declines to null, block content preserved", () => {
    const blocks = splitContentIntoBlocksV2(source);
    const block = blocks.find((b) => b.type === "tasks");
    expect(block).toBeDefined();
    expect(
      envelopeOf(block?.metadata as Record<string, unknown> | null | undefined),
    ).toBeNull();
    expect(block?.content).toContain("Just prose");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Routing parity — the surface envelope and a direct `__kind` JSON arrival of
// the SAME value route to the same component type and derive the same
// serverData through `applyIrKindRoute`. Three representative kinds spanning
// XML + fence.
// ───────────────────────────────────────────────────────────────────────────

const ROUTING_IDS = new Set(["flashcards_xml", "tasks_fence", "timeline_xml"]);
const ROUTING_CASES = SURFACES.filter((c) => ROUTING_IDS.has(c.id));

describe.each(ROUTING_CASES)(
  "routing parity — $id: surface envelope ≡ __kind JSON arrival",
  (c) => {
    it("applyIrKindRoute yields the same routed type + serverData from both arrivals", () => {
      // The envelope as it arrives from the live stream (surface framing).
      const surfaceEnvelope = surfaceEnvelopeFromStream(c, 5);
      const surfaceBlock: IrRoutableBlock = {
        type: c.blockType,
        metadata: { [IR_ENVELOPE_KEY]: surfaceEnvelope },
      };
      const routedFromSurface = applyIrKindRoute(surfaceBlock);

      // The SAME canonical value arriving as `__kind` JSON — parsed through the
      // REAL kind parser off the registry snapshot, exactly a DB/live JSON hop.
      const jsonEnvelope = normalizeJsonRegion(
        JSON.stringify(surfaceEnvelope.root.value),
        { schemas: kindRegistry.snapshotSchemas() },
      );
      expect(jsonEnvelope.root.kind).toBe(c.kind);
      const jsonBlock: IrRoutableBlock = {
        type: "code",
        metadata: { [IR_ENVELOPE_KEY]: jsonEnvelope },
      };
      const routedFromJson = applyIrKindRoute(jsonBlock);

      // One pipeline, two surfaces: identical routed component + serverData.
      expect(routedFromSurface.type).toBe(routedFromJson.type);
      expect(routedFromSurface.serverData).toEqual(routedFromJson.serverData);
      expect(routedFromSurface.serverData).toBeDefined();
      // Routed to the kind's real component, not left as a raw region.
      expect(routedFromJson.type).not.toBe("code");
    });
  },
);
