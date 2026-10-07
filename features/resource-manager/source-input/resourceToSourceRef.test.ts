import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { Resource } from "@ai-matrx/chat/agents/resources/types";

import {
  isNeedsIntake,
  MAPPED_RESOURCE_KINDS,
  resourceToSourceRef,
} from "./resourceToSourceRef";

/**
 * Reads the `Resource` union's `type: "<kind>"` literals from SOURCE, so adding
 * a variant to `features/agents/resources/types.ts` without a mapper turns this
 * test red even where the compiler is not run (jest does not type-check).
 */
function resourceUnionKinds(source: string): string[] {
  const start = source.indexOf("export type Resource =");
  if (start < 0) throw new Error("`export type Resource =` not found");
  // The union ends at the first `};` (the last variant's closing brace).
  const end = source.indexOf("};", start);
  const block = source.slice(start, end);
  return Array.from(block.matchAll(/type:\s*"([a-z_]+)"/g), (m) => m[1]!).sort();
}

const TYPES_PATH = resolve(__dirname, "../../../../aidream/apps/shared/chat/src/agents/resources/types.ts");

describe("resourceToSourceRef — exhaustiveness", () => {
  it("the source reader sees an added variant (self-test)", () => {
    const synthetic = `export type Resource =
  | { type: "note"; data: X }
  | { type: "brand_new"; data: Y };`;
    expect(resourceUnionKinds(synthetic)).toEqual(["brand_new", "note"]);
  });

  it("maps every Resource variant, and nothing that is not one", () => {
    const unionKinds = resourceUnionKinds(readFileSync(TYPES_PATH, "utf8"));
    expect(unionKinds.length).toBeGreaterThan(10);
    const mapped = [...MAPPED_RESOURCE_KINDS].sort();
    const unmapped = unionKinds.filter((kind) => !mapped.includes(kind as never));
    const stale = mapped.filter((kind) => !unionKinds.includes(kind));
    expect({ unmapped, stale }).toEqual({ unmapped: [], stale: [] });
  });
});

describe("resourceToSourceRef — outcomes", () => {
  const ref = (resource: Resource) => resourceToSourceRef(resource);

  it("maps stored records straight to a resource_ref with the server token", () => {
    expect(ref({ type: "note", data: { id: "n-1" } as never })).toEqual({
      __kind: "resource_ref",
      resource_type: "note",
      resource_id: "n-1",
    });
    expect(ref({ type: "file", data: { fileId: "f-1", id: "local-x" } })).toMatchObject({
      resource_type: "file",
      resource_id: "f-1",
    });
    expect(ref({ type: "document", data: { id: "d-1" } })).toMatchObject({
      resource_type: "udt_document",
    });
    expect(ref({ type: "transcript_session", data: { id: "s-1" } })).toMatchObject({
      resource_type: "studio_session",
    });
    expect(ref({ type: "agent_app", data: { id: "a-1" } })).toMatchObject({
      resource_type: "app",
    });
    expect(
      ref({ type: "table", data: { type: "full_table", table_id: "t-1" } as never }),
    ).toMatchObject({ resource_type: "dataset", resource_id: "t-1" });
  });

  it("sends inline material through intake, never as a blob", () => {
    const inline: Array<[Resource, string]> = [
      [{ type: "webpage", data: { url: "https://example.com" } as never }, "scraper"],
      [{ type: "youtube", data: { url: "https://youtu.be/x", videoId: "x" } }, "transcription"],
      [{ type: "image_url", data: { url: "https://example.com/a.png" } }, "scraper"],
      [{ type: "file_url", data: { url: "https://example.com/a.pdf" } }, "scraper"],
      [{ type: "audio", data: { url: "blob:x" } }, "transcription"],
      [{ type: "text", data: { id: "t", label: "Dictation", text: "hello" } }, "sources_land"],
      [{ type: "file", data: { content: "only content, no stored id" } }, "file_upload"],
    ];
    for (const [resource, door] of inline) {
      const outcome = resourceToSourceRef(resource);
      expect(isNeedsIntake(outcome)).toBe(true);
      if (isNeedsIntake(outcome)) {
        expect(outcome.kind).toBe(resource.type);
        expect(outcome.payload).toBe(resource.data);
        expect(outcome.reason).toBeTruthy();
        expect(outcome.door).toBe(door);
      }
    }
  });

  it("says why a table slice or a live context value is not a Source yet", () => {
    const slice = resourceToSourceRef({
      type: "table",
      data: { type: "table_row", table_id: "t", row_id: "r" } as never,
    });
    expect(isNeedsIntake(slice) && slice.reason).toMatch(/whole table/);
    expect(isNeedsIntake(slice) && slice.door).toBeNull();
    const cell = resourceToSourceRef({
      type: "context_value",
      data: {
        id: "s::i",
        scope_id: "s",
        context_item_id: "i",
        label: "Brand · Voice",
        referenceFence: "",
      },
    });
    expect(isNeedsIntake(cell) && cell.reason).toMatch(/context/);
    expect(isNeedsIntake(cell) && cell.door).toBeNull();
  });
});
