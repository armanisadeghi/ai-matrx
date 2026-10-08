"use client";

// features/meet/hooks/useMeetDefaults.ts
//
// THE PERSON'S MEETING DEFAULTS — the same values `meet_schedule_meeting`
// applies to a setting the form does not send. The three meeting rules
// (waiting room, join before host, recording policy) come from the host's
// behavior profile through `communication.meet_policy_for` (the ONE resolver,
// Meet duplicates CORE-DESIGN §4.1); AI and length are plain `meet.default_*`
// knobs. The form SHOWS them and sends only what the person changes, so an
// organization that moves its default moves every meeting its people did not
// override.

import { useEffect, useState } from "react";
import type { RecordingPolicy } from "@ai-matrx/meet/react";
import { supabase } from "@/utils/supabase/client";
import {
  PLATFORM_DEFAULT_SETTINGS,
  type DraftSettings,
} from "@/features/meet/lib/meeting-draft";

const POLICIES: readonly RecordingPolicy[] = [
  "disabled",
  "host-controlled",
  "always-on",
];

export interface MeetDefaults {
  readonly loaded: boolean;
  readonly settings: DraftSettings;
  readonly durationMinutes: number;
}

export function useMeetDefaults(
  organizationId: string | null,
  userId: string | null,
): MeetDefaults {
  const [state, setState] = useState<MeetDefaults>({
    loaded: false,
    settings: PLATFORM_DEFAULT_SETTINGS,
    durationMinutes: 60,
  });

  useEffect(() => {
    if (organizationId === null || userId === null) return undefined;
    let live = true;
    const read = (key: string) =>
      supabase
        .schema("platform")
        .rpc("knob_resolve", {
          p_feature: "meet",
          p_key: key,
          p_organization_id: organizationId,
          p_user_id: userId,
        })
        .then(({ data, error }) => (error ? undefined : data));
    const rule = (key: string) =>
      supabase
        .schema("communication")
        .rpc("meet_policy_for", {
          p_organization_id: organizationId,
          p_host_user_id: userId,
          // A meeting not yet scheduled: the 3-argument form of the door is exactly "no
          // meeting row, and the host's own profile" (hr360_meet_policy_for_before_a_meeting_exists.sql).
          p_key: key,
        })
        .then(({ data, error }) => (error ? undefined : data));
    void Promise.all([
      rule("lobby_enabled"),
      rule("join_before_host"),
      read("default_ai_enabled"),
      rule("recording_policy"),
      read("default_duration_minutes"),
    ]).then(([lobby, joinBefore, ai, policy, duration]) => {
      if (!live) return;
      const bool = (value: unknown, fallback: boolean) =>
        typeof value === "boolean" ? value : fallback;
      setState({
        loaded: true,
        settings: {
          lobbyEnabled: bool(lobby, PLATFORM_DEFAULT_SETTINGS.lobbyEnabled),
          joinBeforeHost: bool(
            joinBefore,
            PLATFORM_DEFAULT_SETTINGS.joinBeforeHost,
          ),
          aiEnabled: bool(ai, PLATFORM_DEFAULT_SETTINGS.aiEnabled),
          recordingPolicy: POLICIES.includes(policy as RecordingPolicy)
            ? (policy as RecordingPolicy)
            : PLATFORM_DEFAULT_SETTINGS.recordingPolicy,
        },
        durationMinutes:
          typeof duration === "number" && duration > 0 ? duration : 60,
      });
    });
    return () => {
      live = false;
    };
  }, [organizationId, userId]);

  return state;
}
