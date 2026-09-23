/**
 * Save-time guard for the Toast UI editor (TuiEditorContent).
 *
 * Runs the REAL @toast-ui/editor 3.x serializer in jsdom: load authored
 * markdown in WYSIWYG, optionally edit through TUI's own editing API, then
 * read what a save would write (`getMarkdown()`, and the text the markdown
 * tab shows after a mode switch).
 *
 * The break this guards: TuiEditorContent saving TUI's raw serialization —
 * `\_ \* \[ \] \# \| \. \-` escapes, `\frac` → `\\frac`, `&amp;` → `&`,
 * `<thinking>` tags dropped, `\(` → `(`, `- ` → `* `, blank lines collapsed.
 * Delete the `attachTuiMarkdownGuard` call (or gut `restoreAuthoredMarkdown`)
 * and every case below goes red.
 */
import Editor from "@toast-ui/editor";
import { attachTuiMarkdownGuard, type TuiGuardableEditor } from "../tuiMarkdownGuard";

type TuiInstance = Editor & TuiGuardableEditor;

const mounted: Array<{ editor: Editor; el: HTMLElement }> = [];

function load(markdown: string): TuiInstance {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const editor = new Editor({ el, initialEditType: "wysiwyg", initialValue: markdown, usageStatistics: false }) as TuiInstance;
    attachTuiMarkdownGuard(editor); // exactly as TuiEditorContent installs it
    mounted.push({ editor, el });
    return editor;
}

afterEach(() => {
    for (const { editor, el } of mounted.splice(0)) {
        editor.destroy();
        el.remove();
    }
});

/** Finds the ProseMirror position right after `needle` in the WYSIWYG doc. */
function wysiwygPosAfter(editor: TuiInstance, needle: string): { from: number; to: number } {
    const doc = (editor as unknown as { wwEditor: { view: { state: { doc: any } } } }).wwEditor.view.state.doc;
    let found: { from: number; to: number } | null = null;
    doc.descendants((node: any, pos: number) => {
        if (found || !node.isText) return;
        const idx = (node.text as string).indexOf(needle);
        if (idx !== -1) found = { from: pos + idx, to: pos + idx + needle.length };
    });
    if (!found) throw new Error(`"${needle}" not in WYSIWYG doc`);
    return found;
}

/** Types `text` right after `needle`, through TUI's own WYSIWYG edit API. */
function typeAfter(editor: TuiInstance, needle: string, text: string) {
    const { to } = wysiwygPosAfter(editor, needle);
    editor.replaceSelection(text, to, to);
}

/** Types `text` right before `needle`. */
function typeBefore(editor: TuiInstance, needle: string, text: string) {
    const { from } = wysiwygPosAfter(editor, needle);
    editor.replaceSelection(text, from, from);
}

/** Deletes `needle` through TUI's own WYSIWYG edit API. */
function deleteText(editor: TuiInstance, needle: string) {
    const { from, to } = wysiwygPosAfter(editor, needle);
    editor.deleteSelection(from, to);
}

// ─── Corpus: real-shaped note content ────────────────────────────────────────

const SUPPORT_PROMPT = [
    "You are a senior_support agent for {{company_name}}.",
    "",
    "<thinking>",
    "Consider the customer's plan_tier before answering.",
    "</thinking>",
    "",
    "## Rules",
    "- Never promise refunds > $500.",
    "- Escalate *urgent* tickets to [Tier 2](https://example.com/tier_2?a=1&b=2).",
    "",
    "1. Read the ticket_history",
    "2. Draft the reply",
].join("\n");

const MATH_NOTE = [
    "The loss is $L = \\frac{1}{N}\\sum_i (y_i - \\hat{y}_i)^2$ and $x\\_1$ stays escaped.",
    "",
    "$$",
    "\\frac{a_1}{b_2} \\\\ c",
    "$$",
    "",
    "Inline \\(a+b\\) and display \\[x^2\\].",
].join("\n");

