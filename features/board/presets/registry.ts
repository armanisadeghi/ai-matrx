/** Every board preset. Adding a type to one = one string in its `featured` / `more` list. */

import type { BoardPreset } from "./board-preset";

export const BOARD_PRESETS = {
  "marketing-social": {
    key: "marketing-social",
    label: "Social Studio",
    // The social tiles are added to `featured` by their own lane.
    featured: ["chat", "note", "web-page", "image", "file", "research", "udt_document", "data-table"],
    more: "rest",
    // The empty board offers this template first (a built-in board template key).
    starter: "builtin:viral-breakdown",
  },
} as const satisfies Record<string, BoardPreset>;

export type BoardPresetKey = keyof typeof BOARD_PRESETS;

export function presetByKey(key: string): BoardPreset | undefined {
  return (BOARD_PRESETS as Record<string, BoardPreset>)[key];
}
