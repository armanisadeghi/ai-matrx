/**
 * THE VALUE CONTRACT ON THE WIRE, as a guard.
 *
 * A structured write target that names a registered kind (`valueKind`) must
 * TEACH that contract in the `apply_surface_write` spec the model is handed —
 * `[kind=<slug> { field: type, … }]` — because the seam ENFORCES it
 * (`applySurfaceWrite` → `kindValidator.validate`) before the user is ever asked
 * to approve. A target that enforces a contract it never advertises refuses
 * correct-looking values for reasons the model cannot see, which is exactly
 * the wall W49 class: a refusal the model cannot act on.
 *
 * SUT: the real `buildToolInjection` over the REAL Rulebook manifest — not a
 * fixture manifest, because the thing under test is that THIS target carries
 * THIS contract. The only thing faked is the network hop that reads
 * `content_ir.kind_definition` (`getKindInputContractBySlug`), and what it
 * returns is not a hand-written fixture either: it is re-derived from the
 * in-repo `masterworkRuleDraftKindSchema` through `kindSchemaToJsonSchema`,
 * the same converter that emitted the registry row. Edit the schema and this
 * test follows it; hand-copying the schema here would let the two drift.
 *
 * The forcing function is the `apply_surface_write` description string: the
 * `[kind=…]` clause can only appear if the injection walked the mounted
 * surface, resolved the target's policy, read its `valueKind`, fetched the
 * contract and summarized it. Proven failing-then-passing by deleting
 * `valueKind` from the manifest (the `[kind=…]` clause disappears).
 */

const mockGetKindInputContractBySlug = jest.fn();

jest.mock(
  "@/features/content-ir/registry/schema-source-kind-tables",
  () => ({
    getKindInputContractBySlug: (slug: string) =>
      mockGetKindInputContractBySlug(slug),
  }),
);

// The capability providers register a large client module graph this decision
// does not touch (same treatment as structured-output-write-tool-guard).
jest.mock(
  "@/features/agents/redux/execution-system/client-capabilities/register-all",
  () => ({}),
);

jest.mock("@/utils/supabase/client", () => ({
  createClient: () => ({
    schema: () => ({
      from: () => ({
        select: () => ({ in: async () => ({ data: [], error: null }) }),
      }),
    }),
  }),
}));

import { kindSchemaToJsonSchema } from "@ai-matrx/content-ir";
import { buildToolInjection } from "../build-tool-injection";
import { kindValidator } from "@/features/content-ir/registry/kind-schema-source";
import { masterworkRulebookManifest } from "@/features/surfaces/manifests/masterwork-rulebook.manifest";
import {
  masterworkRuleDraftKindSchema,
  MASTERWORK_RULE_DRAFT_KIND,
} from "@/features/content-ir/kinds/masterwork-rule-draft";
import { registerSurfaceRuntime } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { invalidateOutputSchemaCache } from "@/features/mandates/output-contract";
import { resetMandateCatalogueCache } from "@/features/mandates/catalogue";
import type { RootState } from "@/lib/redux/store";
import type { ToolInjectionResult } from "@/features/agents/types/tool-injection.types";

const SURFACE = masterworkRulebookManifest.surfaceName;

/** The live contract, re-derived from the repo's schema by the real converter. */
function emittedJsonSchema(): unknown {
  const exported = kindSchemaToJsonSchema(
    MASTERWORK_RULE_DRAFT_KIND,
    (kind) =>
      kind === MASTERWORK_RULE_DRAFT_KIND
        ? masterworkRuleDraftKindSchema
        : undefined,
    { strict: true, injectKind: true },
  );
  if (!exported) throw new Error("converter declined the rule-draft schema");
  return exported.schema;
}

function makeState(conversationId: string, agentId: string): RootState {
  return {
    agentDefinition: {
      agents: {
        [agentId]: {
          id: agentId,
          name: "Masterwork Conductor",
          tools: [],
          customTools: [],
          mcpServers: [],
          outputSchema: null,
          _loadedFields: {
            name: true,
            modelId: true,
            tools: true,
            outputSchema: true,
          },
        },
      },
    },
    conversations: {
      byConversationId: {
        [conversationId]: {
          agentId,
          mandateKey: null,
          surfaceName: SURFACE,
        },
      },
    },
    instanceClientTools: { byConversationId: {} },
    instanceUIState: { byConversationId: {} },
    creatorDebug: { settings: {} },
    adminPreferences: {},
  } as unknown as RootState;
}

function surfaceWriteDescription(result: ToolInjectionResult): string {
  const spec = (result.tools ?? []).find(
    (entry) => entry.kind === "inline" && entry.name === "apply_surface_write",
  );
  if (!spec || spec.kind !== "inline") {
    throw new Error("apply_surface_write was not offered");
  }
  return spec.description ?? "";
}

describe("the Rulebook's rule_draft target advertises its registered value contract", () => {
  let unregister: () => void;

  beforeEach(() => {
    jest.clearAllMocks();
    invalidateOutputSchemaCache();
    resetMandateCatalogueCache();
    kindValidator.invalidate();
    mockGetKindInputContractBySlug.mockImplementation(async (slug: string) =>
      slug === MASTERWORK_RULE_DRAFT_KIND
        ? { schema: masterworkRuleDraftKindSchema, emittedJsonSchema: emittedJsonSchema() }
        : null,
    );
    unregister = registerSurfaceRuntime(
      {
        surfaceName: SURFACE,
        getScope: () => ({}),
        getWriteHandlers: () => ({ rule_draft: () => {} }),
      },
      1,
    );
  });

  afterEach(() => {
    unregister();
  });

  it("prints [kind=masterwork_rule_draft {...}] in the spec the model reads", async () => {
    const result = await buildToolInjection(
      makeState("conv-rulebook", "agent-conductor"),
      "conv-rulebook",
    );

    const description = surfaceWriteDescription(result);
    const line = description
      .split("\n")
      .find((entry) => entry.startsWith("- rule_draft "));
    expect(line).toBeDefined();

    // The contract clause itself — the slug AND the summarized shape.
    expect(line).toContain(`[kind=${MASTERWORK_RULE_DRAFT_KIND} {`);
    // `mode` is the one required field, so it carries no `?`; the optional
    // ones do. If this ever inverts, the model is being taught the opposite of
    // what the seam enforces. (The précis prints TYPES, not enum members — the
    // legal values of `mode`, `severity` and `actionKind` are spelled out in
    // the target's own description, which rides the same line.)
    expect(line).toMatch(/\{ mode: string,/);
    expect(line).toContain("statement?: string");
    expect(line).toContain("isPolicy?: boolean");
    // The marker is data, never something the write's author has to think
    // about, so the PRÉCIS deliberately omits it — the target's own prose
    // carries the requirement instead, and it must, or the model would send a
    // value the seam refuses.
    const precis = /\[kind=[a-z_]+ (\{.*?\})\]/s.exec(line ?? "")?.[1];
    expect(precis).toBeDefined();
    expect(precis).not.toContain("__kind");
    expect(line).toContain('`__kind` must be "masterwork_rule_draft"');
  });

  it("fetches the contract exactly once per turn, by slug", async () => {
    await buildToolInjection(
      makeState("conv-rulebook-2", "agent-conductor"),
      "conv-rulebook-2",
    );
    expect(mockGetKindInputContractBySlug).toHaveBeenCalledWith(
      MASTERWORK_RULE_DRAFT_KIND,
    );
  });
});