const CODE_NOTE = [
    "Windows path C:\\Users\\arman\\notes and regex \\d+_\\w+ outside code.",
    "```python",
    'path = r"C:\\Users\\arman"',
    'pattern = re.compile(r"\\d+_\\w+\\.md")',
    "```",
    "",
    'Use `re.sub(r"\\s+", "_", s)` inline.',
].join("\n");

const TABLE_NOTE = [
    "| Field_name | Type | Notes |",
    "|---|:---:|---|",
    "| user_id | uuid | primary *key* |",
    "| total_cost | numeric | USD & tax |",
].join("\n");

const KIND_NOTE = [
    "Output kind:",
    "```json",
    '{"__kind": "task_list", "items": [{"title": "Call vendor_a", "done": false}]}',
    "```",
].join("\n");

const ENTITY_NOTE = [
    "Tom &amp; Jerry &lt;3 and AT&T",
    "",
    "",
    "",
    "After extra blank lines, pipes | commas, and (parens) - dash + plus!",
].join("\n");

const AUTHOR_ESCAPES = [
    "# Release notes_v2",
    "",
    "Author escaped: \\*not bold\\* and 1\\. not a list",
    "",
    "> quoted_text [link-ish] # hash",
    "",
].join("\n");

const CORPUS: Array<[string, string]> = [
    ["agent prompt with XML section, variables, lists", SUPPORT_PROMPT],
    ["math with \\frac, \\_, $$ block, \\( \\[ delimiters", MATH_NOTE],
    ["code fence and spans with backslashes, Windows path", CODE_NOTE],
    ["table with alignment row and underscores", TABLE_NOTE],
    ["kind JSON fence", KIND_NOTE],
    ["entities, blank-line run, punctuation", ENTITY_NOTE],
    ["escapes the author wrote, heading, quote", AUTHOR_ESCAPES],
];

describe("unchanged content comes back byte-identical", () => {
    it.each(CORPUS)("%s — getMarkdown()", (_name, authored) => {
        const editor = load(authored);
        expect(editor.getMarkdown()).toBe(authored);
    });

    it.each(CORPUS)("%s — WYSIWYG → markdown → WYSIWYG", (_name, authored) => {
        const editor = load(authored);
        editor.changeMode("markdown", true);
        expect(editor.getMarkdown()).toBe(authored); // what the markdown tab shows
        editor.changeMode("wysiwyg", true);
        expect(editor.getMarkdown()).toBe(authored);
    });

    it("setMarkdown() with new content re-bases the guard", () => {
        const editor = load(SUPPORT_PROMPT);
        editor.setMarkdown(MATH_NOTE, false);
        expect(editor.getMarkdown()).toBe(MATH_NOTE);
    });
});

