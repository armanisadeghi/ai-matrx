/**
 * `war_room_update_tile` handler — rename the tile (the room's entry for this
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
  WarRoomUpdateTileArgs,
  WarRoomUpdateTileResult,
} from "../tools/schemas";
import { renameTile } from "@/features/war-room/redux/thunks";
import { selectTileById } from "@/features/war-room/redux/selectors";

export const updateTileHandler: WarRoomToolHandler<
  WarRoomUpdateTileArgs,
  WarRoomUpdateTileResult
> = {
  name: "war_room_update_tile",
  async run(args, ctx) {
    const { tileId, dispatch, getState } = ctx;

    const tile = selectTileById(tileId)(getState());
    if (!tile) {
      return { ok: false, message: "Tile not found." };
    }

    await dispatch(renameTile(tileId, args.title));

    const updated = selectTileById(tileId)(getState());
    return {
      ok: true,
      tile: { id: tileId, title: updated?.title ?? args.title },
    };
  },
};
