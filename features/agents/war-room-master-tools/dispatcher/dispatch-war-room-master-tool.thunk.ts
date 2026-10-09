/**
 * dispatchWarRoomMasterTool — the cross-room MASTER agent's tools, NOTIFY-AND-
 * WATCH rather than approve-each: read / create / rename / message all run
 * WITHOUT a pre-approval pause (messaging a thread also opens a live-watch
 * window + toast inside its handler so the user SEES the run). The per-tile
 * war-room tools, by contrast, HITL-gate every write (`dispatchWarRoomTool`).
 *
 * Unlike the per-tile dispatcher we do NOT flip the instance to `paused`: the
 * tool runs, the result posts, the loop resumes. The shared behaviour (Zod
 * validation, handler run, the single result funnel) lives in the chat
 * package's `createNotifyAndPlayDispatcher`; this file only names the family.
 */

import type { RootState } from "@/lib/redux/store";
import {
  createNotifyAndPlayDispatcher,
  type NotifyAndPlayPayload,
} from "@ai-matrx/chat/agents/redux/execution-system/thunks/notify-and-play-dispatcher";
import { getWarRoomMasterToolEntry } from "../tools/registry";
import { isWarRoomMasterToolName } from "../tools/names";

export type DispatchWarRoomMasterToolPayload = NotifyAndPlayPayload;

export const dispatchWarRoomMasterTool = createNotifyAndPlayDispatcher<RootState>({
  typePrefix: "warRoomMasterTools/dispatch",
  family: "war-room master",
  isToolName: isWarRoomMasterToolName,
  getEntry: getWarRoomMasterToolEntry,
});
