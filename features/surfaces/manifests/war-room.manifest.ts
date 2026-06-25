/**
 * Surface manifest — War Room (`matrx-user/war-room`).
 *
 * The room-level agent — spans every thread in one War Room (session), aware of
 * all of its threads and their attached resources, helping the user across the
 * whole room. Like the thread surface it is a real chat (parents to
 * `matrx-user/chat` via the `ui_surface` row) with dictionary support.
 *
 * The room agent ID is hardcoded here (matching the `transcripts-cleanup`
 * pattern) — it mirrors `WAR_ROOM_ROOM_AGENT_ID` in `features/war-room/constants`.
 */

import type { SurfaceManifest, SurfaceValue } from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

// = WAR_ROOM_ROOM_AGENT_ID (features/war-room/constants.ts)
const WAR_ROOM_ROOM_AGENT_ID = "7239e128-2a07-4d68-8292-0f530be6f754";

const surfaceSpecific: SurfaceValue[] = [
  {
    name: "room_id",
    label: "Room ID",
    description:
      "UUID of the War Room (session) the agent is acting in. Empty when no room is active.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 300,
  },
  {
    name: "room_name",
    label: "Room name",
    description: "Title of the War Room (session).",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 60,
    sortOrder: 310,
  },
];

export const warRoomManifest: SurfaceManifest = {
  surfaceName: "matrx-user/war-room",
  values: mergeBaselineValues(
    pickBaseline("selection", "text_before", "text_after", "content", "context"),
    surfaceSpecific,
  ),
  agentRoles: [
    {
      name: "room",
      label: "Room agent",
      description:
        "The room-spanning agent for a whole War Room — aware of every thread and its attachments, helping the user reason across the room.",
      kind: "single",
      defaultAgentId: WAR_ROOM_ROOM_AGENT_ID,
      allowCustom: true,
      autoRun: "never",
      sortOrder: 10,
    },
  ],
  configNamespaces: [
    {
      namespace: "dictionary",
      label: "Dictionary",
      description:
        "Custom terminology + pronunciations layered into the room agent (org + user).",
    },
  ],
};
