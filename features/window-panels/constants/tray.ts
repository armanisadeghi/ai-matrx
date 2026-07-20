/**
 * Tray layout constants.
 *
 * Hardcoded previously inside `windowManagerSlice.ts` and `WindowTray.tsx`.
 * Centralised here so the mobile-responsive sizing path can derive chip
 * dimensions from a single source.
 *
 * Note: `windowManagerSlice` re-exports `TRAY_CHIP_W` and `TRAY_CHIP_H` for
 * backward compatibility — external consumers should still import from here
 * going forward.
 */

/** Desktop minimized-card width in px. */
export const TRAY_CHIP_W_DESKTOP = 240;

/** Desktop minimized-card height in px. */
export const TRAY_CHIP_H_DESKTOP = 160;

/** Horizontal gap between chips. */
export const TRAY_GAP_X = 8;

/** Vertical gap between rows of chips. */
export const TRAY_GAP_Y = 8;

/** Gap from the right viewport edge. */
export const TRAY_MARGIN_R = 20;

/** Gap from the bottom viewport edge. */
export const TRAY_MARGIN_B = 20;

/** Left boundary: cards never flow farther left than this. */
export const TRAY_MARGIN_L = 8;

/** Header-only height used when full cards no longer fit in the viewport. */
export const TRAY_COMPACT_H = 32;

/** Tighter gap for the overflow overview grid. */
export const TRAY_COMPACT_GAP = 4;

/**
 * Mobile chip width target. The tray becomes a horizontal-scroll strip on
 * mobile, so the width is a target upper bound clamped against the viewport.
 */
export const TRAY_CHIP_W_MOBILE_MAX = 180;

/** Mobile chip height — slightly shorter to fit tight screens. */
export const TRAY_CHIP_H_MOBILE = 72;

/** Viewport width below which the mobile tray layout takes over. */
export const TRAY_MOBILE_BREAKPOINT = 768;

/**
 * Compute the chip width for a given viewport. On mobile, fits ~2 chips
 * across with safe-area padding; never exceeds the desktop size on wider
 * screens.
 */
export function computeTrayChipWidth(viewportWidth: number): number {
  if (viewportWidth < TRAY_MOBILE_BREAKPOINT) {
    return Math.min(
      TRAY_CHIP_W_MOBILE_MAX,
      Math.max(120, Math.floor(viewportWidth / 2) - 24),
    );
  }
  return TRAY_CHIP_W_DESKTOP;
}

/** Chip height for a given viewport. */
export function computeTrayChipHeight(viewportWidth: number): number {
  return viewportWidth < TRAY_MOBILE_BREAKPOINT
    ? TRAY_CHIP_H_MOBILE
    : TRAY_CHIP_H_DESKTOP;
}

/** Number of cards that fit in a tray row at the current viewport width. */
export function trayChipsPerRow(viewportWidth: number): number {
  const chipWidth = computeTrayChipWidth(viewportWidth);
  const usable = viewportWidth - TRAY_MARGIN_R - TRAY_MARGIN_L;
  return Math.max(
    1,
    Math.floor((usable + TRAY_GAP_X) / (chipWidth + TRAY_GAP_X)),
  );
}

/**
 * Compute the visual rectangle for a tray slot. Slot zero starts at the
 * bottom-right; later slots grow left, then wrap upward into additional rows.
 */
export function traySlotRect(
  slot: number,
  viewportWidth: number,
  viewportHeight: number,
  totalSlots = slot + 1,
): { x: number; y: number; width: number; height: number } {
  const chipWidth = computeTrayChipWidth(viewportWidth);
  const chipHeight = computeTrayChipHeight(viewportWidth);
  const perRow = trayChipsPerRow(viewportWidth);
  const safeSlot = Math.max(0, Math.floor(slot));
  const usableHeight = Math.max(1, viewportHeight - TRAY_MARGIN_B - 8);
  const fullRows = Math.max(
    1,
    Math.floor((usableHeight + TRAY_GAP_Y) / (chipHeight + TRAY_GAP_Y)),
  );
  const fullCardCapacity = perRow * fullRows;

  if (totalSlots > fullCardCapacity) {
    const compactRows = Math.max(
      1,
      Math.floor(
        (viewportHeight - 16 + TRAY_COMPACT_GAP) /
          (TRAY_COMPACT_H + TRAY_COMPACT_GAP),
      ),
    );
    const compactColumns = Math.max(1, Math.ceil(totalSlots / compactRows));
    const availableWidth = Math.max(
      compactColumns,
      viewportWidth - 16 - TRAY_COMPACT_GAP * (compactColumns - 1),
    );
    const compactWidth = Math.min(
      TRAY_CHIP_W_DESKTOP,
      Math.max(1, Math.floor(availableWidth / compactColumns)),
    );
    const compactCol = safeSlot % compactColumns;
    const compactRow = Math.floor(safeSlot / compactColumns);
    return {
      x:
        viewportWidth -
        8 -
        compactWidth -
        compactCol * (compactWidth + TRAY_COMPACT_GAP),
      y:
        viewportHeight -
        8 -
        TRAY_COMPACT_H -
        compactRow * (TRAY_COMPACT_H + TRAY_COMPACT_GAP),
      width: compactWidth,
      height: TRAY_COMPACT_H,
    };
  }
  const col = safeSlot % perRow;
  const row = Math.floor(safeSlot / perRow);

  return {
    x:
      viewportWidth -
      TRAY_MARGIN_R -
      chipWidth -
      col * (chipWidth + TRAY_GAP_X),
    y:
      viewportHeight -
      TRAY_MARGIN_B -
      chipHeight -
      row * (chipHeight + TRAY_GAP_Y),
    width: chipWidth,
    height: chipHeight,
  };
}
