/**
 * The Press Room — which load state the route asks for.
 *
 * Deliberately NOT in `usePressRoom.ts`: that module is `"use client"`, and a
 * Server Component may not CALL a function imported from a client module (it
 * only receives a client reference). The route parses `?data=` on the server,
 * so the parser has to live in a module both sides may execute.
 */

export type PressRoomScenario = "ready" | "empty" | "error" | "stalled";

export const PRESS_ROOM_SCENARIOS: readonly PressRoomScenario[] = [
  "ready",
  "empty",
  "error",
  "stalled",
] as const;

export function parseScenario(value: string | null): PressRoomScenario {
  return PRESS_ROOM_SCENARIOS.includes(value as PressRoomScenario)
    ? (value as PressRoomScenario)
    : "ready";
}
