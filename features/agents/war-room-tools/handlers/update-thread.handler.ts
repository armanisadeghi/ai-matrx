/**
 * `war_room_update_thread` handler — rename the tile (the room's entry for this
 * work item).
 *
 * Reuses the REAL `renameTile` war-room thunk, which persists
 * `ctx_war_room_tiles.title` via the war-room service and dispatches
 * `tileUpserted` — so the tile's header (and its editable title) updates live
 * across the gallery.
 *
 * NOTE: `ctx_war_room_tiles` has only a `title` column (no description). A
 * tile's descriptive content lives on its task/note, covered by
 * `war_room_update_task` / `war_room_update_note`. So this tool renames only.
 */

import type { WarRoomToolHandler } from "./types";
import type {
  WarRoomUpdateThreadArgs,
  WarRoomUpdateThreadResult,
} from "../tools/schemas";
import { renameThread } from "@/features/war-room/redux/thunks";
import { selectThreadById } from "@/features/war-room/redux/selectors";

export const updateThreadHandler: WarRoomToolHandler<
  WarRoomUpdateThreadArgs,
  WarRoomUpdateThreadResult
> = {
  name: "war_room_update_thread",
  async run(args, ctx) {
    const { threadId, dispatch, getState } = ctx;

    const tile = selectThreadById(threadId)(getState());
    if (!tile) {
      // access-errors: ok — browser-local Redux lookup; the tile is absent from the loaded war-room state, no record read involved
      return { ok: false, message: "Tile not found." };
    }

    await dispatch(renameThread(threadId, args.title));

    const updated = selectThreadById(threadId)(getState());
    return {
      ok: true,
      tile: { id: threadId, title: updated?.title ?? args.title },
    };
  },
};
