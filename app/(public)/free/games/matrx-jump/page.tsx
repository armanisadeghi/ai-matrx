// page.tsx
'use client';

import React, { useState } from 'react';
import { RotateCcw, Users } from 'lucide-react';
import { CharacterSelect } from './components/CharacterSelect';
import { useGameEngine } from './hooks/useGameEngine';
import type { Character } from './types';

export default function GamePage() {
    const [character, setCharacter] = useState<Character>();
    const engine = useGameEngine(character);

    if (!character) {
        return (
            <div className="min-h-dvh bg-textured flex items-center justify-center p-4">
                <CharacterSelect onSelect={setCharacter} />
            </div>
        );
    }

    return (
        <div className="min-h-dvh bg-textured flex flex-col items-center gap-3 p-4">
            <div className="flex w-full max-w-md items-center justify-between">
                <h1 className="text-lg font-bold">Matrx Jump</h1>
                <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold tabular-nums text-muted-foreground">
                        Score {engine.score}
                    </span>
                    <button
                        onClick={() => setCharacter(undefined)}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                    >
                        <Users size={14} />
                        Character
                    </button>
                </div>
            </div>

            <div className="relative" style={{ width: engine.width, maxWidth: '100%' }}>
                <canvas
                    ref={engine.canvasRef}
                    width={engine.width}
                    height={engine.height}
                    {...engine.pointerProps}
                    className="h-auto w-full rounded-xl border border-border bg-background touch-none select-none"
                />

                {engine.status === 'ready' && (
                    <div className="absolute inset-0 flex items-end justify-center pb-20">
                        <button
                            onClick={engine.startGame}
                            className="rounded-lg bg-primary px-8 py-3 text-lg font-semibold text-primary-foreground shadow-lg hover:bg-primary/90 transition-colors"
                        >
                            Start Game
                        </button>
                    </div>
                )}

                {engine.status === 'gameover' && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
                        <p className="text-2xl font-bold text-white">Final Score: {engine.finalScore}</p>
                        <button
                            onClick={engine.startGame}
                            className="inline-flex items-center gap-2 rounded-lg bg-primary px-8 py-3 text-lg font-semibold text-primary-foreground shadow-lg hover:bg-primary/90 transition-colors"
                        >
                            <RotateCcw size={18} />
                            Play Again
                        </button>
                    </div>
                )}
            </div>

            {engine.isGyroAvailable && !engine.hasGyroPermission && (
                <button
                    onClick={() => engine.requestGyroPermission()}
                    className="rounded-lg bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                    Enable Tilt Controls
                </button>
            )}

            <div className="space-y-1 text-center text-sm text-muted-foreground">
                <p>Bounce on platforms to climb · don&apos;t fall off the bottom</p>
                <p>
                    {engine.hasGyroPermission ? 'Tilt your device' : 'Tap the left/right side of the board or use ← →'} to move
                </p>
                <p>Stomp enemies from above · grab coins · avoid enemies from the side</p>
            </div>
        </div>
    );
}
