'use client';

// hooks/useGameEngine.ts
//
// The single source of truth for Matrx Jump's simulation. This replaces the
// old useGameLoop + useGameEntities pair, which ran the 60fps physics through
// React state across three competing setGameState updaters with direct
// mutation and stale closures — an architecture that could never be stable.
//
// How this one works (the standard canvas-game-in-React pattern):
//   - ALL mutable game state lives in a ref (stateRef). Mutating it is cheap
//     and correct because it is NOT React state.
//   - ONE requestAnimationFrame loop, set up once, drives everything. It reads
//     live values from refs, so it never restarts and never goes stale.
//   - A fixed-timestep accumulator runs the simulation in deterministic 1/60s
//     steps, so behaviour is identical regardless of display refresh rate.
//   - React state holds ONLY what the surrounding DOM needs (status + a
//     throttled score), so the component re-renders a handful of times per
//     game instead of 60 times per second.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useGameControls } from './useGameControls';
import { DEFAULT_SETTINGS, GameConfiguration } from './useGameSettings';
import type { Character, Coin, Enemy, GameStatus, Platform, Player } from '../types';

interface EngineState {
    player: Player;
    platforms: Platform[];
    coins: Coin[];
    enemies: Enemy[];
    maxHeight: number; // total pixels climbed (drives the height score)
    bonus: number; // coins + enemies score
}

interface ActiveControls {
    left: boolean;
    right: boolean;
}

// Tuning that is intentionally NOT user-configurable (the settings UI exposes
// the GameConfiguration knobs; these shape the feel and stay fixed).
const STEP = 1 / 60; // fixed simulation timestep (seconds)
const MAX_STEPS_PER_FRAME = 5; // catch-up cap so a stalled tab can't freeze
const MAX_FRAME_TIME = 0.25; // clamp dt after a tab switch (seconds)
const CAMERA_LINE_RATIO = 0.45; // player is held at this fraction from the top
const PLATFORM_GAP_MIN = 70;
const PLATFORM_GAP_MAX = 115; // < max jump height, so the next one is reachable
const COIN_SPAWN_CHANCE = 0.22;
const ENEMY_START_HEIGHT = 1200; // no enemies until you've climbed this far
const ENEMY_HEIGHT_PER = 1400; // each band of climb adds one more enemy
const MAX_FALL_SPEED = 16; // terminal velocity (also prevents tunnelling)
const SCORE_PER_PIXEL = 0.1; // height score = floor(pixelsClimbed * this)
const START_PLATFORM_RATIO = 0.72; // where the player begins, vertically

const rand = (min: number, max: number) => min + Math.random() * (max - min);

const scoreOf = (s: EngineState) => Math.floor(s.maxHeight * SCORE_PER_PIXEL) + s.bonus;

const makeCoinAbove = (p: Platform, cfg: GameConfiguration): Coin => ({
    x: p.x + p.width / 2 - cfg.coinSize / 2,
    y: p.y - 40 - rand(0, 30),
    width: cfg.coinSize,
    height: cfg.coinSize,
    collected: false,
});

const createBoard = (cfg: GameConfiguration): EngineState => {
    const W = cfg.canvasWidth;
    const H = cfg.canvasHeight;
    const startY = Math.round(H * START_PLATFORM_RATIO);

    const platforms: Platform[] = [
        { x: W / 2 - cfg.platformWidth / 2, y: startY, width: cfg.platformWidth, height: cfg.platformHeight },
    ];

    let y = startY;
    while (y > -PLATFORM_GAP_MAX) {
        y -= rand(PLATFORM_GAP_MIN, PLATFORM_GAP_MAX);
        platforms.push({ x: rand(0, W - cfg.platformWidth), y, width: cfg.platformWidth, height: cfg.platformHeight });
    }

    const coins: Coin[] = [];
    for (const p of platforms) {
        if (p.y < startY && Math.random() < COIN_SPAWN_CHANCE) coins.push(makeCoinAbove(p, cfg));
    }

    const player: Player = {
        x: W / 2 - cfg.playerSize / 2,
        y: startY - cfg.playerSize,
        width: cfg.playerSize,
        height: cfg.playerSize,
        velocityY: 0,
        speed: cfg.playerSpeed,
    };

    return { player, platforms, coins, enemies: [], maxHeight: 0, bonus: 0 };
};

const overlaps = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) =>
    a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

