"use client";

/**
 * Which builder an agent-creating door uses — its Feature Knob
 * `agent_factory.door_<door>` (`legacy` | `pipeline`, REGISTER R33), resolved for this
 * person in their active organization (`platform.knob_resolve`, org → user, nearest wins).
 * `pipeline` = an Agent Factory build through the server (BuildProgress); anything else,
 * including "not answered yet", keeps today's builder.
 *
 * DEV-ONLY LOCAL OVERRIDE: outside production a browser may force a door with
 * `localStorage["matrx.dev.agent_factory.door_<door>"] = "pipeline" | "legacy"`, so the
 * pipeline screen can be checked on localhost without writing a live knob row. A
 * production build never reads it.
 */

import { useEffect, useState } from "react";
import { resolveSessionKnob, useSessionKnob } from "@/lib/scoped-config/sessionKnob";

export type FactoryDoor = "from_chat" | "mandate_holder_draft" | "generate";
export type BuildPath = "legacy" | "pipeline";

export const DEV_DOOR_OVERRIDE_PREFIX = "matrx.dev.agent_factory.door_";

export function asBuildPath(value: unknown): BuildPath {
  return value === "pipeline" ? "pipeline" : "legacy";
}

export function devDoorOverride(door: FactoryDoor): BuildPath | null {
  if (process.env.NODE_ENV === "production" || typeof window === "undefined") return null;
  const value = window.localStorage.getItem(`${DEV_DOOR_OVERRIDE_PREFIX}${door}`);
  return value === "pipeline" || value === "legacy" ? value : null;
}

function knobRef(door: FactoryDoor) {
  return { feature: "agent_factory", key: `door_${door}` };
}

/** React: this door's path for the signed-in person; `legacy` until the knob answers. */
export function useFactoryDoor(door: FactoryDoor): BuildPath {
  const value = useSessionKnob(knobRef(door));
  const [override, setOverride] = useState<BuildPath | null>(null);
  useEffect(() => {
    setOverride(devDoorOverride(door));
  }, [door]);
  return override ?? asBuildPath(value);
}

/** Awaited: this door's path for the signed-in person. */
export async function resolveFactoryDoor(door: FactoryDoor): Promise<BuildPath> {
  return devDoorOverride(door) ?? asBuildPath(await resolveSessionKnob(knobRef(door)));
}
