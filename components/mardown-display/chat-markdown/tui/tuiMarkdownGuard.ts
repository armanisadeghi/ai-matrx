/**
 * TUI markdown save-time guard.
 *
 * Toast UI's WYSIWYG → markdown serializer rewrites text the author never
 * touched: it adds backslash escapes (`\_ \* \[ \] \# \< \> \| \. \- \,` …),
 * doubles real backslashes (`\frac` → `\\frac`), decodes entities
 * (`&amp;` → `&`), drops raw HTML / XML section tags (`<thinking>`), drops
 * author escapes (`\(` → `(`), rewrites list markers, table separators and
 * blank-line runs, and emits `<br>` for empty paragraphs. Saving
 * `getMarkdown()` verbatim writes all of that into the record.
 *
 * The guard is a three-way merge done on every WYSIWYG → markdown conversion:
 *
 *   O = the markdown the editor was loaded with (authored text)
 *   K = TUI's own serialization of O, captured right after load (baseline)
 *   E = TUI's serialization now (what `getMarkdown()` would return)
 *
 * diff(K, E) is exactly the author's edits in TUI-space; diff(O, K) maps every
 * baseline character back to the authored bytes. Every region the author did
 * not edit is emitted from O byte-for-byte (so an untouched document comes
 * back byte-identical, escapes / entities / tags / blank lines and all), and
 * only text the author typed in WYSIWYG — which by definition contains no
 * author-written escapes — has TUI's escapes removed (outside code spans,
 * fences and math, keeping structurally necessary line-start escapes).
 *
 * Hooked through TUI's own `beforeConvertWysiwygToMarkdown` event, so every
 * `getMarkdown()` caller and the WYSIWYG → markdown mode switch get it.
 */

type OpType = "eq" | "del" | "ins";
/** del = only in the first text, ins = only in the second. */
export interface DiffOp {
    t: OpType;
    text: string;
}

// ─── Myers diff ──────────────────────────────────────────────────────────────

interface Seg {
    t: OpType;
    a0: number;
    a1: number;
    b0: number;
    b1: number;
}

/**
 * Myers O((N+M)D) shortest edit script over index-addressed sequences.
 * Returns null when the edit distance exceeds maxD (caller falls back).
 */
function myers(n: number, m: number, eq: (i: number, j: number) => boolean, maxD: number): Seg[] | null {
    const off = maxD + 1;
    const v = new Int32Array(2 * maxD + 3);
    const trace: Int32Array[] = [];
    for (let d = 0; d <= maxD; d++) {
        // Snapshot of V after step d-1; index k maps to k + d + 1.
        trace.push(v.slice(off - d - 1, off + d + 2));
        for (let k = -d; k <= d; k += 2) {
            let x: number;
            if (k === -d || (k !== d && v[off + k - 1] < v[off + k + 1])) x = v[off + k + 1];
            else x = v[off + k - 1] + 1;
            let y = x - k;
            while (x < n && y < m && eq(x, y)) {
                x++;
                y++;
            }
            v[off + k] = x;
            if (x >= n && y >= m) return backtrack(trace, d, n, m);
        }
    }
    return null;
}

function backtrack(trace: Int32Array[], dEnd: number, n: number, m: number): Seg[] {
    const segs: Seg[] = [];
    let x = n;
    let y = m;
    for (let d = dEnd; d > 0; d--) {
        const vp = trace[d];
        const get = (kk: number) => vp[kk + d + 1];
        const k = x - y;
        const down = k === -d || (k !== d && get(k - 1) < get(k + 1));
        const prevK = down ? k + 1 : k - 1;
        const prevX = get(prevK);
        const prevY = prevX - prevK;
        const startX = down ? prevX : prevX + 1;
        const startY = startX - k;
        if (x > startX) segs.push({ t: "eq", a0: startX, a1: x, b0: startY, b1: y });
        if (down) segs.push({ t: "ins", a0: prevX, a1: prevX, b0: prevY, b1: prevY + 1 });
        else segs.push({ t: "del", a0: prevX, a1: prevX + 1, b0: prevY, b1: prevY });
        x = prevX;
        y = prevY;
    }
    if (x > 0) segs.push({ t: "eq", a0: 0, a1: x, b0: 0, b1: y });
    return segs.reverse();
}

