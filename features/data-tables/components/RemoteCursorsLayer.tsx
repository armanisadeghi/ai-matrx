/**
 * RemoteCursorsLayer — renders a small colored chip per remote peer in the
 * workbook. v1 scope: presence + name + cursor-row/col text, NOT pixel-
 * positioned overlay rings.
 *
 * Why no pixel positioning yet: Univer's facade exposes
 * `worksheet.onSelectionChange(...)` for sending our cursor, but the inverse
 * — translating a remote peer's (sheetId, row, col) to a CSS pixel position
 * inside our viewport — requires Univer's render engine + the live scroll
 * offset + freeze configuration. That's a follow-up to v1; for now we render
 * a small "X is editing B12" panel pinned to the editor toolbar, which gives
 * the presence + "they're not editing where I am" signal without the
 * positioning complexity.
 *
 * The component takes a `Map<clientId, AwarenessState>` and renders one chip
 * per state. Stale states (ts older than 30s) are filtered out — Awareness
 * normally cleans them up itself but we belt-and-suspender against network
 * gaps.
 */
"use client";

import { useMemo } from "react";
import { UsersRound } from "lucide-react";

import type { AwarenessState } from "../collab/types";

type Props = {
  states: Map<number, AwarenessState>;
  selfUid: string;
};

const STALE_AFTER_MS = 30_000;

const CELL_INDEX_TO_LETTER = (col: number): string => {
  // Excel-style column letters: 0→A, 25→Z, 26→AA, etc.
  let out = "";
  let n = col;
  while (n >= 0) {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  }
  return out || "A";
};

export function RemoteCursorsLayer({ states, selfUid }: Props) {
  const remotePeers = useMemo(() => {
    const now = Date.now();
    const out: AwarenessState[] = [];
    states.forEach((s) => {
      if (s.uid === selfUid) return;
      if (now - s.ts > STALE_AFTER_MS) return;
      out.push(s);
    });
    // Sort by name so the order is stable across renders.
    out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  }, [states, selfUid]);

  if (remotePeers.length === 0) return null;

  return (
    <div className="flex items-center gap-2 text-xs">
      <UsersRound className="size-3 text-muted-foreground" />
      <div className="flex flex-wrap gap-1">
        {remotePeers.map((p) => (
          <span
            key={p.uid}
            title={cursorTitle(p)}
            className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5"
            style={{
              borderColor: p.color,
              backgroundColor: `${p.color}1a`, // 10% alpha
              color: p.color,
            }}
          >
            <span
              className="size-1.5 rounded-full"
              style={{ backgroundColor: p.color }}
            />
            <span className="font-medium">{p.name}</span>
            {p.row !== null && p.col !== null && (
              <span className="opacity-70">
                {CELL_INDEX_TO_LETTER(p.col)}
                {p.row + 1}
              </span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

function cursorTitle(s: AwarenessState): string {
  if (s.row !== null && s.col !== null) {
    return `${s.name} is at ${CELL_INDEX_TO_LETTER(s.col)}${s.row + 1}`;
  }
  return s.name;
}
