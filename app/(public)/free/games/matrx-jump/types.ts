// types.ts
import { ComponentType } from 'react';

export type GameStatus = 'selecting' | 'ready' | 'playing' | 'gameover';

export interface GameObject {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface Player extends GameObject {
    velocityY: number;
    speed: number;
}

export interface Platform extends GameObject {}
export interface Coin extends GameObject {
    collected: boolean;
}

export interface Enemy extends GameObject {
    speed: number;
    direction: number;
    isDead: boolean;
}

export interface GameState {
    player: Player;
    platforms: Platform[];
    coins: Coin[];
    enemies: Enemy[];
    autoScrollSpeed: number;
    isGameOver: boolean;
    score: number;
}

export interface Character {
    icon: ComponentType<{ size?: number | string; className?: string }>;
    name: string;
    render: (ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number) => void;
}

export interface GameControls {
    rightPressed: boolean;
    leftPressed: boolean;
}

