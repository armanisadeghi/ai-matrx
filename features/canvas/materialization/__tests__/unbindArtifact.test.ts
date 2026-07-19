/**
 * unbindArtifact — semantics tests (TWO_WAY_BINDING.md § b).
 *
 * The pure parts run directly (replacement building, inertness gating, ref
 * rewriting); the orchestrator runs with injected row-loading deps (no IO).
 * The round-trip test proves materialize → unbind restores content that is
 * byte-equivalent to the row's markdown export.
 */

import { KIND_KEY } from "@/features/content-ir/core/kind-schema.types";
import type {
  CxContentBlock,
  CxTextContent,
} from "@/features/public-chat/types/cx-tables";
import { exportArtifactMarkdown } from "@/features/canvas/export/exportArtifactMarkdown";
import type { CanvasArtifactRow } from "@/features/canvas/services/canvasArtifactService";
import { getArtifactDef, ARTIFACT_TYPE_DEFS } from "@/features/canvas/artifact-types/artifact-type-registry";
import { planMaterialization } from "../planMaterialization";
import { wrapArtifactText } from "../artifactWire";
import {
  buildUnbindReplacement,
  isInertMarkdown,
  rewriteContentRemovingArtifactRefs,
  unbindArtifact,
  type UnbindDeps,
} from "../unbindArtifact";

const textBlock = (text: string): CxContentBlock =>
  ({ type: "text", text }) as CxTextContent;

const UUID = "123e4567-e89b-42d3-a456-426614174000";

function makeRow(partial: Partial<CanvasArtifactRow>): CanvasArtifactRow {
  return {
    id: UUID,
    user_id: "u",
    type: "code",
    title: "Test",
    content: { data: "", type: "code", metadata: {} },
    conversation_id: null,
    source_message_id: null,
    artifact_index: 1,
    version: 1,
    parent_canvas_id: null,
    source_type: "model_direct",
    external_system: null,
    external_id: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...partial,
  };
}

const KIND_SET = {
  [KIND_KEY]: "flashcard_set",
  title: "Cell Biology",
  cards: [
    { [KIND_KEY]: "flashcard", front: "Q1", back: "A1" },
    { [KIND_KEY]: "flashcard", front: "Q2", back: "A2" },
  ],
};

function depsFor(rows: CanvasArtifactRow[]): UnbindDeps {
  return {
    getById: async (id) => rows.find((r) => r.id === id) ?? null,
    getVersionHistory: async (id) =>
      rows.some((r) => r.id === id || r.parent_canvas_id === id) ? rows : [],
  };
}

describe("buildUnbindReplacement", () => {
  it("structured kind row → prose markdown via the kind facet, INERT", () => {
    const row = makeRow({
      type: "flashcards",
      title: "Cell Biology",
      content: { data: KIND_SET, type: "flashcards", metadata: {} },
    });
    const rep = buildUnbindReplacement(row);
    expect(rep.inert).toBe(true);
    // Prose, never a JSON dump.
    expect(rep.markdown).not.toContain(KIND_KEY);
    expect(rep.markdown).toContain("Q1");
    // Byte-equivalent to the export primitive (the round-trip contract).
    expect(rep.markdown).toBe(exportArtifactMarkdown(row).markdown);
  });

  it("code row → re-fenced with its stored language, INERT (bare code fences never auto-materialize)", () => {
    const row = makeRow({
      type: "code",
      content: {
        data: "const x = 1;",
        type: "code",
        metadata: { language: "typescript" },
      },
    });
    const rep = buildUnbindReplacement(row);
    expect(rep.markdown).toBe("```typescript\nconst x = 1;\n```");
    expect(rep.inert).toBe(true);
  });

  it("a fence that re-detects (mermaid) is NOT inert → unbind refuses", () => {
    // Simulate a code row whose fence language is a materializable type.
    const row = makeRow({
      type: "code",
      content: {
        data: "flowchart TD\n  A --> B",
        type: "code",
        metadata: { language: "mermaid" },
      },
    });
    const rep = buildUnbindReplacement(row);
    expect(rep.inert).toBe(false);
  });

  it("raw mermaid source (no fence) is inert plain text", () => {
    const row = makeRow({
      type: "mermaid",
      content: { data: "flowchart TD\n  A --> B", type: "mermaid", metadata: {} },
    });
    const rep = buildUnbindReplacement(row);
    // Passthrough string export, no fence → the planner sees prose.
    expect(rep.markdown).toBe("flowchart TD\n  A --> B");
    expect(rep.inert).toBe(true);
  });
});

