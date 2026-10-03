/**
 * Every staged remark rides the wire with its STABLE id — the client resource
 * id (THREADS R1). The server keys a thread root on that id, never on the
 * `c<n>` handle it mints; a remark sent without one would get a fresh server
 * id on every resend and its thread would split.
 *
 * Use case: Dana comments twice on the scrap-intake answer before sending.
 */
import type { ManagedResource } from "../../../../types/instance.types";
import { REMARKS_BLOCK_TYPE, type RemarkItem } from "../remarks";
import { remarksWirePart } from "../remarks-wire";

function staged(resourceId: string, remark: RemarkItem): ManagedResource {
  return {
    resourceId,
    blockType: REMARKS_BLOCK_TYPE,
    source: { remark, coalesceKey: null, label: "Comment", text: "" },
  } as unknown as ManagedResource;
}

const TARGET = { conversationId: "conv-intake", messageId: "answer-1" };

it("each item carries its resource id, in staging order", () => {
  const part = remarksWirePart([
    staged("res-a", { kind: "comment", target: TARGET, commentId: "root-7", quote: "Weigh every inbound load", body: "Truck scale?" }),
    staged("res-b", { kind: "comment", target: TARGET, commentId: null, quote: null, body: "And the floor scale?" }),
  ]);
  expect(part?.type).toBe(REMARKS_BLOCK_TYPE);
  expect(part?.items.map((item) => (item as { id?: string }).id)).toEqual(["res-a", "res-b"]);
});

it("a remark that carries nothing is dropped, and its id with it", () => {
  const part = remarksWirePart([
    staged("res-empty", { kind: "comment", target: TARGET, commentId: null, quote: null, body: "  " }),
    staged("res-b", { kind: "comment", target: TARGET, commentId: null, quote: null, body: "Floor scale drifts" }),
  ]);
  expect(part?.items).toHaveLength(1);
  expect((part?.items[0] as { id?: string }).id).toBe("res-b");
});
