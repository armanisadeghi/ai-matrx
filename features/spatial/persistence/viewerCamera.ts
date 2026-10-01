// features/spatial/persistence/viewerCamera.ts
//
// Where each person last looked at each board — a VIEW preference, not board
// content (Figma, Miro: your viewport is yours; a collaborator panning never
// moves it or conflicts with your edits). Kept per person per board in this
// browser; the `#cam=` address carries it across a reload or a shared link.
// Storage can be absent or throw (private window, blocked site data): every
// read and write is guarded, and a missing value only means the board opens
// to fit everything.

import type { Camera } from "../engine/camera";

const PREFIX = "matrx.board.camera";

export function viewerCameraKey(userId: string, boardId: string): string {
  return `${PREFIX}:${userId}:${boardId}`;
}

function isCamera(v: unknown): v is Camera {
  if (typeof v !== "object" || v === null) return false;
  const c = v as Record<string, unknown>;
  return [c.x, c.y, c.z].every((n) => typeof n === "number" && Number.isFinite(n)) && (c.z as number) > 0;
}

/** This person's last view of this board in this browser, or null. */
export function readViewerCamera(userId: string, boardId: string): Camera | null {
  try {
    const raw = window.localStorage.getItem(viewerCameraKey(userId, boardId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isCamera(parsed) ? { x: parsed.x, y: parsed.y, z: parsed.z } : null;
  } catch {
    return null;
  }
}

export function writeViewerCamera(userId: string, boardId: string, camera: Camera): void {
  try {
    window.localStorage.setItem(
      viewerCameraKey(userId, boardId),
      JSON.stringify({ x: Math.round(camera.x * 100) / 100, y: Math.round(camera.y * 100) / 100, z: camera.z }),
    );
  } catch {
    // Storage unavailable: the board still opens (fit all, or the address's #cam=).
  }
}
