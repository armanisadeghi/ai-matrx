/**
 * troubleshooting_guide kind package — the standard fleet gates:
 *
 *   1. Converter fidelity: the schemas round-trip through the storage
 *      transform (what the migration's data[]/kind_edge rows were emitted
 *      from), and the emitted provider schema resolves every ref.
 *   2. Structural leg: both seeded kind_example payloads pass
 *      validateStructuralLeg against the converter-emitted
 *      emitted_json_schema — the EXACT check activation runs.
 *   3. Render leg: the legacy bridge derives serverData the REAL component
 *      contract accepts (validateTroubleshootingGuide — the component
 *      parser's own validator), with the legacy parser's deterministic ids.
 *   4. THE KEYSTONE: a real `<troubleshooting>` wire sample converges through
 *      the `troubleshooting_legacy_text` strategy into a schema-passing
 *      canonical value, and bridging that value reproduces BYTE-EQUAL
 *      serverData to the legacy direct-parse path.
 *   5. toMarkdown: the export is the component parser's own dialect — it
 *      round-trips through parseTroubleshootingMarkdown back to the same
 *      serverData.
 */

import {
  parseTroubleshootingMarkdown,
  validateTroubleshootingGuide,
} from "@/components/mardown-display/blocks/troubleshooting/parseTroubleshootingMarkdown";
import {
  TROUBLESHOOTING_KIND_DEFINITIONS,
  TROUBLESHOOTING_GUIDE_EXAMPLE_SIMPLE,
  TROUBLESHOOTING_GUIDE_EXAMPLE_FULL,
  troubleshootingServerDataFromEnvelope,
  troubleshootingMarkdownFromValue,
} from "../kinds/troubleshooting-guide";
import { troubleshootingLegacyTextToKindValue } from "../surfaces/troubleshooting-legacy-text";
import { validateStructuralLeg } from "../registry/kind-dual-gate";
import { envelopeFromCompleteValue } from "../core/normalize";
import { kindSchemaToJsonSchema } from "../convert/kind-to-json-schema";
import {
  kindSchemaToStorage,
  storageToKindSchema,
} from "../registry/kind-storage-transform";
import type { KindSchema } from "../core/kind-schema.types";

type TroubleshootingData = ReturnType<typeof parseTroubleshootingMarkdown>;

const schemasByKind = new Map<string, KindSchema>();
for (const def of TROUBLESHOOTING_KIND_DEFINITIONS) {
  if (def.schema) schemasByKind.set(def.kind, def.schema);
}
const resolve = (kind: string): KindSchema | undefined =>
  schemasByKind.get(kind);

/** The migration's emitted_json_schema recipe (strict, no __kind). */
function emittedJsonSchemaFor(kind: string): unknown {
  const emitted = kindSchemaToJsonSchema(kind, resolve, {
    strict: true,
    injectKind: false,
  });
  if (!emitted) throw new Error(`no schema for ${kind}`);
  expect(emitted.unresolved).toEqual([]);
  return emitted.schema;
}

