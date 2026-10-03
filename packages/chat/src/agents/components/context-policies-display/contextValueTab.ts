"use client";

/**
 * One context value a SENT message carried, as its conversation's ONE canvas
 * tab (`context-value`). The tab's data is the frozen snapshot as plain JSON —
 * a sent turn never shows today's value — plus `selected`, the value on screen
 * (its key and a hash of the snapshot, so the same key sent twice with two
 * values is two different selections). A chip press shows its value; pressing
 * the chip of the value already in front closes the tab.
 */

import type { CanvasJson } from "@ai-matrx/canvas";
import { useChatCanvasTab } from "../../../host/canvas";
import { CONTEXT_VALUE_KIND } from "../../../host/canvas-tabs";
import type { ContextObjectType } from "../../types/agent-api-types";

export interface ContextValueSnapshot {
  conversationId: string;
  agentId: string | null;
  contextKey: string;
  snapshotValue?: unknown;
  snapshotLabel?: string;
  snapshotType?: ContextObjectType;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The value round-tripped through JSON (a non-JSON value becomes null). */
function toJson(value: unknown): CanvasJson {
  if (value === undefined) return null;
  try {
    return JSON.parse(JSON.stringify(value)) as CanvasJson;
  } catch {
    return null;
  }
}

/** The selection id of one snapshot: its key plus a hash of what was sent. */
export function contextValueSelection(snapshot: ContextValueSnapshot): string {
  const text = JSON.stringify([snapshot.snapshotValue ?? null, snapshot.snapshotLabel ?? null]);
  let hash = 5381;
  for (let i = 0; i < text.length; i += 1) hash = ((hash * 33) ^ text.charCodeAt(i)) >>> 0;
  return `${snapshot.contextKey}#${hash.toString(36)}`;
}

export function contextValueToTabData(snapshot: ContextValueSnapshot): Record<string, CanvasJson> {
  return {
    conversationId: snapshot.conversationId,
    agentId: snapshot.agentId,
    contextKey: snapshot.contextKey,
    snapshotValue: toJson(snapshot.snapshotValue),
    snapshotLabel: snapshot.snapshotLabel ?? null,
    snapshotType: snapshot.snapshotType ?? null,
  };
}

/** The snapshot a tab shows, or null when its data names none. */
export function readContextValueTab(data: CanvasJson | undefined | null): ContextValueSnapshot | null {
  if (!isRecord(data)) return null;
  const { conversationId, agentId, contextKey, snapshotValue, snapshotLabel, snapshotType } = data;
  if (typeof conversationId !== "string" || typeof contextKey !== "string" || !contextKey) return null;
  return {
    conversationId,
    agentId: typeof agentId === "string" ? agentId : null,
    contextKey,
    snapshotValue: snapshotValue ?? undefined,
    snapshotLabel: typeof snapshotLabel === "string" ? snapshotLabel : undefined,
    snapshotType: typeof snapshotType === "string" ? (snapshotType as ContextObjectType) : undefined,
  };
}

/**
 * A conversation's context-value tab: `open(snapshot, title)` shows that value
 * (pressing the value already in front closes the tab); `isShowing(snapshot)`
 * is a chip's pressed state.
 */
export function useContextValueTab(conversationId: string) {
  const tab = useChatCanvasTab({ kind: CONTEXT_VALUE_KIND, key: conversationId });
  return {
    isShowing: (snapshot: ContextValueSnapshot) => tab.isVisible && tab.selected === contextValueSelection(snapshot),
    open: (snapshot: ContextValueSnapshot, title: string) => {
      tab.toggle({
        title,
        data: contextValueToTabData(snapshot),
        selected: contextValueSelection(snapshot),
        replaceData: true,
      });
    },
  };
}