describe("edits keep every untouched byte and gain no escapes", () => {
    it("typing at the end of a list item", () => {
        const editor = load(SUPPORT_PROMPT);
        typeAfter(editor, "Draft the reply", " using order_status & refund_policy (v2).");
        expect(editor.getMarkdown()).toBe(SUPPORT_PROMPT + " using order_status & refund_policy (v2).");
    });

    it("typing inside the XML section keeps its tags", () => {
        const editor = load(SUPPORT_PROMPT);
        typeAfter(editor, "plan_tier", " and account_age");
        expect(editor.getMarkdown()).toBe(SUPPORT_PROMPT.replace("plan_tier", "plan_tier and account_age"));
    });

    it("deleting a word inside the XML section keeps its tags", () => {
        const editor = load(SUPPORT_PROMPT);
        deleteText(editor, "customer's ");
        expect(editor.getMarkdown()).toBe(SUPPORT_PROMPT.replace("customer's ", ""));
    });

    it("typing before math keeps \\frac, \\_ and \\( exactly as authored", () => {
        const editor = load(MATH_NOTE);
        typeBefore(editor, "The loss", "Note_1: ");
        expect(editor.getMarkdown()).toBe("Note_1: " + MATH_NOTE);
    });

    it("typing inside the \\( \\) paragraph keeps the author's delimiters", () => {
        const editor = load(MATH_NOTE);
        typeAfter(editor, "a+b", "+c");
        expect(editor.getMarkdown()).toBe(MATH_NOTE.replace("\\(a+b\\)", "\\(a+b+c\\)"));
    });

    it("typing in a table cell keeps the alignment row and other cells", () => {
        const editor = load(TABLE_NOTE);
        typeAfter(editor, "USD & tax", " + fees");
        expect(editor.getMarkdown()).toBe(TABLE_NOTE.replace("USD & tax", "USD & tax + fees"));
    });

    it("a literal backslash typed in WYSIWYG is stored once, not doubled", () => {
        const editor = load(CODE_NOTE);
        typeAfter(editor, " inline.", " Backup at D:\\data\\x_y [daily].");
        expect(editor.getMarkdown()).toBe(CODE_NOTE + " Backup at D:\\data\\x_y [daily].");
    });

    it("the markdown tab shows the clean text after an edit", () => {
        const editor = load(ENTITY_NOTE);
        typeAfter(editor, "plus!", " See section_4 *now*.");
        editor.changeMode("markdown", true);
        expect(editor.getMarkdown()).toBe(ENTITY_NOTE + " See section_4 *now*.");
    });

    it("an escape typed in the markdown tab survives the trip back to WYSIWYG", () => {
        const editor = load(AUTHOR_ESCAPES);
        editor.changeMode("markdown", true);
        editor.setMarkdown(AUTHOR_ESCAPES + "Literal \\_underscores\\_ here\n", false);
        editor.changeMode("wysiwyg", true);
        expect(editor.getMarkdown()).toBe(AUTHOR_ESCAPES + "Literal \\_underscores\\_ here\n");
    });

    it("a new paragraph typed after the last one is clean, the rest untouched", () => {
        const editor = load(ENTITY_NOTE);
        typeAfter(editor, "plus!", "\nNext_step: call vendor_b (today).");
        // TUI writes a WYSIWYG paragraph break as a single newline; that is its
        // structure, not escape damage, so it is kept as TUI wrote it.
        expect(editor.getMarkdown()).toBe(ENTITY_NOTE + "\nNext_step: call vendor_b (today).");
    });

    it("a typed line that would become a heading keeps its one necessary escape", () => {
        const editor = load(ENTITY_NOTE);
        typeAfter(editor, "plus!", "\n# tag_1");
        expect(editor.getMarkdown()).toBe(ENTITY_NOTE + "\n\\# tag_1");
    });

    it("two separate edits in one note", () => {
        const editor = load(SUPPORT_PROMPT);
        typeAfter(editor, "senior_support", " escalation");
        deleteText(editor, "customer's ");
        expect(editor.getMarkdown()).toBe(
            SUPPORT_PROMPT.replace("senior_support", "senior_support escalation").replace("customer's ", ""),
        );
    });

    it("a long note (every corpus block x40) round-trips and edits in bounded time", () => {
        const blocks = [SUPPORT_PROMPT, MATH_NOTE, CODE_NOTE, TABLE_NOTE, KIND_NOTE, ENTITY_NOTE, AUTHOR_ESCAPES];
        const long = Array.from({ length: 40 }, (_, n) => blocks.map((b) => b.replace("{{company_name}}", `{{company_${n}}}`)).join("\n\n")).join("\n\n");
        const editor = load(long);
        const t0 = Date.now();
        expect(editor.getMarkdown()).toBe(long);
        typeAfter(editor, "{{company_39}}", " (renamed_x)");
        expect(editor.getMarkdown()).toBe(long.replace("{{company_39}}", "{{company_39}} (renamed_x)"));
        expect(Date.now() - t0).toBeLessThan(3000);
    });

    it("deleting across a decoded entity removes the entity with it", () => {
        const editor = load(ENTITY_NOTE);
        deleteText(editor, "& Jerry ");
        expect(editor.getMarkdown()).toBe(ENTITY_NOTE.replace("&amp; Jerry ", ""));
    });

    it("empty paragraphs typed in WYSIWYG are stored as blank lines, not <br>", () => {
        const editor = load(ENTITY_NOTE);
        typeAfter(editor, "plus!", "\n\n\nFollow-up owner: ops_team");
        expect(editor.getMarkdown()).toBe(ENTITY_NOTE + "\n\n\nFollow-up owner: ops_team");
    });
});
