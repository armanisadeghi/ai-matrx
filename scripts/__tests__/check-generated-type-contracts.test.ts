import {
  analyzeSources,
  diffBaseline,
  extractApiContracts,
  ratchetBaseline,
  shouldScanPath,
  type SourceFileInput,
} from "@/scripts/check-generated-type-contracts";

const GENERATED_API = `
export interface components {
  schemas: {
    LLMParams: {
      model?: string | null;
      temperature?: number | null;
      max_output_tokens?: number | null;
      top_p?: number | null;
      top_k?: number | null;
      stream?: boolean | null;
      store?: boolean | null;
      reasoning_effort?: "low" | "high" | null;
      reasoning_summary?: "auto" | "always" | null;
      response_format?: { type: string } | null;
    };
    TinyResponse: { id: string; ok: boolean };
  };
}
`;

const contracts = extractApiContracts(GENERATED_API);

function analyze(text: string) {
  const sources: SourceFileInput[] = [{ path: "features/example/types.ts", text }];
  return analyzeSources(sources, contracts);
}

describe("generated contract extraction", () => {
  it("extracts schema field names from openapi-typescript components", () => {
    expect([...contracts.get("LLMParams")!.fields]).toEqual([
      "model",
      "temperature",
      "max_output_tokens",
      "top_p",
      "top_k",
      "stream",
      "store",
      "reasoning_effort",
      "reasoning_summary",
      "response_format",
    ]);
  });
});

describe("shadow contract detection", () => {
  it("rejects an exact-name handwritten API mirror", () => {
    const findings = analyze(`
      export interface LLMParams {
        model?: string;
        temperature?: number;
        max_output_tokens?: number;
        top_p?: number;
        top_k?: number;
        stream?: boolean;
        store?: boolean;
      }
    `);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      declaration: "LLMParams",
      generatedContract: "LLMParams",
      reason: "exact-name-mirror",
    });
  });

  it("rejects a renamed high-overlap API shadow", () => {
    const findings = analyze(`
      export interface AgentSettings {
        model?: string;
        temperature?: number;
        max_output_tokens?: number;
        top_p?: number;
        top_k?: number;
        stream?: boolean;
        store?: boolean;
        reasoning_effort?: string;
        local_only?: boolean;
      }
    `);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      declaration: "AgentSettings",
      generatedContract: "LLMParams",
      reason: "renamed-shadow",
      sharedFieldCount: 8,
    });
  });

  it("rejects a FeLlmParams-like extension that grows a generated API alias", () => {
    const findings = analyze(`
      export type LLMParams = NonNullableFields<components["schemas"]["LLMParams"]>;
      export interface FeLlmParams extends LLMParams {
        size?: string;
        quality?: string;
        seconds?: number;
      }
    `);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      declaration: "FeLlmParams",
      generatedContract: "LLMParams",
      reason: "generated-extension-shadow",
    });
  });

  it("allows direct generated aliases, mapped wrappers, z.infer, and Database aliases", () => {
    const findings = analyze(`
      export type LLMParams = components["schemas"]["LLMParams"];
      export type OptionalLLMParams = NonNullableFields<components["schemas"]["LLMParams"]>;
      export type ParsedInput = z.infer<typeof ParsedInputSchema>;
      export type AgentRow = Database["agent"]["Tables"]["definition"]["Row"];
    `);
    expect(findings).toEqual([]);
  });

  it("does not guess from tiny or low-overlap domain objects", () => {
    const findings = analyze(`
      interface TemperatureDisplay { temperature: number; label: string }
      interface LocalRun {
        model: string;
        stream: boolean;
        store: boolean;
        startedAt: string;
        finishedAt: string;
        status: "done" | "failed";
        ownerId: string;
        title: string;
      }
    `);
    expect(findings).toEqual([]);
  });
});

describe("scan scope and baseline ratchet", () => {
  it("does not scan generated output, tests, fixtures, declarations, or archived docs", () => {
    expect(shouldScanPath("features/agents/types.ts")).toBe(true);
    expect(shouldScanPath("types/python-generated/api-types.ts")).toBe(false);
    expect(shouldScanPath("features/a/types.test.ts")).toBe(false);
    expect(shouldScanPath("scripts/fixtures/type-shadow.ts")).toBe(false);
    expect(shouldScanPath("types/vendor.d.ts")).toBe(false);
    expect(shouldScanPath("docs/archive/old-agent-types.ts")).toBe(false);
    expect(shouldScanPath("notes/type-example.md")).toBe(false);
  });

  it("reports only new findings and identifies resolved baseline debt", () => {
    const current = analyze(`
      interface LLMParams {
        model?: string; temperature?: number; max_output_tokens?: number;
        top_p?: number; top_k?: number; stream?: boolean; store?: boolean;
      }
      interface AgentSettings {
        model?: string; temperature?: number; max_output_tokens?: number;
        top_p?: number; top_k?: number; stream?: boolean; store?: boolean;
        reasoning_effort?: string;
      }
    `);
    const baseline = [current[0].id, "features/old.ts::OldShadow::LLMParams"];
    expect(diffBaseline(current, baseline)).toEqual({
      added: [current[1]],
      resolved: ["features/old.ts::OldShadow::LLMParams"],
    });
  });

  it("ratchets down but refuses to bless newly introduced debt", () => {
    expect(ratchetBaseline(["a", "b"], ["a"])).toEqual(["a"]);
    expect(() => ratchetBaseline(["a"], ["a", "new"])).toThrow(
      "Refusing to add 1 new generated-contract shadow",
    );
  });
});