describe("isInertMarkdown", () => {
  it("prose is inert; a materializable fence is not", () => {
    expect(isInertMarkdown("Just some **markdown** text.")).toBe(true);
    expect(isInertMarkdown("```mermaid\nflowchart TD\n A-->B\n```")).toBe(false);
  });
});

describe("rewriteContentRemovingArtifactRefs", () => {
  it("replaces only the targeted chain's tags, preserving surrounding prose", () => {
    const otherId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
    const target = wrapArtifactText({
      canvasType: "flashcards",
      id: UUID,
      version: 1,
      title: "Cards",
      body: JSON.stringify(KIND_SET),
    });
    const other = wrapArtifactText({
      canvasType: "code",
      id: otherId,
      version: 1,
      body: "const y = 2;",
    });
    const content = [textBlock(`Before.\n\n${target}\n\nBetween.\n\n${other}\n\nAfter.`)];
    const { rewritten, replacedCount } = rewriteContentRemovingArtifactRefs(
      content,
      new Set([UUID]),
      "REPLACED",
    );
    expect(replacedCount).toBe(1);
    const text = (rewritten[0] as CxTextContent).text!;
    expect(text).toContain("Before.");
    expect(text).toContain("REPLACED");
    expect(text).toContain("Between.");
    expect(text).toContain(`id="${otherId}"`); // other artifact untouched
    expect(text).not.toContain(`id="${UUID}"`);
  });

  it("passes non-text blocks through verbatim and reports 0 when no ref matches", () => {
    const toolBlock = { type: "tool_call", id: "t1" } as unknown as CxContentBlock;
    const { rewritten, replacedCount } = rewriteContentRemovingArtifactRefs(
      [toolBlock, textBlock("no refs here")],
      new Set([UUID]),
      "X",
    );
    expect(replacedCount).toBe(0);
    expect(rewritten[0]).toBe(toolBlock);
  });
});

