"use client";

/**
 * One person's acquisition journey (arrival → activity → verdict) as a canvas
 * tab (`user-journey`), keyed by the acquisition row id. Light: registers at
 * boot, the body loads only when a tab renders. The journey is read again from
 * the server each time the tab renders, so the tab comes back after a reload.
 */

import { Route } from "lucide-react";
import type { CanvasOpenInput } from "@ai-matrx/canvas";
import { defineCanvasKind, type AnyCanvasKind } from "@ai-matrx/canvas/react";

export const USER_JOURNEY_KIND = "user-journey";

export type UserJourneyData = {
  /** The acquisition row id (`/api/admin/users/acquisition/<rowId>`). */
  rowId: string;
  /** The person's display name, for the tab title. */
  name: string;
};

export function userJourneyOpenInput(data: UserJourneyData): CanvasOpenInput {
  return { kind: USER_JOURNEY_KIND, key: data.rowId, title: data.name, data };
}

export function readUserJourneyData(data: unknown): UserJourneyData | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const { rowId, name } = data as Record<string, unknown>;
  if (typeof rowId !== "string" || !rowId) return null;
  return { rowId, name: typeof name === "string" && name ? name : "Journey" };
}

export const USER_JOURNEY_CANVAS_KIND: AnyCanvasKind = defineCanvasKind<UserJourneyData>({
  id: USER_JOURNEY_KIND,
  surface: "dom",
  label: "Journey",
  icon: Route,
  load: () => import("./UserJourneyCanvasView"),
  title: (data) => data.name,
  restore: true,
});
