/**
 * `war_room_rename_room` handler — rename a War Room (session).
 *
 * Reuses the REAL `renameSession` war-room thunk, which persists
 * `ctx_war_room_sessions.title` via the service and dispatches `sessionUpserted`
 * — so the room's name updates live in the /all gallery and anywhere else it
 * renders. Runs immediately (notify-and-watch model; no approval pause).
 *
 * Resolves the room from Redux to confirm it exists + visible before/after the
 * rename and to return the persisted title. An unknown room id is a clean
 * `ok:false`, never a throw.
 */

import type { WarRoomMasterToolHandler } from "./types";
import type {
  WarRoomRenameRoomArgs,
  WarRoomRenameRoomResult,
} from "../tools/schemas";
import { renameSession } from "@/features/war-room/redux/thunks";
import { selectSessionById } from "@/features/war-room/redux/selectors";

export const renameRoomHandler: WarRoomMasterToolHandler<
  WarRoomRenameRoomArgs,
  WarRoomRenameRoomResult
> = {
  name: "war_room_rename_room",
  async run(args, ctx) {
    const { dispatch, getState } = ctx;

    await dispatch(renameSession(args.room_id, args.title));

    const updated = selectSessionById(args.room_id)(getState());
    if (!updated) {
      // renameSession swallows its own error with a toast; if the room isn't in
      // Redux afterwards, report it cleanly so the master doesn't assume success.
      return {
        ok: false,
        message:
          "Couldn't rename — no room with that id is loaded. Use a room_id " +
          "from war_room.",
      };
    }

    return {
      ok: true,
      room: { id: updated.id, title: updated.title },
    };
  },
};
