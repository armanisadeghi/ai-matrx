/**
 * The viewer resolves "current" by the SAME rule as the Sources page — the
 * server's `docproc.source_list_facts` (newest recapture in the chain, then its
 * live edit) — never a second client rule. Opened on an older capture, it must
 * land on the head's edit (live 2026-09-26: 975b2753 → head 7e49f65f → edit
 * a573b03f).
 */
import { act } from "react";
import { createRoot } from "react-dom/client";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const rpc = jest.fn();
jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    schema: () => ({
      rpc: (...a: unknown[]) => rpc(...a),
      from: () => {
        throw new Error(
          "the viewer must not resolve versions with its own table reads",
        );
      },
    }),
  },
}));

import { useCurrentVersion } from "@/features/sources/hooks/useCurrentVersion";

function factsRow(id: string, head: string, current: string) {
  return {
    processed_document_id: id,
    chunk_count: 0,
    has_entities: false,
    attachments: [],
    current_document_id: current,
    current_chunk_count: 1,
    current_has_entities: false,
    stale_chunk_count: 0,
    indexing: false,
    head_document_id: head,
  };
}

async function resolve(id: string) {
  let seen: ReturnType<typeof useCurrentVersion> | null = null;
  function Probe() {
    seen = useCurrentVersion(id);
    return null;
  }
  const host = document.createElement("div");
  const root = createRoot(host);
  await act(async () => {
    root.render(<Probe />);
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  act(() => root.unmount());
  return seen!;
}

describe("the viewer's current version comes from source_list_facts", () => {
  beforeEach(() => rpc.mockReset());

  it("an older capture resolves to the head's live edit, with the head as the original", async () => {
    rpc.mockResolvedValue({
      data: [factsRow("old", "head", "edit")],
      error: null,
    });
    const v = await resolve("old");
    expect(rpc).toHaveBeenCalledWith("source_list_facts", { p_ids: ["old"] });
    expect(v.error).toBeNull();
    expect(v.versions).toEqual({
      originalId: "head",
      currentId: "edit",
      edited: true,
    });
  });

  it("an unedited head is its own current version", async () => {
    rpc.mockResolvedValue({ data: [factsRow("a", "a", "a")], error: null });
    const v = await resolve("a");
    expect(v.versions).toEqual({
      originalId: "a",
      currentId: "a",
      edited: false,
    });
  });

  it("a failed read shows the opened document and says so", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    const v = await resolve("x");
    expect(v.versions).toEqual({
      originalId: "x",
      currentId: "x",
      edited: false,
    });
    expect(v.error).toMatch(/Couldn't check/);
  });
});
