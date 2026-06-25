// constants.ts — board layout + a modern tile palette (works on light & dark).

// Board geometry expressed as percentages of the board, so the whole board
// scales fluidly with no JS measurement.
export const GAP_PCT = 2.6;
export const CELL_PCT = (100 - GAP_PCT * 5) / 4; // 21.75
export const offsetPct = (index: number) => GAP_PCT * (index + 1) + CELL_PCT * index;

export const BEST_SCORE_KEY = 'matrx-2048-best';
export const MOVE_ANIMATION_MS = 110; // slide duration + input lock window

export interface TileStyle {
    bg: string;
    text: string;
    /** Font size as a fraction of the tile size (smaller as digits grow). */
    fontScale: number;
    glow?: boolean;
}

// A cohesive indigo → violet → amber/emerald ramp (premium, on-brand, and
// legible on any background since each tile carries its own fill).
const STYLES: Record<number, TileStyle> = {
    2: { bg: '#eef2ff', text: '#3730a3', fontScale: 0.42 },
    4: { bg: '#e0e7ff', text: '#3730a3', fontScale: 0.42 },
    8: { bg: '#c7d2fe', text: '#312e81', fontScale: 0.42 },
    16: { bg: '#a5b4fc', text: '#1e1b4b', fontScale: 0.4 },
    32: { bg: '#818cf8', text: '#ffffff', fontScale: 0.4 },
    64: { bg: '#6366f1', text: '#ffffff', fontScale: 0.4 },
    128: { bg: '#4f46e5', text: '#ffffff', fontScale: 0.34 },
    256: { bg: '#4338ca', text: '#ffffff', fontScale: 0.34 },
    512: { bg: '#7c3aed', text: '#ffffff', fontScale: 0.34 },
    1024: { bg: '#6d28d9', text: '#ffffff', fontScale: 0.28 },
    2048: { bg: '#f59e0b', text: '#ffffff', fontScale: 0.28, glow: true },
    4096: { bg: '#ef4444', text: '#ffffff', fontScale: 0.28, glow: true },
    8192: { bg: '#10b981', text: '#ffffff', fontScale: 0.28, glow: true },
    16384: { bg: '#0ea5e9', text: '#ffffff', fontScale: 0.24, glow: true },
};

const FALLBACK: TileStyle = { bg: '#0f172a', text: '#ffffff', fontScale: 0.24, glow: true };

export const tileStyle = (value: number): TileStyle => STYLES[value] ?? FALLBACK;
