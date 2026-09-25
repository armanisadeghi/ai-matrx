// features/war-room/intelligence-places.ts
//
// WHERE EACH WAR ROOM JOB RUNS — drawn on /intelligence/war_room.
// Proved against the files named below by
// features/mandates/feature-intelligence/__tests__/declared-places.test.ts.

import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";
import type { FeaturePlaces } from "@/features/mandates/feature-intelligence/types";
import {
  WAR_ROOM_MASTER_AGENT_MANDATE,
  WAR_ROOM_ROOM_AGENT_MANDATE,
  WAR_ROOM_THREAD_AGENT_MANDATE,
} from "./constants";

const K = MANDATE_KEYS;

export const WAR_ROOM_PLACES: FeaturePlaces = {
  feature: "war_room",
  label: "War Room",
  aliases: {
    WAR_ROOM_MASTER_AGENT_MANDATE,
    WAR_ROOM_ROOM_AGENT_MANDATE,
    WAR_ROOM_THREAD_AGENT_MANDATE,
  },
  roots: ["features/war-room", "app/(core)/war-room"],
  places: [
    {
      id: "master",
      label: "All rooms",
      trigger: "Master Agent button",
      urlPattern: "/war-room/all",
      mandateKeys: [K.war_room__master],
      sources: [
        "features/war-room/components/master/MasterAgentPanel.tsx",
        "features/war-room/hooks/useMasterAgent.ts",
      ],
    },
    {
      id: "room",
      label: "A room",
      trigger: "Room Agent button",
      urlPattern: "/war-room/[id]",
      mandateKeys: [K.war_room__room],
      sources: [
        "features/war-room/components/room/RoomAgentPanel.tsx",
        "features/war-room/hooks/useRoomAgent.ts",
      ],
    },
    {
      id: "thread",
      label: "A thread",
      trigger: "Thread agent tab",
      urlPattern: "/war-room/[id]",
      mandateKeys: [K.war_room__thread],
      sources: [
        "features/war-room/components/thread/ThreadAgentTab.tsx",
        "features/war-room/components/thread/ThreadAgentPanel.tsx",
      ],
    },
    {
      id: "admin",
      label: "War Room admin",
      trigger: "Agent map",
      urlPattern: "/war-room/admin",
      mandateKeys: [K.war_room__master, K.war_room__room],
      sources: ["app/(core)/war-room/admin/page.tsx"],
    },
  ],
};
