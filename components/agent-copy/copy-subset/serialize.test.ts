import {
  copySubsetSize,
  inferCopySubsetColumns,
  serializeCopySubset,
} from "@/components/agent-copy/copy-subset/serialize";
import type {
  CopySubsetColumn,
  CopySubsetMeta,
} from "@/components/agent-copy/copy-subset/types";

type Row = { name: string; status: string; released: string | null; n: number };

const rows: Row[] = [
  { name: "gpt-5", status: "missing_local", released: "2026-08-01", n: 2 },
  { name: "o3 | mini", status: "matched", released: null, n: 1 },
];

const columns: CopySubsetColumn<Row>[] = [
  { id: "name", header: "Model", accessorKey: "name" },
  { id: "status", header: "Status", accessorKey: "status" },
  { id: "released", header: "Released", accessorKey: "released" },
];

const meta: CopySubsetMeta = {
  format: "markdown",
  total_rows: 5,
  matched_rows: 2,
  copied_rows: 2,
  total_columns: 4,
  copied_columns: 3,
  active_filters: 1,
  sort: "released:desc",
  selection: false,
};

const source = {
  kind: "provider-sync-models",
  location: "AI Matrx Admin — Provider Sync",
  label: "OpenAI models",
};

describe("copy-subset serialization", () => {
  it("infers one column per key across rows, in first-seen order", () => {
    const inferred = inferCopySubsetColumns([
      { a: 1, b: 2 },
      { b: 3, c: 4 },
    ]);
    expect(inferred.map((c) => c.id)).toEqual(["a", "b", "c"]);
    expect(inferred[2]?.accessorFn?.({ b: 3, c: 4 })).toBe(4);
  });

  it("writes a Markdown table of only the given columns, pipes escaped", () => {
    const text = serializeCopySubset(source, rows, columns, "markdown", meta);
    expect(text.split("\n")[0]).toBe("| Model | Status | Released |");
    expect(text).toContain("| o3 \\| mini | matched |  |");
    expect(text).not.toContain(" n ");
  });

  it("writes CSV with the same columns and quoting", () => {
    const text = serializeCopySubset(source, rows, columns, "csv", meta);
    expect(text.split("\n")).toEqual([
      "Model,Status,Released",
      "gpt-5,missing_local,2026-08-01",
      "o3 | mini,matched,",
    ]);
  });

  it("writes JSON records keyed by header", () => {
    const text = serializeCopySubset(source, rows, columns, "json", meta);
    expect(JSON.parse(text)).toEqual([
      { Model: "gpt-5", Status: "missing_local", Released: "2026-08-01" },
      { Model: "o3 | mini", Status: "matched", Released: "" },
    ]);
  });

  it("uses the generic for-AI envelope with shaping attributes when no serializer is given", () => {
    const text = serializeCopySubset(source, rows, columns, "ai", meta);
    expect(text).toContain("<provider-sync-models");
    expect(text).toContain('copied_rows="2"');
    expect(text).toContain('total_rows="5"');
    expect(text).toContain('sort="released:desc"');
    expect(text).toContain("| Model | Status | Released |");
  });

  it("uses the caller's serializer for the for-AI format", () => {
    const serializer = jest.fn(() => ({
      kind: "custom-kind",
      location: "here",
      description: "custom",
      data: { ok: true },
    }));
    const text = serializeCopySubset(
      { ...source, serializer },
      rows,
      columns,
      "ai",
      meta,
    );
    expect(serializer).toHaveBeenCalledWith(rows, columns, meta);
    expect(text).toContain("<custom-kind");
  });

  it("estimates size from the exact text", () => {
    const size = copySubsetSize("héllo");
    expect(size.chars).toBe(5);
    expect(size.bytes).toBe(6);
    expect(size.tokens).toBe(2);
  });
});
