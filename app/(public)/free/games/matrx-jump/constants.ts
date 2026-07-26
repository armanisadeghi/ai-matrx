// constants.ts
// Canvas and Entity Dimensions
export const CANVAS_WIDTH = 400;
export const CANVAS_HEIGHT = 800;
export const PLAYER_SIZE = 30;
export const PLATFORM_WIDTH = 75;
export const PLATFORM_HEIGHT = 10;
export const COIN_SIZE = 20;
export const ENEMY_SIZE = 20;

// Movement and Physics
export const ENEMY_SPEED = .8;
export const JUMP_FORCE = -11;
export const GRAVITY = 0.3;
export const PLAYER_SPEED = 3;

// Scroll Mechanics
export const TOP_ZONE_THRESHOLD = 0.6;  // Top 20% of screen
export const BASE_SCROLL_SPEED = 0.5;
export const MAX_SCROLL_SPEED = 15;
export const SCROLL_ACCELERATION = 0.8;

// Scoring
export const SCORES = {
    COIN_COLLECT: 50,
    ENEMY_DEFEAT: 200,
} as const;

export const INITIAL_ENEMY_SPAWN_DELAY = 5000; // 5 seconds before first enemy
export const MIN_ENEMY_COUNT = 1;
export const MAX_ENEMY_COUNT = 3;
export const ENEMY_SPAWN_HEIGHT_BUFFER = 100; // Spawn above viewport
