"use client";

/**
 * A guest's board for one meeting. A guest has no account, so there is no
 * saved-board row to keep it in (`workspace.spatial_boards` is per person);
 * the same board DOCUMENT a signed-in viewer saves is kept in this browser
 * instead, under the meeting, and opens again on the next visit. Blocked
 * storage means this visit only.
 */

import { useEffect, useRef, useState } from "react";
import type { Camera } from "@/features/spatial/engine/camera";
import {
  parseBoardDocument,
  serializeBoardDocument,
  type BoardDocument,
} from "@/features/spatial/board/document";

const SAVE_DELAY_MS = 600;

export const guestBoardKey = (meetingId: string) => `matrx.meet.board.v2.${meetingId}`;
const cameraKey = (meetingId: string) => `matrx.meet.board.v2.${meetingId}.camera`;

/** The kept document, or `fresh` when there is none or it cannot be read. Exported for tests. */
export function readGuestBoard(meetingId: string, fresh: () => BoardDocument): BoardDocument {
  try {
    const raw = window.localStorage.getItem(guestBoardKey(meetingId));
    if (!raw) return fresh();
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return fresh();
    const { camera, nodes, edges } = parsed as { camera?: unknown; nodes?: unknown; edges?: unknown };
    return parseBoardDocument({ camera, nodes, edges }).doc;
  } catch {
    return fresh();
  }
}

export function writeGuestBoard(meetingId: string, doc: BoardDocument): void {
  try {
    window.localStorage.setItem(guestBoardKey(meetingId), JSON.stringify(serializeBoardDocument(doc)));
  } catch {
    // Storage blocked: the board lasts for this visit.
  }
}

function readCamera(meetingId: string): Camera | null {
  try {
    const raw = window.localStorage.getItem(cameraKey(meetingId));
    if (!raw) return null;
    const c = JSON.parse(raw) as Partial<Camera>;
    return [c.x, c.y, c.z].every((n) => typeof n === "number" && Number.isFinite(n)) && (c.z ?? 0) > 0
      ? (c as Camera)
      : null;
  } catch {
    return null;
  }
}

export function useGuestMeetingBoard(meetingId: string, fresh: () => BoardDocument) {
  const [opened] = useState(() => ({ doc: readGuestBoard(meetingId, fresh), camera: readCamera(meetingId) }));
  const pending = useRef<(() => BoardDocument) | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const build = pending.current;
    pending.current = null;
    if (build) writeGuestBoard(meetingId, build());
  };
  const flushRef = useRef(flush);
  useEffect(() => {
    flushRef.current = flush;
  });
  useEffect(() => {
    const now = () => flushRef.current();
    window.addEventListener("pagehide", now);
    return () => {
      window.removeEventListener("pagehide", now);
      now();
    };
  }, []);

  const save = (build: () => BoardDocument) => {
    pending.current = build;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => flushRef.current(), SAVE_DELAY_MS);
  };
  const saveCamera = (camera: Camera) => {
    try {
      window.localStorage.setItem(cameraKey(meetingId), JSON.stringify(camera));
    } catch {
      // Storage blocked: the view lasts for this visit.
    }
  };
  return { doc: opened.doc, viewerCamera: opened.camera, save, saveCamera };
}
