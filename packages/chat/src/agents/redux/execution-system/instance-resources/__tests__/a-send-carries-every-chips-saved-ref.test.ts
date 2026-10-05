/**
 * A send frozen before a chip's first save returned its row picks the ref up
 * after the flush, so the server marks the chip sent and it cannot return after reload.
 * Use case: Dana adds a note and presses Enter inside the save delay.
 */
import type { ManagedResource } from "../../../../types/instance.types";
import { REMARKS_BLOCK_TYPE, type RemarkItem } from "../remarks";
import { remarksWirePart, withFreshRemarkRefs } from "../remarks-wire";

const item = (ref?: { id: string; stateVersion: number }): RemarkItem => ({
  kind: "comment",
  target: { conversationId: "c", messageId: "answer-1" },
  commentId: null,
  quote: "Weigh every inbound load",
  body: "Truck scale?",
  ...(ref ? { blockStateRef: ref } : {}),
});
const resource = (remark: RemarkItem) =>
  ({ resourceId: "res-a", blockType: REMARKS_BLOCK_TYPE, source: { remark, coalesceKey: null, label: "Comment", text: "" } }) as unknown as ManagedResource;

it("the frozen part has no ref; after the flush it carries the saved one", () => {
  const frozen = { resources: [remarksWirePart([resource(item())])!] };
  expect(JSON.stringify(frozen)).not.toContain("block_state_ref");
  const live = { "res-a": resource(item({ id: "row-1", stateVersion: 2 })) };
  const fresh = withFreshRemarkRefs(frozen, live);
  expect(JSON.stringify(fresh)).toContain('"block_state_ref":{"id":"row-1","state_version":2}');
});
