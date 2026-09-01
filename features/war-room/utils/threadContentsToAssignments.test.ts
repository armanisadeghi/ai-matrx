import { mapThreadContentsToAssignments } from "./threadContentsToAssignments";
import type { ThreadContentModule } from "../types";

const THREAD_ID = "11111111-1111-4111-8111-111111111111";
const NOTE_ID = "22222222-2222-4222-8222-222222222222";

describe("mapThreadContentsToAssignments", () => {
  it("deduplicates a direct and anchor-inherited edge for the same entity", () => {
    const modules: ThreadContentModule[] = [
      {
        module_type: "note",
        module_id: NOTE_ID,
        origin: "anchor",
        anchor_type: "task",
        anchor_id: "33333333-3333-4333-8333-333333333333",
        label: "Anchor label",
        metadata: null,
      },
      {
        module_type: "note",
        module_id: NOTE_ID,
        origin: "thread",
        anchor_type: "",
        anchor_id: "",
        label: "Direct label",
        metadata: { is_active: true, position: 7 },
      },
    ];

    const result = mapThreadContentsToAssignments(THREAD_ID, modules);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      entity_type: "note",
      entity_id: NOTE_ID,
      label: "Direct label",
      is_active: true,
      position: 7,
      metadata: expect.objectContaining({ origin: "thread" }),
    });
  });
});