const MAX_LINE_D = 4000;
const MAX_CHAR_D = 2000;

function pushOp(ops: DiffOp[], t: OpType, text: string) {
    if (!text) return;
    const last = ops[ops.length - 1];
    if (last && last.t === t) last.text += text;
    else ops.push({ t, text });
}

function charDiff(a: string, b: string, ops: DiffOp[]) {
    let p = 0;
    const minLen = Math.min(a.length, b.length);
    while (p < minLen && a.charCodeAt(p) === b.charCodeAt(p)) p++;
    let s = 0;
    while (s < minLen - p && a.charCodeAt(a.length - 1 - s) === b.charCodeAt(b.length - 1 - s)) s++;
    pushOp(ops, "eq", a.slice(0, p));
    const am = a.slice(p, a.length - s);
    const bm = b.slice(p, b.length - s);
    const segs = am && bm ? myers(am.length, bm.length, (i, j) => am.charCodeAt(i) === bm.charCodeAt(j), MAX_CHAR_D) : null;
    if (segs) {
        for (const g of segs) {
            if (g.t === "ins") pushOp(ops, "ins", bm.slice(g.b0, g.b1));
            else pushOp(ops, g.t, am.slice(g.a0, g.a1));
        }
    } else {
        pushOp(ops, "del", am);
        pushOp(ops, "ins", bm);
    }
    pushOp(ops, "eq", a.slice(a.length - s));
}

function splitLines(s: string): string[] {
    if (!s) return [];
    const out: string[] = [];
    let start = 0;
    for (let i = 0; i < s.length; i++) {
        if (s.charCodeAt(i) === 10) {
            out.push(s.slice(start, i + 1));
            start = i + 1;
        }
    }
    if (start < s.length) out.push(s.slice(start));
    return out;
}

/**
 * Character-level diff computed line-first (fast on long documents), then per
 * changed hunk. `lineKey` decides which lines anchor the line pass: lines with
 * equal keys are aligned and then diffed character by character, so a line
 * TUI merely re-escaped still anchors instead of a stray blank line.
 */
export function diffText(a: string, b: string, lineKey: (line: string) => string = (l) => l): DiffOp[] {
    const ops: DiffOp[] = [];
    if (a === b) {
        pushOp(ops, "eq", a);
        return ops;
    }
    const al = splitLines(a);
    const bl = splitLines(b);
    const ak = al.map(lineKey);
    const bk = bl.map(lineKey);
    const segs = myers(al.length, bl.length, (i, j) => ak[i] === bk[j], MAX_LINE_D);
    if (!segs) {
        charDiff(a, b, ops);
        return ops;
    }
    let delBuf = "";
    let insBuf = "";
    const flush = () => {
        if (delBuf || insBuf) charDiff(delBuf, insBuf, ops);
        delBuf = "";
        insBuf = "";
    };
    for (const g of segs) {
        if (g.t === "eq") {
            flush();
            for (let i = g.a0, j = g.b0; i < g.a1; i++, j++) {
                if (al[i] === bl[j]) pushOp(ops, "eq", al[i]);
                else charDiff(al[i], bl[j], ops);
            }
        } else if (g.t === "del") delBuf += al.slice(g.a0, g.a1).join("");
        else insBuf += bl.slice(g.b0, g.b1).join("");
    }
    flush();
    return ops;
}

/**
 * Line identity that survives TUI's rewrite of a line: escapes, decoded
 * entities, list-marker swaps and whitespace. Blank lines get no identity of
 * their own beyond "blank", so they never out-vote a real line.
 */