// Advance the simulation by exactly one fixed step. Mutates `s` in place and
// returns the resulting status ('playing' or 'gameover').
const stepSimulation = (cfg: GameConfiguration, s: EngineState, controls: ActiveControls): GameStatus => {
    const W = cfg.canvasWidth;
    const H = cfg.canvasHeight;
    const player = s.player;

    // Horizontal movement with screen wrap.
    const dir = (controls.right ? 1 : 0) - (controls.left ? 1 : 0);
    player.x += dir * cfg.playerSpeed;
    if (player.x > W) player.x = -player.width;
    else if (player.x + player.width < 0) player.x = W;

    // Gravity (swept so fast falls can't tunnel through thin platforms).
    const prevBottom = player.y + player.height;
    player.velocityY = Math.min(player.velocityY + cfg.gravity, MAX_FALL_SPEED);
    player.y += player.velocityY;
    const newBottom = player.y + player.height;

    // Land on a platform — only while falling, only crossing it from above.
    if (player.velocityY > 0) {
        for (const p of s.platforms) {
            if (
                player.x < p.x + p.width &&
                player.x + player.width > p.x &&
                prevBottom <= p.y + p.height &&
                newBottom >= p.y
            ) {
                player.y = p.y - player.height;
                player.velocityY = cfg.jumpForce;
                break;
            }
        }
    }

    // Enemies move, then resolve against the player.
    for (const e of s.enemies) {
        if (e.isDead) continue;
        e.x += e.speed * e.direction;
        if (e.x <= 0) {
            e.x = 0;
            e.direction = 1;
        } else if (e.x + e.width >= W) {
            e.x = W - e.width;
            e.direction = -1;
        }
        if (overlaps(player, e)) {
            const stomped = player.velocityY > 0 && prevBottom <= e.y + e.height * 0.6;
            if (stomped) {
                e.isDead = true;
                player.velocityY = cfg.jumpForce;
                s.bonus += cfg.enemyDefeatScore;
            } else {
                return 'gameover';
            }
        }
    }

    // Coins.
    for (const c of s.coins) {
        if (!c.collected && overlaps(player, c)) {
            c.collected = true;
            s.bonus += cfg.coinCollectScore;
        }
    }

    // Camera follow: keep the player on the camera line, scroll the world down,
    // and bank the climbed distance as height score.
    const cameraLine = H * CAMERA_LINE_RATIO;
    if (player.y < cameraLine) {
        const shift = cameraLine - player.y;
        player.y = cameraLine;
        for (const p of s.platforms) p.y += shift;
        for (const c of s.coins) c.y += shift;
        for (const e of s.enemies) e.y += shift;
        s.maxHeight += shift;
    }

    // Despawn anything that scrolled off the bottom (and consumed entities).
    s.platforms = s.platforms.filter((p) => p.y <= H + 40);
    s.coins = s.coins.filter((c) => !c.collected && c.y <= H + 40);
    s.enemies = s.enemies.filter((e) => !e.isDead && e.y <= H + 40);

    // Keep reachable platforms ahead of the climb.
    let minY = s.platforms.length ? Math.min(...s.platforms.map((p) => p.y)) : -PLATFORM_GAP_MIN;
    while (minY > -PLATFORM_GAP_MAX) {
        minY -= rand(PLATFORM_GAP_MIN, PLATFORM_GAP_MAX);
        const np: Platform = { x: rand(0, W - cfg.platformWidth), y: minY, width: cfg.platformWidth, height: cfg.platformHeight };
        s.platforms.push(np);
        if (Math.random() < COIN_SPAWN_CHANCE) s.coins.push(makeCoinAbove(np, cfg));
    }

    // Difficulty ramp: spawn enemies above once you've climbed far enough.
    const desiredEnemies =
        s.maxHeight < ENEMY_START_HEIGHT
            ? 0
            : Math.min(1 + Math.floor((s.maxHeight - ENEMY_START_HEIGHT) / ENEMY_HEIGHT_PER), cfg.maxEnemyCount);
    while (s.enemies.length < desiredEnemies) {
        const topY = s.enemies.length ? Math.min(...s.enemies.map((e) => e.y)) : -cfg.enemySpawnHeightBuffer;
        const spawnY = Math.min(topY - rand(150, 350), -cfg.enemySpawnHeightBuffer);
        s.enemies.push({
            x: rand(0, W - cfg.enemySize),
            y: spawnY,
            width: cfg.enemySize,
            height: cfg.enemySize,
            speed: cfg.enemySpeed,
            direction: Math.random() > 0.5 ? 1 : -1,
            isDead: false,
        });
    }

    // Fell off the bottom.
    if (player.y > H) return 'gameover';
    return 'playing';
};

const drawRoundedRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(x, y, w, h, r);
    } else {
        ctx.rect(x, y, w, h);
    }
};

const drawScene = (
    ctx: CanvasRenderingContext2D,
    cfg: GameConfiguration,
    s: EngineState,
    status: GameStatus,
    character: Character | undefined,
) => {
    const W = cfg.canvasWidth;
    const H = cfg.canvasHeight;
    ctx.clearRect(0, 0, W, H);

    // Platforms.
    ctx.fillStyle = '#4ade80';
    for (const p of s.platforms) {
        drawRoundedRect(ctx, p.x, p.y, p.width, p.height, p.height / 2);
        ctx.fill();
    }

    // Coins.
    ctx.fillStyle = '#fcd34d';
    for (const c of s.coins) {
        if (c.collected) continue;
        ctx.beginPath();
        ctx.arc(c.x + c.width / 2, c.y + c.height / 2, c.width / 2, 0, Math.PI * 2);
        ctx.fill();
    }

    // Enemies.
    ctx.fillStyle = '#ef4444';
    for (const e of s.enemies) {
        if (e.isDead) continue;
        ctx.beginPath();
        ctx.arc(e.x + e.width / 2, e.y + e.height / 2, e.width / 2, 0, Math.PI * 2);
        ctx.fill();
    }

    // Player.
    if (character) {
        ctx.save();
        ctx.beginPath();
        ctx.fillStyle = '#60a5fa';
        ctx.strokeStyle = '#2563eb';
        ctx.lineWidth = 2;
        character.render(ctx, s.player.x, s.player.y, s.player.width, s.player.height);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }

    // Score HUD (a small pill so it stays legible on any theme/background).
    const scoreText = `Score ${scoreOf(s)}`;
    ctx.font = '600 16px system-ui, -apple-system, sans-serif';
    const pillWidth = ctx.measureText(scoreText).width + 22;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.66)';
    drawRoundedRect(ctx, 8, 8, pillWidth, 28, 9);
    ctx.fill();
    ctx.fillStyle = '#f8fafc';
    ctx.fillText(scoreText, 19, 27);

    // Pre-game / game-over dim wash. All title/score text is rendered as real
    // DOM in the overlay on top — keeping it off the canvas avoids font overlap
    // and stays crisp + theme-aware.
    if (status !== 'playing') {
        ctx.fillStyle = 'rgba(2, 6, 23, 0.55)';
        ctx.fillRect(0, 0, W, H);
    }
};

export interface GameEngine {
    canvasRef: React.RefObject<HTMLCanvasElement | null>;
    status: GameStatus;
    score: number;
    finalScore: number;
    width: number;
    height: number;
    startGame: () => void;
    pointerProps: {
        onPointerDown: (e: React.PointerEvent<HTMLCanvasElement>) => void;
        onPointerMove: (e: React.PointerEvent<HTMLCanvasElement>) => void;
        onPointerUp: (e: React.PointerEvent<HTMLCanvasElement>) => void;
        onPointerLeave: () => void;
        onPointerCancel: () => void;
    };
    isGyroAvailable: boolean;
    hasGyroPermission: boolean;
    requestGyroPermission: () => Promise<boolean> | void;
}

