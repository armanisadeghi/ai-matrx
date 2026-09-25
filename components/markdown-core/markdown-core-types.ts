import type { Components } from "react-markdown";
import type { DocumentNumbering } from "./syntax/document-numbering";

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
 * - math:       math only
 * - gfm-math:   gfm + math
 * - rich:       gfm + breaks + math
 * - chat:       rich + matrx variables + matrx citations + safe raw HTML
 * - message:    gfm + math + breaks + rehype-raw
 *
 * "math" everywhere means the ONE dialect in math-normalizer.ts: the source
 * is normalized (`\(…\)` inline, `\[…\]` display, unambiguous `$…$`,
 * code untouched) and remark-math/rehype-katex run with the shared options.
 */
export type MarkdownPreset =
  | "plain"
  | "gfm"
  | "gfm-breaks"
  | "math"
  | "gfm-math"
  | "rich"
  | "chat"
  | "message";

/** The element-override map a caller may pass to the core — import THIS, never react-markdown's own type. */
export type MarkdownComponents = Components;

export interface MarkdownCoreProps {
  children: string;
  preset?: MarkdownPreset;
  components?: Components;
  /**
   * The text is still streaming in: heal half-arrived syntax before parse.
   * Omit to inherit from the nearest MarkdownStreamingProvider (false outside
   * a live stream); finished text is never healed.
   */
  streaming?: boolean;
  /**
   * Server renderer only: the document-wide numbering of the whole document
   * this block belongs to (`computeDocumentNumbering`). Client leaves read it
   * from the nearest DocumentNumberingProvider instead.
   */
  numbering?: DocumentNumbering | null;
}
