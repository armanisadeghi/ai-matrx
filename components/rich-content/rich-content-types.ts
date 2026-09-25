/**
 * `<RichContent level>` — the ONE entry for rendering any text that is more
 * than plain text. Types live here (the shell) so a consumer's graph never
 * pulls an implementation to name a prop.
 *
 * Levels — the same core, the same plugin rules, the same prose preparation;
 * a level only decides how much of the block pipeline is mounted:
 *
 *  - `inline`   markdown + math, NO blocks. Renders phrasing elements only
 *               (spans), so it is valid inside a `<p>`, a `<button>`, a table
 *               cell, a title. Card faces, quiz prompts, previews, terms.
 *  - `standard` + code, tables, mermaid, XML sections, ```markdown fences and
 *               other nested blocks — depth-bounded. No kinds, no actions.
 *  - `full`     the whole chat pipeline (MarkdownStream → block registry →
 *               kinds, interactive blocks, actions).
 *
 * Plan: common-docs/projects/rich-content-unification/PLAN.md decisions 1, 2, 9.
 */

export type RichContentLevel = "inline" | "standard" | "full";

/**
 * How many nested content levels render formatted before falling back to
 * plain text with an "open" affordance. Depth 0 is the content itself; an
 * `<info>` inside it is depth 1; a ```markdown fence inside that is depth 2 …
 *
 * Default for the `depthCap` knob (prop / provider). Chosen 2026-09-23: three
 * levels covers every nesting seen in real assistant output (a section → a
 * document → its own section) while bounding adversarial or runaway nesting.
 */
export const DEFAULT_RICH_CONTENT_DEPTH_CAP = 3;

/**
 * Typography variant — never a second renderer (prose/variant-root.tsx).
 *  - `default`  chat density.
 *  - `reading`  long-form reading: larger body, ~70ch measure, comfortable
 *               line-height, heading scale. For learn articles, share pages,
 *               public resources.
 */
export type RichContentVariant = "default" | "reading";

export interface RichContentProps {
  /** The source text — markdown, math, XML sections, fences. */
  source: string;
  level: RichContentLevel;
  /** True while the source is still streaming in (standard / full). */
  isStreaming?: boolean;
  className?: string;
  /** Nested-rendering depth cap (standard / full). */
  depthCap?: number;
  /** Typography variant (standard / full); default `default`. */
  variant?: RichContentVariant;
  /**
   * Inline only: `text` renders markdown links as their formatted text, for
   * content that already sits inside a link (card previews). Default `link`.
   */
  links?: "link" | "text";
}