function tuiLineKey(line: string): string {
    return line
        .replace(/\\(?=[!-/:-@[-`{-~])/g, "")
        .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_m, e: string) => ({ amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", nbsp: " " })[e] ?? "")
        .replace(/^\s*(?:>\s*)*(?:[-*+]|\d{1,9}[.)])\s+/, "* ")
        .replace(/\s+/g, " ")
        .trim();
}

// ─── Inserted-text cleanup ──────────────────────────────────────────────────

/** Every character TUI's `escape()` prefixes with a backslash. */
const TUI_ESCAPED = new Set(["*", "_", "~", "`", "<", ">", "(", ")", "{", "}", "[", "]", "+", ",", "-", ".", "!", "#", "|"]);
const ASCII_PUNCT = /[!-/:-@[-`{-~]/;

/**
 * Marks positions of `text` inside fenced code, `$$` math blocks, inline code
 * spans and inline `$…$` math — regions whose backslashes are never touched.
 */
function protectedMask(text: string): Uint8Array {
    const mask = new Uint8Array(text.length);
    const lines = splitLines(text);
    let pos = 0;
    let fence: { ch: string; len: number } | null = null;
    let mathBlock = false;
    for (const line of lines) {
        const body = line.replace(/\n$/, "");
        const lineEnd = pos + line.length;
        if (fence) {
            mask.fill(1, pos, lineEnd);
            const close = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(body);
            if (close && close[1][0] === fence.ch && close[1].length >= fence.len) fence = null;
        } else if (mathBlock) {
            mask.fill(1, pos, lineEnd);
            if (body.trim() === "$$") mathBlock = false;
        } else {
            const open = /^ {0,3}(`{3,}|~{3,})/.exec(body);
            if (open) {
                fence = { ch: open[1][0], len: open[1].length };
                mask.fill(1, pos, lineEnd);
            } else if (body.trim() === "$$") {
                mathBlock = true;
                mask.fill(1, pos, lineEnd);
            } else {
                markInline(body, pos, mask);
            }
        }
        pos = lineEnd;
    }
    return mask;
}

function markInline(body: string, base: number, mask: Uint8Array) {
    let i = 0;
    while (i < body.length) {
        const c = body[i];
        if (c === "\\") {
            i += 2;
            continue;
        }
        if (c === "`") {
            let n = 1;
            while (body[i + n] === "`") n++;
            const ticks = "`".repeat(n);
            let j = body.indexOf(ticks, i + n);
            while (j !== -1 && (body[j + n] === "`" || body[j - 1] === "`")) j = body.indexOf(ticks, j + 1);
            if (j !== -1) {
                mask.fill(1, base + i, base + j + n);
                i = j + n;
                continue;
            }
            i += n;
            continue;
        }
        if (c === "$" && body[i + 1] !== "$" && body[i + 1] && body[i + 1] !== " ") {
            let j = i + 1;
            while (j < body.length && !(body[j] === "$" && body[j - 1] !== "\\")) j++;
            if (j < body.length && body[j - 1] !== " ") {
                mask.fill(1, base + i, base + j + 1);
                i = j + 1;
                continue;
            }
        }
        i++;
    }
}

const LINE_START_PREFIX = /^[ \t]*(?:>[ \t]*)*(?:(?:[-+*]|\d{1,9}[.)])[ \t]+)*$/;

/** True when removing the backslash before `text[i+1]` would change block structure. */
function isStructuralEscape(text: string, i: number): boolean {
    const x = text[i + 1];
    const ls = text.lastIndexOf("\n", i - 1) + 1;
    const leEnd = text.indexOf("\n", i);
    const le = leEnd === -1 ? text.length : leEnd;
    const line = text.slice(ls, le);
    if (x === "|" && /^\s*\|/.test(line)) return true; // table cell content
    const prefix = text.slice(ls, i);
    const after = text[i + 2];
    const spaceAfter = after === undefined || after === " " || after === "\t" || after === "\n";
    if ((x === "." || x === ")") && /^[ \t]*(?:>[ \t]*)*\d{1,9}$/.test(prefix) && spaceAfter) return true;
    if (!LINE_START_PREFIX.test(prefix)) return false;
    if (x === "#" || x === ">") return true;
    if ((x === "-" || x === "+" || x === "*") && spaceAfter) return true;
    if ((x === "-" || x === "*" || x === "_" || x === "=") && /^[\\\-*_= \t]+$/.test(text.slice(i, le))) return true;
    if ((x === "`" || x === "~") && text.slice(i, i + 6).replace(/\\/g, "").startsWith(x.repeat(3))) return true;
    return false;
}

/**
 * Cleans text the author typed in WYSIWYG (E[from, to)): removes TUI's
 * escapes, un-doubles backslashes that do not precede punctuation, and turns
 * whole `<br>` filler lines into blank lines. Code, fences and math untouched.
 */
function cleanInserted(e: string, from: number, to: number, mask: () => Uint8Array): string {
    let out = "";
    let i = from;
    while (i < to) {
        const c = e[i];
        if (c === "<" && e.startsWith("<br>", i) && (i === 0 || e[i - 1] === "\n") && i + 4 <= to && (e[i + 4] === "\n" || i + 4 === e.length)) {
            i += 4;
            continue;
        }
        if (c !== "\\" || i + 1 >= to || mask()[i]) {
            out += c;
            i++;
            continue;
        }
        const x = e[i + 1];
        if (x === "\\") {
            const next = e[i + 2];
            // `\\` before punctuation must stay doubled (else it becomes an escape).
            out += next !== undefined && ASCII_PUNCT.test(next) ? "\\\\" : "\\";
            i += 2;
            continue;
        }
        if (TUI_ESCAPED.has(x) && !isStructuralEscape(e, i)) {
            out += x;
            i += 2;
            continue;
        }
        out += c + x;
        i += 2;
    }
    return out;
}

// ─── Three-way merge ────────────────────────────────────────────────────────

export interface GuardBaseline {
    /** Authored markdown the editor was loaded with. */
    original: string;
    /** TUI's serialization of `original`, captured before any edit. */
    baseline: string;
}

interface Alignment {
    /** For each baseline char: the authored char it came from, or "" when TUI added it. */
    oOfK: string[];
    /** Authored text TUI dropped, located at each baseline boundary (0..|K|). */
    pre: string[];
}

function align(original: string, baseline: string): Alignment {
    const oOfK: string[] = new Array(baseline.length);
    const pre: string[] = new Array(baseline.length + 1).fill("");
    let k = 0;
    for (const op of diffText(original, baseline, tuiLineKey)) {
        if (op.t === "eq") {
            for (let i = 0; i < op.text.length; i++) oOfK[k++] = op.text[i];
        } else if (op.t === "del") {
            pre[k] += op.text;
        } else {
            for (let i = 0; i < op.text.length; i++) oOfK[k++] = "";
        }
    }
    return { oOfK, pre };
}

const isEscapeOnly = (s: string) => /^\\+$/.test(s);

/**
 * Pure three-way merge. Returns the authored markdown with the edits that
 * `output` makes relative to `baseline`, and nothing else TUI changed.
 */
export function restoreAuthoredMarkdown(input: GuardBaseline & { output: string }, cachedAlignment?: Alignment): string {
    const { original, baseline, output } = input;
    if (output === baseline) return original;
    const { oOfK, pre } = cachedAlignment ?? align(original, baseline);
    const emitted = new Uint8Array(baseline.length + 1);
    let maskCache: Uint8Array | null = null;
    const mask = () => (maskCache ??= protectedMask(output));
    const out: string[] = [];
    const emitPre = (i: number) => {
        if (!emitted[i]) {
            emitted[i] = 1;
            if (pre[i]) out.push(pre[i]);
        }
    };
    let k = 0;
    let e = 0;
    for (const op of diffText(baseline, output)) {
        const len = op.text.length;
        if (op.t === "eq") {
            for (let j = 0; j < len; j++) {
                emitPre(k);
                out.push(oOfK[k]);
                k++;
            }
            e += len;
        } else if (op.t === "del") {
            for (let j = 0; j < len; j++) {
                // Dropped authored text before the first deleted char survives
                // unless it is that char's own escape; text inside the deleted
                // range goes with it.
                if (j === 0 && !isEscapeOnly(pre[k])) emitPre(k);
                else emitted[k] = 1;
                k++;
            }
        } else {
            const p = pre[k];
            // Authored text TUI dropped at this point: escapes and line-leading
            // closers belong after the typed text; opening tags / prefixes before.
            if (p && !emitted[k] && !(isEscapeOnly(p) || p.startsWith("\n"))) emitPre(k);
            out.push(cleanInserted(output, e, e + len, mask));
            e += len;
        }
    }
    emitPre(baseline.length);
    return out.join("");
}

// ─── Live editor wiring ─────────────────────────────────────────────────────

/** The subset of the TUI editor instance the guard uses. */
export interface TuiGuardableEditor {
    getMarkdown(): string;
    setMarkdown(markdown?: string, cursorToEnd?: boolean): void;
    isWysiwygMode(): boolean;
    on(type: string, handler: (...args: any[]) => any): void;
    /** TUI internals (3.x): the markdown-mode editor keeps its text across mode switches. */
    mdEditor?: { getMarkdown(): string };
    eventEmitter?: { removeEventHandler?(type: string, handler?: (...args: any[]) => any): void };
}

/**
 * Installs the guard on a live TUI editor. `loadedMarkdown` is the text it was
 * loaded with; omitted, it is read from the editor's markdown pane.
 * After this, `getMarkdown()` in WYSIWYG mode and the WYSIWYG → markdown mode
 * switch return authored bytes for everything the author did not edit, and
 * `setMarkdown()` re-bases the guard on the new authored text.
 * Returns a detach function.
 *
 * Only `beforeConvertWysiwygToMarkdown` and `changeMode` are listened to: the
 * React wrapper calls `off('change')` on every render, which would silently
 * drop a guard listener on `change`.
 */
export function attachTuiMarkdownGuard(editor: TuiGuardableEditor, loadedMarkdown?: string): () => void {
    // The markdown editor holds the exact text TUI was loaded with, so the
    // live instance — not a possibly-stale prop — is the authored original.
    let initialMarkdown = loadedMarkdown ?? "";
    if (loadedMarkdown === undefined) {
        try {
            initialMarkdown = editor.mdEditor?.getMarkdown() ?? "";
        } catch {
            initialMarkdown = "";
        }
    }
    let state: (GuardBaseline & { alignment?: Alignment }) | null = null;
    let capturing = false;
    let detached = false;
    /** Authored text being loaded by setMarkdown(); conversions mid-load return it. */
    let loading: string | null = null;
    /** Last authored markdown known for markdown mode (fallback when mdEditor is absent). */
    let markdownModeText = initialMarkdown;

    const rebase = (original: string) => {
        capturing = true;
        try {
            state = { original, baseline: editor.getMarkdown() };
        } finally {
            capturing = false;
        }
    };

    const onConvert = (markdownText: string) => {
        if (detached || capturing) return markdownText;
        if (loading !== null) return loading;
        if (!state) return markdownText;
        if (markdownText === state.baseline) return state.original;
        state.alignment ??= align(state.original, state.baseline);
        return restoreAuthoredMarkdown({ original: state.original, baseline: state.baseline, output: markdownText }, state.alignment);
    };

    const onChangeMode = (mode: string) => {
        if (detached) return;
        if (mode === "wysiwyg") {
            let text = markdownModeText;
            try {
                text = editor.mdEditor?.getMarkdown() ?? markdownModeText;
            } catch {
                /* fall back to the tracked text */
            }
            rebase(text);
        } else {
            // TUI just wrote the (guarded) WYSIWYG serialization into the markdown editor.
            markdownModeText = editor.getMarkdown();
        }
    };

    const originalSetMarkdown = editor.setMarkdown;
    editor.setMarkdown = function guardedSetMarkdown(markdown?: string, cursorToEnd?: boolean) {
        if (detached) return originalSetMarkdown.call(editor, markdown, cursorToEnd);
        const authored = markdown ?? "";
        loading = authored;
        try {
            originalSetMarkdown.call(editor, markdown, cursorToEnd);
        } finally {
            loading = null;
        }
        markdownModeText = authored;
        if (editor.isWysiwygMode()) rebase(authored);
    };

    editor.on("beforeConvertWysiwygToMarkdown", onConvert);
    editor.on("changeMode", onChangeMode);
    if (editor.isWysiwygMode()) rebase(initialMarkdown);

    return () => {
        detached = true;
        editor.setMarkdown = originalSetMarkdown;
        try {
            editor.eventEmitter?.removeEventHandler?.("beforeConvertWysiwygToMarkdown", onConvert);
            editor.eventEmitter?.removeEventHandler?.("changeMode", onChangeMode);
        } catch {
            /* handlers are inert once detached */
        }
    };
}
