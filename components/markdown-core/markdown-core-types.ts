import type { Components } from "react-markdown";

/**
 * Plugin presets for the ONE shared react-markdown edge (MarkdownCore).
 * Every preset's plugin array lives in MarkdownCoreImpl — callers pick a
 * preset by name so plugin imports never enter caller graphs. Adding a
 * one-off plugin combination? Add a preset here + in the Impl; never
 * import react-markdown or a remark/rehype plugin from a component again.
 *
 * - plain:      no plugins
 * - gfm:        remark-gfm
 * - gfm-breaks: remark-gfm + remark-breaks
 * - math:       remark-math + rehype-katex
 * - rich:       gfm + breaks + math(no single-$) + katex(strict:ignore)
 * - chat:       rich + matrx variables + matrx citations + safe raw HTML
 * - message:    gfm + math + breaks + rehype-raw
 */
export type MarkdownPreset =
  | "plain"
  | "gfm"
  | "gfm-breaks"
  | "math"
  | "rich"
  | "chat"
  | "message";

export interface MarkdownCoreProps {
  children: string;
  preset?: MarkdownPreset;
  components?: Components;
}
