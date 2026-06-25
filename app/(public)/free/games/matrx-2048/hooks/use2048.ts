'use client';

// hooks/use2048.ts — game state, input, persistence, and one-tap undo.
//
// 2048 is turn-based, so (unlike the jump game) React state is exactly the
// right home for it: one state update per move, animated by CSS transitions on
// stable tile ids. Input is briefly locked during the slide so rapid presses
// can't race the animation.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
    applyMove,
    createEmptyGrid,
    emptyCells,
    gridToTiles,
    hasMoves,
    hasWon,
    tilesToGrid,
    type Direction,
    type Grid,
    type Tile,
} from '../logic';
import { BEST_SCORE_KEY, MOVE_ANIMATION_MS } from '../constants';

export type GameStatus = 'playing' | 'won' | 'over';

interface Snapshot {
    tiles: Tile[];
    score: number;
    status: GameStatus;
}

const cloneTiles = (tiles: Tile[]): Tile[] => tiles.map((t) => ({ ...t }));

export const use2048 = () => {
    const idRef = useRef(1);
    const [tiles, setTiles] = useState<Tile[]>([]);
    const [ghosts, setGhosts] = useState<Tile[]>([]);
    const [score, setScore] = useState(0);
    const [best, setBest] = useState(0);
    const [status, setStatus] = useState<GameStatus>('playing');
    const [keepGoing, setKeepGoing] = useState(false);

    const historyRef = useRef<Snapshot[]>([]);
    const lockRef = useRef(false);
    const statusRef = useRef<GameStatus>('playing');
    const keepGoingRef = useRef(false);
    statusRef.current = status;
    keepGoingRef.current = keepGoing;

    const spawnTile = useCallback((grid: Grid): Tile | null => {
        const cells = emptyCells(grid);
        if (cells.length === 0) return null;
        const { row, col } = cells[Math.floor(Math.random() * cells.length)];
        const tile: Tile = {
            id: idRef.current++,
            value: Math.random() < 0.9 ? 2 : 4,
            row,
            col,
            isNew: true,
            isMerged: false,
        };
        grid[row][col] = tile;
        return tile;
    }, []);

    const newGame = useCallback(() => {
        lockRef.current = false;
        historyRef.current = [];
        const grid = createEmptyGrid();
        spawnTile(grid);
        spawnTile(grid);
        setGhosts([]);
        setTiles(gridToTiles(grid));
        setScore(0);
        setStatus('playing');
        setKeepGoing(false);
    }, [spawnTile]);

    // Load best score and start a game on mount.
    useEffect(() => {
        try {
            const saved = Number(localStorage.getItem(BEST_SCORE_KEY));
            if (Number.isFinite(saved) && saved > 0) setBest(saved);
        } catch {
            /* localStorage unavailable — best simply stays 0 */
        }
        newGame();
    }, [newGame]);

    const move = useCallback(
        (dir: Direction) => {
            if (lockRef.current) return;
            if (statusRef.current === 'over') return;
            if (statusRef.current === 'won' && !keepGoingRef.current) return;

            setTiles((current) => {
                const grid = tilesToGrid(cloneTiles(current));
                const result = applyMove(grid, dir);
                if (!result.moved) return current;

                // Snapshot the pre-move board for undo.
                historyRef.current.push({ tiles: cloneTiles(current), score, status: statusRef.current });
                if (historyRef.current.length > 20) historyRef.current.shift();

                const gainedScore = score + result.gained;
                setScore(gainedScore);
                if (gainedScore > best) {
                    setBest(gainedScore);
                    try {
                        localStorage.setItem(BEST_SCORE_KEY, String(gainedScore));
                    } catch {
                        /* ignore persistence failure */
                    }
                }

                // Show survivors at their new spots + ghosts sliding into merges.
                setGhosts(result.ghosts);
                lockRef.current = true;

                // After the slide: drop ghosts, clear flags, spawn, evaluate end state.
                window.setTimeout(() => {
                    setTiles((sliding) => {
                        const settled = tilesToGrid(sliding.map((t) => ({ ...t, isNew: false, isMerged: false })));
                        spawnTile(settled);
                        const nextTiles = gridToTiles(settled);

                        if (!keepGoingRef.current && hasWon(nextTiles)) {
                            setStatus('won');
                        } else if (!hasMoves(settled)) {
                            setStatus('over');
                        }
                        return nextTiles;
                    });
                    setGhosts([]);
                    lockRef.current = false;
                }, MOVE_ANIMATION_MS);

                return result.tiles;
            });
        },
        [best, score, spawnTile],
    );

    const undo = useCallback(() => {
        if (lockRef.current) return;
        const prev = historyRef.current.pop();
        if (!prev) return;
        setGhosts([]);
        setTiles(prev.tiles);
        setScore(prev.score);
        setStatus(prev.status);
    }, []);

    const continueAfterWin = useCallback(() => {
        setKeepGoing(true);
        setStatus('playing');
    }, []);

    // Keyboard controls (arrows + WASD), without scrolling the page.
    useEffect(() => {
        const keyMap: Record<string, Direction> = {
            ArrowUp: 'up',
            ArrowDown: 'down',
            ArrowLeft: 'left',
            ArrowRight: 'right',
            w: 'up',
            s: 'down',
            a: 'left',
            d: 'right',
            W: 'up',
            S: 'down',
            A: 'left',
            D: 'right',
        };
        const onKeyDown = (e: KeyboardEvent) => {
            const dir = keyMap[e.key];
            if (!dir) return;
            e.preventDefault();
            move(dir);
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [move]);

    const canUndo = historyRef.current.length > 0;

    return {
        tiles,
        ghosts,
        score,
        best,
        status,
        canUndo,
        newGame,
        undo,
        move,
        continueAfterWin,
    };
};
