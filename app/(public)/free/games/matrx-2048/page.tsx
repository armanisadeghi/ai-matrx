// page.tsx — Matrx 2048
'use client';

import React, { useRef } from 'react';
import { RotateCcw, Undo2 } from 'lucide-react';
import { use2048 } from './hooks/use2048';
import { tileStyle, offsetPct, CELL_PCT, MOVE_ANIMATION_MS } from './constants';
import type { Direction, Tile } from './logic';

const SWIPE_THRESHOLD = 24; // px before a drag counts as a swipe

const KEYFRAMES = `
@keyframes mtx2048-pop-in { 0% { transform: scale(0.2); opacity: 0; } 60% { opacity: 1; } 100% { transform: scale(1); opacity: 1; } }
@keyframes mtx2048-merge { 0% { transform: scale(1); } 50% { transform: scale(1.18); } 100% { transform: scale(1); } }
`;

function TileView({ tile, ghost }: { tile: Tile; ghost?: boolean }) {
    const style = tileStyle(tile.value);
    return (
        <div
            className="absolute"
            style={{
                left: `${offsetPct(tile.col)}%`,
                top: `${offsetPct(tile.row)}%`,
                width: `${CELL_PCT}%`,
                height: `${CELL_PCT}%`,
                transition: `left ${MOVE_ANIMATION_MS}ms ease, top ${MOVE_ANIMATION_MS}ms ease`,
                zIndex: ghost ? 1 : tile.isMerged ? 20 : 10,
            }}
        >
            <div
                className="flex h-full w-full items-center justify-center rounded-[12%] font-bold tabular-nums"
                style={{
                    background: style.bg,
                    color: style.text,
                    fontSize: `${(style.fontScale * CELL_PCT).toFixed(2)}cqi`,
                    boxShadow: style.glow ? `0 0 18px ${style.bg}aa` : undefined,
                    animation: tile.isNew
                        ? 'mtx2048-pop-in 140ms ease'
                        : tile.isMerged
                          ? 'mtx2048-merge 140ms ease'
                          : undefined,
                }}
            >
                {tile.value}
            </div>
        </div>
    );
}

function StatBox({ label, value }: { label: string; value: number }) {
    return (
        <div className="flex min-w-[72px] flex-col items-center rounded-lg bg-muted px-3 py-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
            <span className="text-xl font-bold tabular-nums text-foreground">{value}</span>
        </div>
    );
}

export default function Game2048Page() {
    const { tiles, ghosts, score, best, status, canUndo, newGame, undo, move, continueAfterWin } = use2048();
    const swipeStart = useRef<{ x: number; y: number } | null>(null);

    const onPointerDown = (e: React.PointerEvent) => {
        swipeStart.current = { x: e.clientX, y: e.clientY };
    };
    const onPointerUp = (e: React.PointerEvent) => {
        const start = swipeStart.current;
        swipeStart.current = null;
        if (!start) return;
        const dx = e.clientX - start.x;
        const dy = e.clientY - start.y;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_THRESHOLD) return;
        let dir: Direction;
        if (Math.abs(dx) > Math.abs(dy)) dir = dx > 0 ? 'right' : 'left';
        else dir = dy > 0 ? 'down' : 'up';
        move(dir);
    };

    return (
        <div className="min-h-dvh bg-textured flex flex-col items-center justify-center gap-4 p-4">
            <style>{KEYFRAMES}</style>

            <div className="w-full max-w-md">
                <div className="mb-3 flex items-end justify-between gap-4">
                    <div>
                        <h1 className="text-4xl font-extrabold leading-none tracking-tight text-foreground">2048</h1>
                        <p className="mt-1 text-sm text-muted-foreground">Join the tiles, reach 2048</p>
                    </div>
                    <div className="flex gap-2">
                        <StatBox label="Score" value={score} />
                        <StatBox label="Best" value={best} />
                    </div>
                </div>

                <div className="mb-3 flex items-center justify-between gap-2">
                    <p className="text-sm text-muted-foreground">Swipe or use arrow keys</p>
                    <div className="flex gap-2">
                        <button
                            onClick={undo}
                            disabled={!canUndo}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            <Undo2 size={15} />
                            Undo
                        </button>
                        <button
                            onClick={newGame}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                        >
                            <RotateCcw size={15} />
                            New Game
                        </button>
                    </div>
                </div>

                <div
                    onPointerDown={onPointerDown}
                    onPointerUp={onPointerUp}
                    className="relative aspect-square w-full touch-none select-none rounded-xl bg-muted"
                    style={{ containerType: 'inline-size' }}
                >
                    {/* Background cells */}
                    {Array.from({ length: 16 }).map((_, i) => {
                        const row = Math.floor(i / 4);
                        const col = i % 4;
                        return (
                            <div
                                key={`bg-${i}`}
                                className="absolute rounded-[12%] bg-background/60"
                                style={{
                                    left: `${offsetPct(col)}%`,
                                    top: `${offsetPct(row)}%`,
                                    width: `${CELL_PCT}%`,
                                    height: `${CELL_PCT}%`,
                                }}
                            />
                        );
                    })}

                    {/* Ghost (merging-away) tiles render beneath survivors */}
                    {ghosts.map((g) => (
                        <TileView key={`ghost-${g.id}`} tile={g} ghost />
                    ))}

                    {/* Live tiles */}
                    {tiles.map((t) => (
                        <TileView key={t.id} tile={t} />
                    ))}

                    {/* Win overlay */}
                    {status === 'won' && (
                        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 rounded-xl bg-background/85 backdrop-blur-sm">
                            <p className="text-4xl font-extrabold text-amber-500">You win!</p>
                            <p className="text-base text-muted-foreground">You reached 2048 — keep going for a high score.</p>
                            <div className="flex gap-3">
                                <button
                                    onClick={continueAfterWin}
                                    className="rounded-lg bg-primary px-6 py-3 text-base font-semibold text-primary-foreground shadow-lg transition-colors hover:bg-primary/90"
                                >
                                    Keep Going
                                </button>
                                <button
                                    onClick={newGame}
                                    className="rounded-lg border border-border px-6 py-3 text-base font-medium text-foreground transition-colors hover:bg-accent"
                                >
                                    New Game
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Game over overlay */}
                    {status === 'over' && (
                        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 rounded-xl bg-background/85 text-center backdrop-blur-sm">
                            <p className="text-4xl font-extrabold text-foreground">Game Over</p>
                            <p className="mb-2 text-lg font-semibold text-muted-foreground">Final Score: {score}</p>
                            <button
                                onClick={newGame}
                                className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-base font-semibold text-primary-foreground shadow-lg transition-colors hover:bg-primary/90"
                            >
                                <RotateCcw size={18} />
                                Try Again
                            </button>
                        </div>
                    )}
                </div>

                <p className="mt-3 text-center text-xs text-muted-foreground">
                    Tiles with the same number merge into one when they touch. Reach the 2048 tile to win.
                </p>
            </div>
        </div>
    );
}