// The XML counterpart's comprehensive wire sample (skill
// `troubleshooting-guides` / migrations/rb_troubleshooting_skill.sql) —
// exercises title, description, causes, two solutions, steps with commands,
// a linked step with difficulty, and related issues.
const WIRE_INNER = [
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

const WIRE_WITH_TAGS = `<troubleshooting>\n${WIRE_INNER}\n</troubleshooting>`;

describe("troubleshooting_guide — converter fidelity", () => {
  it("every schema round-trips through the storage transform", () => {
    for (const [kind, schema] of schemasByKind) {
      const shape = kindSchemaToStorage(schema);
      expect(storageToKindSchema(kind, shape)).toEqual(schema);
    }
  });

  it("the ref graph matches the seeded kind_edge rows", () => {
    const edges = Object.fromEntries(
      [...schemasByKind.keys()].map((kind) => [
        kind,
        kindSchemaToStorage(schemasByKind.get(kind) as KindSchema).edges,
      ]),
    );
    expect(edges).toEqual({
      troubleshooting_guide: [
        { fieldPath: "issues", childKind: "troubleshooting_issue", position: 0 },
      ],
      troubleshooting_issue: [
        {
          fieldPath: "solutions",
          childKind: "troubleshooting_solution",
          position: 0,
        },
      ],
      troubleshooting_solution: [
        { fieldPath: "steps", childKind: "troubleshooting_step", position: 0 },
      ],
      troubleshooting_step: [
        { fieldPath: "links", childKind: "troubleshooting_link", position: 0 },
      ],
      troubleshooting_link: [],
    });
  });
});

describe("troubleshooting_guide — structural leg (the activation gate)", () => {
  const rootSchema = emittedJsonSchemaFor("troubleshooting_guide");

  it("the canonical (simple) example passes", () => {
    const result = validateStructuralLeg(
      TROUBLESHOOTING_GUIDE_EXAMPLE_SIMPLE,
      rootSchema,
    );
    expect(result).toEqual({ ok: true });
  });

  it("the full-field example passes", () => {
    const result = validateStructuralLeg(
      TROUBLESHOOTING_GUIDE_EXAMPLE_FULL,
      rootSchema,
    );
    expect(result).toEqual({ ok: true });
  });

  it("a guide missing its required issues fails loudly", () => {
    const result = validateStructuralLeg(
      { __kind: "troubleshooting_guide", title: "No issues" },
      rootSchema,
    );
    expect(result.ok).toBe(false);
  });
});

describe("troubleshooting_guide — render leg (legacy bridge)", () => {
  it("derives component-valid serverData from the full example", () => {
    const envelope = envelopeFromCompleteValue(
      TROUBLESHOOTING_GUIDE_EXAMPLE_FULL,
      "troubleshooting_guide",
    );
    const serverData = troubleshootingServerDataFromEnvelope(envelope);
    expect(serverData).toBeDefined();
    if (!serverData) throw new Error("unreachable");

    // The component parser's OWN validator accepts the bridge output.
    expect(
      validateTroubleshootingGuide(
        serverData as unknown as TroubleshootingData,
      ),
    ).toBe(true);

    // Legacy-parser id convention: global 1-based counters.
    expect(serverData).toMatchObject({
      title: "API Connection Issues",
      issues: [
        expect.objectContaining({ id: "issue-1", severity: "high" }),
        expect.objectContaining({ id: "issue-2", severity: "critical" }),
      ],
    });
    const guide = serverData as unknown as TroubleshootingData;
    expect(guide.issues[0].solutions.map((s) => s.id)).toEqual([
      "solution-1",
      "solution-2",
    ]);
    expect(guide.issues[1].solutions.map((s) => s.id)).toEqual(["solution-3"]);
    expect(
      guide.issues.flatMap((i) => i.solutions.flatMap((s) => s.steps)).map(
        (s) => s.id,
      ),
    ).toEqual(["step-1", "step-2", "step-3", "step-4"]);

    // The JSON-only superset fields survive the bridge.
    expect(guide.issues[0].solutions[0]).toMatchObject({
      priority: "high",
      successRate: 85,
      tags: ["network", "connectivity"],
    });
    expect(guide.issues[0].solutions[1].steps[0].links).toEqual([
      { title: "API Key Management", url: "https://example.com/api-keys" },
    ]);
  });

  it("declines a guide whose issues all fail to materialize", () => {
    const envelope = envelopeFromCompleteValue(
      { __kind: "troubleshooting_guide", title: "Empty", issues: [] },
      "troubleshooting_guide",
    );
    expect(troubleshootingServerDataFromEnvelope(envelope)).toBeUndefined();
  });
});

describe("<troubleshooting> XML surface — the keystone convergence", () => {
  it("converts the real wire sample into a schema-passing canonical value", () => {
    const value = troubleshootingLegacyTextToKindValue(WIRE_WITH_TAGS);
    expect(value).not.toBeNull();
    if (!value) throw new Error("unreachable");

    expect(value.__kind).toBe("troubleshooting_guide");
    const issues = value.issues;
    if (!Array.isArray(issues)) throw new Error("issues missing");
    expect(
      issues.every(
        (issue) =>
          (issue as Record<string, unknown>).__kind === "troubleshooting_issue",
      ),
    ).toBe(true);

    const result = validateStructuralLeg(
      value,
      emittedJsonSchemaFor("troubleshooting_guide"),
    );
    expect(result).toEqual({ ok: true });
  });

  it("accepts both host framings and yields the identical value", () => {
    const fromTagged = troubleshootingLegacyTextToKindValue(WIRE_WITH_TAGS);
    const fromInner = troubleshootingLegacyTextToKindValue(WIRE_INNER);
    expect(fromTagged).not.toBeNull();
    expect(fromInner).toEqual(fromTagged);
  });

  it("bridge(strategy(xml)) is byte-equal to the legacy direct parse", () => {
    const value = troubleshootingLegacyTextToKindValue(WIRE_WITH_TAGS);
    if (!value) throw new Error("strategy failed");
    const serverData = troubleshootingServerDataFromEnvelope(
      envelopeFromCompleteValue(value, "troubleshooting_guide"),
    );
    // The exact object TroubleshootingArtifact would have produced from the
    // raw region text — one grammar, two arrival surfaces.
    expect(serverData).toEqual(parseTroubleshootingMarkdown(WIRE_INNER));
  });

  it("a region with no **Symptom:** marker is a loud parse failure (null)", () => {
    expect(
      troubleshootingLegacyTextToKindValue(
        "<troubleshooting>\nJust prose, no markers at all.\n</troubleshooting>",
      ),
    ).toBeNull();
  });
});

describe("troubleshooting_guide — toMarkdown facet", () => {
  it("emits the component parser's own dialect (round-trips to serverData)", () => {
    const markdown = troubleshootingMarkdownFromValue(
      TROUBLESHOOTING_GUIDE_EXAMPLE_SIMPLE,
    );
    expect(markdown).toContain("### Docker Build Fails");
    expect(markdown).toContain("**Symptom:**");
    expect(markdown).toContain("**Possible Causes:**");
    expect(markdown).toContain("**Solutions:**");
    expect(markdown).toContain("**Related Issues:**");

    const reparsed = parseTroubleshootingMarkdown(markdown);
    const bridged = troubleshootingServerDataFromEnvelope(
      envelopeFromCompleteValue(
        TROUBLESHOOTING_GUIDE_EXAMPLE_SIMPLE,
        "troubleshooting_guide",
      ),
    );
    expect(reparsed).toEqual(bridged);
  });

  it("dialect-inexpressible fields still render (nothing silently vanishes)", () => {
    const markdown = troubleshootingMarkdownFromValue(
      TROUBLESHOOTING_GUIDE_EXAMPLE_FULL,
    );
    expect(markdown).toContain("Severity: high");
    expect(markdown).toContain("Severity: critical");
    expect(markdown).toContain("Priority: high");
    expect(markdown).toContain("Success rate: 85%");
    expect(markdown).toContain("Tags: network, connectivity");
    expect(markdown).toContain("[API Key Management](https://example.com/api-keys)");
  });
});
