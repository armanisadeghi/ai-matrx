// features/block-state/redux/blockChipThunk.ts
//
// A chip that belongs to a block is DERIVED from the block's saved state: it
// shows exactly while state_version > sent_version and the person has not
// dismissed it at that version. So it follows the person across devices and
// clears everywhere when the message is sent.

import type { AppDispatch, RootState } from "@/lib/redux/store";
import {
  stageRemark,
  unstageRemark,
  remarkSourceOf,
  type RemarkItem,
} from "@ai-matrx/chat/agents/redux/execution-system/instance-resources/remarks";
import { remarksAutoIncludeEnabled } from "@ai-matrx/chat/agents/redux/execution-system/instance-resources/remark-knob";
import type { ChatRootState } from "@ai-matrx/chat/store/root-state";
import { isChipDue, type BlockStateRow } from "../types";

export function blockChipKey(row: Pick<BlockStateRow, "entity_type" | "entity_id" | "block_key">): string {
  return `blockstate:${row.entity_type}:${row.entity_id}:${row.block_key}`;
}

/** Was a chip for this row at this version already part of a message this device sent? */
function alreadySent(state: ChatRootState, conversationId: string, row: BlockStateRow): boolean {
  const resources = state.instanceResources.byConversationId[conversationId] ?? {};
  const submitted = new Set(state.instanceResources.submittedIds[conversationId] ?? []);
  for (const resourceId of submitted) {
    const resource = resources[resourceId];
    const ref = resource ? remarkSourceOf(resource)?.remark.blockStateRef : null;
    if (ref && ref.id === row.id && ref.stateVersion >= row.state_version) return true;
  }
  return false;
}

/** Stage, update or remove this block's chip from its saved row. */
export function syncBlockChip(args: {
  conversationId: string;
  row: BlockStateRow | undefined;
  build: (state: Record<string, unknown>) => RemarkItem | null;
}) {
  return async (dispatch: AppDispatch, getState: () => RootState): Promise<void> => {
    const { conversationId, row, build } = args;
    if (!row) return;
    const key = blockChipKey(row);
    const remark = isChipDue(row) ? build(row.state) : null;
    if (!remark) {
      dispatch(unstageRemark(conversationId, key, { retire: false }));
      return;
    }
    if (alreadySent(getState() as unknown as ChatRootState, conversationId, row)) return;
    if (!(await remarksAutoIncludeEnabled(getState as unknown as () => ChatRootState))) return;
    dispatch(
      stageRemark(
        conversationId,
        { ...remark, blockStateRef: { id: row.id, stateVersion: row.state_version } },
        { coalesceKey: key },
      ),
    );
  };
}
