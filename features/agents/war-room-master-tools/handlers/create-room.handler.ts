/**
 * `war_room_create_room` handler — create a new War Room (session).
 *
 * Reuses the REAL `createWarRoomSession` war-room thunk, which persists a
 * `ctx_war_room_sessions` row via the service and dispatches `sessionUpserted` —
 * so the new room appears live in the /all gallery the master is sitting on.
 * Runs immediately (notify-and-watch model; no approval pause).
 */

import type { WarRoomMasterToolHandler } from "./types";
import type {
  WarRoomCreateRoomArgs,
  WarRoomCreateRoomResult,
} from "../tools/schemas";
import { createWarRoomSession } from "@/features/war-room/redux/thunks";

export const createRoomHandler: WarRoomMasterToolHandler<
  WarRoomCreateRoomArgs,
  WarRoomCreateRoomResult
> = {
  name: "war_room_create_room",
  async run(args, ctx) {
    const { dispatch } = ctx;

    const session = await dispatch(
      createWarRoomSession({
        title: args.title,
        description: args.description ?? null,
      }),
    );

    if (!session) {
      return { ok: false, message: "Couldn't create the War Room." };
    }

    return {
      ok: true,
      room: { id: session.id, title: session.title },
    };
  },
};
