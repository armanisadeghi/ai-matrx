/**
 * Surface manifest — War Room Thread (`matrx-user/war-room-thread`).
 *
 * The agent panel of ONE War Room thread (tile). It IS a real chat — the thread
 * agent's conversation drives the working document, scratchpad, and context rail
 * exactly like `matrx-user/chat`, which this surface parents to (the parent link
 * is set on the `ui_surface` row; the manifest sync only writes values + roles).
 * War-room-specific: the default Thread Agent and dictionary support
 * (terminology / pronunciation layered into the agent).
 *
 * The thread agent ID is hardcoded here (matching the `transcripts-cleanup`
 * pattern) — it mirrors `WAR_ROOM_THREAD_AGENT_ID` in `features/war-room/constants`.
 */

import type { SurfaceManifest, SurfaceValue } from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

// = WAR_ROOM_THREAD_AGENT_ID (features/war-room/constants.ts)
const WAR_ROOM_THREAD_AGENT_ID = "3153a326-5e0c-4c31-841d-52e8c5e9c39c";

const surfaceSpecific: SurfaceValue[] = [
  {
    name: "thread_id",
    label: "Thread ID",
    description:
      "UUID of the War Room thread (tile) the agent is acting in. Empty when no thread is active.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 300,
  },
  {
    name: "room_name",
    label: "Room name",
    description: "Title of the War Room (session) the active thread belongs to.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 60,
    sortOrder: 310,
  },
  {
    name: "thread_anchor",
    label: "Thread anchor",
    description:
      "The thread's primary subject — a task title, a project name, or 'canvas' for a free-form thread.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 80,
    sortOrder: 320,
  },
];

export const warRoomThreadManifest: SurfaceManifest = {
  surfaceName: "matrx-user/war-room-thread",
  values: mergeBaselineValues(
    pickBaseline("selection", "text_before", "text_after", "content", "context"),
    surfaceSpecific,
  ),
  agentRoles: [
    {
      name: "thread",
      label: "Thread agent",
      description:
        "The dedicated agent for one War Room thread — reads the thread's attached notes / tasks / files SERVER-SIDE, edits the working document and scratchpad in place, and helps the user in this thread.",
      kind: "single",
      defaultAgentId: WAR_ROOM_THREAD_AGENT_ID,
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
        "Custom terminology + pronunciations layered into the thread agent (org + user).",
    },
  ],
};
