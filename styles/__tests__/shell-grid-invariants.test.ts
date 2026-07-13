/**
 * Guardrail for the shell CSS grid — the highest-blast-radius stylesheet in the
 * repo (it wraps every authenticated page) and, being CSS-mechanism rather than
 * Tailwind utilities, nothing else watches it.
 *
 * The class of bug this locks in: the desktop "sidebar expanded" rule
 *
 *     .shell-root:has(#shell-sidebar-toggle:checked) { grid-template-columns: 208px 1fr }
 *
 * carries an id INSIDE :has(), so it out-specifies the mobile media query's
 * plain `.shell-root { grid-template-columns: 1fr }` (media queries add no
 * specificity). Left unguarded, a persisted expanded-sidebar state on a
 * mobile-width viewport keeps a 208px first column while grid-template-areas is
 * already single-column — pinning `main` into that 208px track and crushing the
 * page into a thin left strip. See the fix in styles/shell.css §13.
 *
 * jsdom can't evaluate :has()/media-queries/grid from a stylesheet, so this is a
 * STATIC assertion over the CSS source rather than a computed-layout test. It is
 * deliberately narrow: it proves the mobile block neutralizes the expanded-state
 * column override. If someone deletes that neutralization (or adds a new
 * expanded-state column override outside the mobile guard), this screams in CI.
 */
import { readFileSync } from "fs";
import { join } from "path";

const CSS = readFileSync(join(__dirname, "..", "shell.css"), "utf8");

/** Strip /* … *\/ comments so explanatory prose can't satisfy a match. */
function stripComments(css: string): string {
    return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/** Extract the body of the first `@media (query) { … }` block, brace-balanced. */
function extractMediaBlock(css: string, queryFragment: string): string | null {
    const marker = css.indexOf(`@media ${queryFragment}`);
    if (marker === -1) return null;
    const open = css.indexOf("{", marker);
    if (open === -1) return null;
    let depth = 0;
    for (let i = open; i < css.length; i++) {
        if (css[i] === "{") depth++;
        else if (css[i] === "}") {
            depth--;
            if (depth === 0) return css.slice(open + 1, i);
        }
    }
    return null;
}

/** Collect each `grid-template-columns` value that appears in a rule whose
 *  selector targets the checked sidebar toggle. */
function checkedSidebarGridColumns(scope: string): string[] {
    const values: string[] = [];
    // Match "<selector-list> { <decls> }" rule blocks (no nested braces inside
    // a plain rule — safe for this flat stylesheet).
    const ruleRe = /([^{}]+)\{([^{}]*)\}/g;
    let m: RegExpExecArray | null;
    while ((m = ruleRe.exec(scope)) !== null) {
        const selector = m[1];
        const body = m[2];
        if (!selector.includes("#shell-sidebar-toggle:checked")) continue;
        const decl = /grid-template-columns\s*:\s*([^;]+);/.exec(body);
        if (decl) values.push(decl[1].trim());
    }
    return values;
}

/** A single-track grid value (one column) — the collapsed mobile state. A
 *  multi-track value has a top-level space (e.g. "208px 1fr"). */
function isSingleTrack(value: string): boolean {
    // Normalize whitespace; a single track is one token like "1fr" or "100%".
    return /^\S+$/.test(value.trim());
}

describe("shell.css grid invariants", () => {
    const css = stripComments(CSS);

    it("expands the sidebar to a multi-track grid on desktop (baseline)", () => {
        // Everything OUTSIDE the mobile media block is the desktop cascade.
        const mobile = extractMediaBlock(css, "(max-width: 1023px)");
        expect(mobile).not.toBeNull();
        const desktop = css.replace(mobile as string, "");
        const desktopCols = checkedSidebarGridColumns(desktop);
        expect(desktopCols.length).toBeGreaterThan(0);
        // At least one desktop expanded rule is genuinely multi-track.
        expect(desktopCols.some((v) => !isSingleTrack(v))).toBe(true);
    });

    it("collapses the expanded-sidebar grid to a single column on mobile", () => {
        const mobile = extractMediaBlock(css, "(max-width: 1023px)");
        expect(mobile).not.toBeNull();
        const mobileCols = checkedSidebarGridColumns(mobile as string);
        // The neutralization MUST exist: the mobile block has to re-target the
        // checked-sidebar selector, or the desktop override wins by specificity.
        expect(mobileCols.length).toBeGreaterThan(0);
        // And every such value must be a single track — never "208px 1fr".
        for (const value of mobileCols) {
            expect(isSingleTrack(value)).toBe(true);
        }
    });
});
