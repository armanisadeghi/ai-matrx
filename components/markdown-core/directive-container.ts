// ─────────────────────────────────────────────────────────────────────────
// THE ONE CONTAINER RULE for the block splitters (static content-splitter,
// live StreamBlockAccumulator): a generic-directive container
// `:::name[label]{attrs}` … `:::` is ONE text region. Everything inside it —
// a code fence, a table, an image, a nested `::::tabs` — stays with the
// container, so tabs holding code, a callout holding a table, a figure
// holding an image render as one construct at every level (the core renders
// a container body that holds blocks through NestedRichContent).
//
// Close: a bare colon run at least as long as the innermost open container's.
// Colons inside a code fence never close anything. Mirrors the content-ir
// tokenizer's `directive` island (aidream apps/shared/content-ir-core).
// ─────────────────────────────────────────────────────────────────────────

/** A line that opens a container directive: 3+ colons, then a name. */
export const DIRECTIVE_CONTAINER_OPEN = /^[ \t]{0,3}(:{3,})[A-Za-z][\w-]*/;

const CLOSE = /^[ \t]{0,3}(:{3,})[ \t]*$/;
const FENCE = /^[ \t]{0,3}(`{3,}|~{3,})/;

export class DirectiveContainerTracker {
  private readonly stack: number[];
  private fence: string | null = null;

  constructor(openingLine: string) {
    const m = DIRECTIVE_CONTAINER_OPEN.exec(openingLine);
    this.stack = [m ? (m[1] as string).length : 3];
  }

  /** Feed the next line (after the opener). True once the outermost container has closed on this line. */
  consume(line: string): boolean {
    const f = FENCE.exec(line);
    if (f) {
      const marker = f[1] as string;
      if (this.fence === null) this.fence = marker;
      else if (marker[0] === this.fence[0] && marker.length >= this.fence.length && line.trim() === line.trim().replace(/[^`~]/g, "")) this.fence = null;
      return false;
    }
    if (this.fence !== null) return false;
    const open = DIRECTIVE_CONTAINER_OPEN.exec(line);
    if (open) {
      this.stack.push((open[1] as string).length);
      return false;
    }
    const close = CLOSE.exec(line);
    if (close && (close[1] as string).length >= (this.stack[this.stack.length - 1] ?? 3)) {
      this.stack.pop();
      return this.stack.length === 0;
    }
    return false;
  }
}
