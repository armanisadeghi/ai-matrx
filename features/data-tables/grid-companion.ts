/**
 * THE GRID'S COMPANIONS (merged-grid review 2, fix lane F).
 *
 * Both grids let go of the selected cell on a press "off the table" (Arman, 2026-09-27). The page's
 * agents are not off the table: a person selects a cell, then opens "Agents for this page" to ask
 * about THAT cell. A control marked with this attribute works WITH the grid, and a press on it keeps
 * the selection — in the older grid (`useGridSelection`) and in `@ai-matrx/design-system`'s
 * spreadsheet grid, which holds through the same attribute (its `GRID_COMPANION_ATTR`). Host
 * windows (an agent chat window) are held through as floating layers (`data-matrx-floating-layer`).
 *
 * Its own tiny module: the shell header imports it on every page, never the grid hook.
 */
export const GRID_COMPANION_ATTR = "data-matrx-grid-companion";
