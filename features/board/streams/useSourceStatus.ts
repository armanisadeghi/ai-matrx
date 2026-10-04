"use client";

/**
 * Coarse live status of a stream source: phase + progress in 5% steps.
 *
 * Read only by LEAF components (a tile's status dot, its overview card), so a
 * progress tick re-renders a dot and a bar — never the tile body. Subscribing
 * higher up re-renders every tile's markdown on every step, which is how a
 * 100-stream board fell to 20 fps.
 */

import { useRef, useSyncExternalStore } from "react";
import type { PacedSource } from "./stream-source";

export type TileStatus = "idle" | "queued" | "streaming" | "complete" | "error";

export interface TileStatusValue {
  status: TileStatus;
  /** 0–1, or null when the total is unknown. */
  progress: number | null;
}

/** Where a tile's status comes from. `self`: the tile's own stream.
 * `upstream`: the stage this tile waits on — queued until it completes. */
export type StatusFrom =
  | { kind: "static"; value: TileStatusValue }
  | { kind: "self"; source: PacedSource }
  | { kind: "upstream"; source: PacedSource };

const STEPS = 20;
const noopSubscribe = () => () => {};

export function useTileStatus(
  from: StatusFrom,
  /** True while the camera is moving: the status holds still until it settles. */
  isMoving: () => boolean = () => false,
): TileStatusValue {
  const source = from.kind === "static" ? null : from.source;
  const held = useRef("idle:-1");
  const key = useSyncExternalStore(
    source ? source.subscribe : noopSubscribe,
    () => {
      if (!source) return "";
      if (isMoving()) return held.current;
      const s = source.get();
      const step = s.expected ? Math.floor((s.received / s.expected) * STEPS) : -1;
      held.current = `${s.phase}:${step}`;
      return held.current;
    },
    () => "idle:-1",
  );
  if (from.kind === "static") return from.value;
  const [phase, step] = key.split(":");
  if (from.kind === "upstream") {
    return { status: phase === "complete" ? "complete" : "queued", progress: null };
  }
  const n = Number(step);
  return {
    status: phase === "idle" ? "queued" : (phase as TileStatus),
    progress: n < 0 ? null : n / STEPS,
  };
}