describe("unbindArtifact (orchestrator, injected deps)", () => {
  it("round-trip: materialize plan → wire tag → unbind restores the export byte-for-byte and is inert", async () => {
    // 1. MATERIALIZE (plan level): raw kind JSON plans a structured artifact.
    const raw = [
      textBlock(
        `Intro.\n\n\`\`\`json\n${JSON.stringify(KIND_SET, null, 2)}\n\`\`\`\n\nOutro.`,
      ),
    ];
    const plan = planMaterialization(raw);
    expect(plan.artifacts).toHaveLength(1);
    const planned = plan.artifacts[0]!;

    // The persisted row the upsert would create.
    const row = makeRow({
      type: planned.canvasType,
      title: planned.title,
      content: {
        data: planned.structured ?? planned.content,
        type: planned.canvasType,
        metadata: planned.metadata ?? {},
      },
    });

    // The rewritten source content (R1 wire form).
    const materialized = [
      textBlock(
        `Intro.\n\n${wrapArtifactText({
          canvasType: planned.canvasType,
          id: row.id,
          version: 1,
          title: planned.title,
          body: planned.content,
        })}\n\nOutro.`,
      ),
    ];
    // Idempotency sanity: the materialized form plans nothing new.
    expect(planMaterialization(materialized).hasChanges).toBe(false);

    // 2. UNBIND.
    let persisted: CxContentBlock[] | null = null;
    const result = await unbindArtifact(
      {
        artifactId: row.id,
        content: materialized,
        persistRewrite: async (rewritten) => {
          persisted = rewritten;
          return { ok: true };
        },
      },
      depsFor([row]),
    );

    expect(result.ok).toBe(true);
    expect(result.replacedCount).toBe(1);
    expect(persisted).not.toBeNull();
    const text = (persisted![0] as CxTextContent).text!;
    // Byte-equivalence to the export primitive.
    const expectedMarkdown = exportArtifactMarkdown(row).markdown;
    expect(result.markdown).toBe(expectedMarkdown);
    expect(text).toBe(`Intro.\n\n${expectedMarkdown}\n\nOutro.`);
    // Inert: the unbound note/message re-plans to NOTHING (no re-materialize loop).
    expect(planMaterialization(persisted!).hasChanges).toBe(false);
  });

  it("exports the LATEST chain version (edits after materialization survive detach)", async () => {
    const rootId = UUID;
    const v2Id = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
    const rows = [
      makeRow({
        id: rootId,
        type: "code",
        content: { data: "v1", type: "code", metadata: { language: "ts" } },
        version: 1,
      }),
      makeRow({
        id: v2Id,
        parent_canvas_id: rootId,
        type: "code",
        content: { data: "v2 edited", type: "code", metadata: { language: "ts" } },
        version: 2,
      }),
    ];
    const content = [
      textBlock(
        wrapArtifactText({ canvasType: "code", id: rootId, version: 1, body: "v1" }),
      ),
    ];
    const result = await unbindArtifact(
      {
        artifactId: rootId,
        content,
        persistRewrite: async () => ({ ok: true }),
      },
      depsFor(rows),
    );
    expect(result.ok).toBe(true);
    expect(result.markdown).toBe("```ts\nv2 edited\n```");
  });

  it("refuses (not_inert) and does not call persistRewrite when the export would re-materialize", async () => {
    const row = makeRow({
      type: "code",
      content: {
        data: "flowchart TD\n A-->B",
        type: "code",
        metadata: { language: "mermaid" },
      },
    });
    const content = [
      textBlock(
        wrapArtifactText({
          canvasType: "code",
          id: row.id,
          version: 1,
          body: "flowchart TD\n A-->B",
        }),
      ),
    ];
    let called = false;
    const result = await unbindArtifact(
      {
        artifactId: row.id,
        content,
        persistRewrite: async () => {
          called = true;
          return { ok: true };
        },
      },
      depsFor([row]),
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("not_inert");
    expect(called).toBe(false);
  });

  it("fails loudly on ref_not_found / row_not_found / rewrite_failed", async () => {
    const row = makeRow({
      type: "code",
      content: { data: "x", type: "code", metadata: { language: "ts" } },
    });

    const noRef = await unbindArtifact(
      {
        artifactId: row.id,
        content: [textBlock("no tags")],
        persistRewrite: async () => ({ ok: true }),
      },
      depsFor([row]),
    );
    expect(noRef.reason).toBe("ref_not_found");

    const noRow = await unbindArtifact(
      {
        artifactId: row.id,
        content: [textBlock("x")],
        persistRewrite: async () => ({ ok: true }),
      },
      depsFor([]),
    );
    expect(noRow.reason).toBe("row_not_found");

    const failed = await unbindArtifact(
      {
        artifactId: row.id,
        content: [
          textBlock(
            wrapArtifactText({ canvasType: "code", id: row.id, version: 1, body: "x" }),
          ),
        ],
        persistRewrite: async () => ({ ok: false, error: "rls denied" }),
      },
      depsFor([row]),
    );
    expect(failed.reason).toBe("rewrite_failed");
    expect(failed.errors).toContain("rls denied");
  });
});

describe("userEditable resolution (registry-driven EDIT, no per-type hard-codes)", () => {
  it("mermaid and code are the only userEditable types today (they have real editors)", () => {
    const editable = ARTIFACT_TYPE_DEFS.filter((d) => d.userEditable).map(
      (d) => d.canvasType,
    );
    expect(editable.sort()).toEqual(["code", "mermaid"]);
  });

  it("resolve-latest gating reads the registry flag", () => {
    expect(getArtifactDef("mermaid")?.userEditable).toBe(true);
    expect(getArtifactDef("code")?.userEditable).toBe(true);
    expect(getArtifactDef("flashcards")?.userEditable).toBeUndefined();
    expect(getArtifactDef("html")?.userEditable).toBeUndefined();
  });
});