export const useGameEngine = (character: Character | undefined, overrides?: Partial<GameConfiguration>): GameEngine => {
    const cfg = useMemo<GameConfiguration>(() => ({ ...DEFAULT_SETTINGS, ...overrides }), [overrides]);

    const { controls, isGyroAvailable, hasGyroPermission, requestGyroPermission } = useGameControls();

    const [status, setStatus] = useState<GameStatus>('ready');
    const [score, setScore] = useState(0);
    const [finalScore, setFinalScore] = useState(0);

    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const stateRef = useRef<EngineState>(createBoard(cfg));
    const statusRef = useRef<GameStatus>('ready');
    const cfgRef = useRef<GameConfiguration>(cfg);
    const characterRef = useRef<Character | undefined>(character);
    const controlsRef = useRef(controls);
    const touchRef = useRef<ActiveControls>({ left: false, right: false });

    const rafRef = useRef<number | undefined>(undefined);
    const lastTimeRef = useRef(0);
    const accRef = useRef(0);
    const lastScoreSyncRef = useRef(0);
    const lastScoreRef = useRef(0);

    // Keep the loop's live inputs current without restarting it.
    useEffect(() => {
        cfgRef.current = cfg;
    }, [cfg]);
    useEffect(() => {
        characterRef.current = character;
    }, [character]);
    useEffect(() => {
        controlsRef.current = controls;
    }, [controls]);

    const setStatusBoth = useCallback((next: GameStatus) => {
        statusRef.current = next;
        setStatus(next);
    }, []);

    const startGame = useCallback(() => {
        stateRef.current = createBoard(cfgRef.current);
        lastTimeRef.current = 0;
        accRef.current = 0;
        lastScoreRef.current = 0;
        setScore(0);
        setFinalScore(0);
        setStatusBoth('playing');
    }, [setStatusBoth]);

    // When a character is (re)chosen, lay out a fresh board and wait at 'ready'.
    useEffect(() => {
        if (!character) return;
        stateRef.current = createBoard(cfgRef.current);
        lastScoreRef.current = 0;
        setScore(0);
        setStatusBoth('ready');
    }, [character, setStatusBoth]);

    // Space starts (from ready) or restarts (from gameover); never scroll.
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.code !== 'Space') return;
            if (statusRef.current === 'ready' || statusRef.current === 'gameover') {
                e.preventDefault();
                startGame();
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [startGame]);

    // The one and only animation loop. Set up once; reads everything via refs.
    useEffect(() => {
        const endGame = () => {
            const final = scoreOf(stateRef.current);
            setScore(final);
            setFinalScore(final);
            setStatusBoth('gameover');
        };

        const loop = (time: number) => {
            rafRef.current = requestAnimationFrame(loop);
            const ctx = canvasRef.current?.getContext('2d');
            if (!ctx) return;
            const cfgNow = cfgRef.current;

            if (statusRef.current === 'playing') {
                if (lastTimeRef.current === 0) lastTimeRef.current = time;
                const dt = Math.min((time - lastTimeRef.current) / 1000, MAX_FRAME_TIME);
                lastTimeRef.current = time;
                accRef.current += dt;

                const active: ActiveControls = {
                    left: controlsRef.current.leftPressed || touchRef.current.left,
                    right: controlsRef.current.rightPressed || touchRef.current.right,
                };

                let steps = 0;
                while (accRef.current >= STEP && steps < MAX_STEPS_PER_FRAME) {
                    const result = stepSimulation(cfgNow, stateRef.current, active);
                    accRef.current -= STEP;
                    steps += 1;
                    if (result === 'gameover') {
                        endGame();
                        break;
                    }
                }

                // Throttle the React score update (the canvas HUD is always live).
                const liveScore = scoreOf(stateRef.current);
                if (liveScore !== lastScoreRef.current && time - lastScoreSyncRef.current > 120) {
                    lastScoreRef.current = liveScore;
                    lastScoreSyncRef.current = time;
                    setScore(liveScore);
                }
            } else {
                lastTimeRef.current = 0;
            }

            drawScene(ctx, cfgNow, stateRef.current, statusRef.current, characterRef.current);
        };

        rafRef.current = requestAnimationFrame(loop);
        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            rafRef.current = undefined;
        };
        // Set up exactly once — all live values are read through refs above.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Touch / pointer controls: hold the left or right half of the canvas.
    const pressedRef = useRef(false);
    const applyPointer = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
        if (statusRef.current !== 'playing') return;
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const mid = rect.width / 2;
        touchRef.current = { left: x < mid, right: x >= mid };
    }, []);
    const clearPointer = useCallback(() => {
        pressedRef.current = false;
        touchRef.current = { left: false, right: false };
    }, []);

    const pointerProps = useMemo(
        () => ({
            onPointerDown: (e: React.PointerEvent<HTMLCanvasElement>) => {
                pressedRef.current = true;
                applyPointer(e);
            },
            onPointerMove: (e: React.PointerEvent<HTMLCanvasElement>) => {
                if (pressedRef.current) applyPointer(e);
            },
            onPointerUp: clearPointer,
            onPointerLeave: clearPointer,
            onPointerCancel: clearPointer,
        }),
        [applyPointer, clearPointer],
    );

    return {
        canvasRef,
        status,
        score,
        finalScore,
        width: cfg.canvasWidth,
        height: cfg.canvasHeight,
        startGame,
        pointerProps,
        isGyroAvailable,
        hasGyroPermission,
        requestGyroPermission,
    };
};
