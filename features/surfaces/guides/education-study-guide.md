# One study guide — how to work on this page

You are on **one study guide** (`/education/study-guides/<id>`, surface
`matrx-user/education-study-guide`). This guide is for an agent helping the person here. Read it
once before your first write.

## What the page is

A study guide is a note in the person's "Study Notes" folder, shown in a reader: the guide's text
in the middle, the guide picker and outline on the left, and two tabs on the right — **Notes &
comments** and **Key Terms**. The person can mark passages, write private notes, and discuss the
guide with others in comment threads. Everything you change goes through this page's write
targets, which run the same code as the page's own buttons.

## What you can read

- `study_guide` (shown to you in full, no lookup needed): THE guide —
  `{ id, title, content, version, updated_at, tags, key_term_count, personal_note_count, comment_count }`.
  `content` is the full markdown body. The three counts tell you whether the lists below have
  anything in them (null = that list is still loading or failed).
- `personal_annotations`: the person's PRIVATE highlights and notes, each
  `{ id, kind: "highlight" | "note", quote, note, color, attached, created_at }`. `quote` is the
  marked passage (null for a note on the whole guide). `attached: false` means the guide's text
  changed and the passage can no longer be found.
- `guide_comments`: comment threads everyone who can read the guide sees, each
  `{ id, quote, body, suggested_text, author, mine, resolved, attached, created_at, replies: [{ id, body, author, mine, created_at }] }`.
  A comment with `suggested_text` proposes replacing its quoted passage.
- `key_terms`: `{ id, term, definition }` flashcards from the decks linked to the guide. Read-only
  here — they are edited in the flashcard editor.
- `outline`, `available_guides` (the person's other guides as `{ id, title }`), `reader_mode`,
  `active_details_tab`, `load_error`, `details_error`.

If `study_guide` arrives as a look-up item (a guide longer than about 10,000 characters), read it
ONCE with the `context` tool. Do the same for `personal_annotations` or `guide_comments` when a
count says they hold something you need. Never page through a list item by item.

## Quotes: how a note or comment is pinned to a passage

A `quote` is copied EXACTLY from `study_guide.content` — the markdown text, including any `**`,
`_` or link markup inside it — and must appear there exactly once. If the words appear more than
once, include surrounding words. A quote that is not found or is ambiguous refuses the whole
write, and the error says which.

## What you can write

Call the write tool with `target` and `value`. Every target asks the person first (one approval
card per write) and returns what landed, with ids.

**`guide_content`** — rewrite or fix the guide's text, saved immediately. Send the complete new
markdown body as a string, or for one change in a long guide an anchored edit:

```json
{ "command": "str_replace", "old_str": "is the powerhouse of the cell", "new_str": "makes most of the cell's ATP" }
```

Refused while `reader_mode` is `"edit"` (ask the person to press "Back to reading"), when nothing
would change, or when someone else saved the guide since the page loaded (reload and try again).

**`create_personal_notes`** — private highlights and notes (only the person sees them):

```json
[
  { "quote": "Ribosomes make proteins.", "note": "On the quiz", "color": "green" },
  { "note": "Review the cell diagram before Friday" }
]
```

With `quote` it highlights that passage (`note` optional); without `quote` it is a note on the
whole guide and `note` is required. Colors: yellow (default), green, blue, pink, purple. A passage
the person already highlighted is refused — change that one instead. The very first private note
may ask the person which workspace to file it in.

**`update_personal_notes`** — `[{ "id": "<from personal_annotations>", "note": "…", "color": "blue" }]`.
Only the fields you send change; `note: ""` clears a highlight's note. Colors apply to highlights
only.

**`delete_personal_notes`** — `["<id>", …]`. The mark and its note go to the person's Trash (they
can restore them there). The guide's text never changes.

**`create_guide_comments`** — shared comments, replies and suggestions:

```json
[
  { "body": "Is this on the exam?", "quote": "Ribosomes make proteins." },
  { "body": "Clearer wording", "quote": "**mitochondria**", "suggested_text": "**mitochondrion**" },
  { "body": "Yes — chapter 3", "reply_to": "<thread id from guide_comments>" }
]
```

Omit `quote` for a comment on the whole guide. A reply takes only `body` and goes under a thread,
never under another reply. For something only the person should see, use `create_personal_notes`
instead — comments are visible to everyone who can read the guide.

**`update_guide_comments`** — `[{ "id": "…", "body": "…" }]` edits the person's own comments
(`mine: true`); `[{ "id": "<thread id>", "resolved": true }]` resolves a thread (`false` reopens
it). Resolve, don't delete, to close a discussion.

**`delete_guide_comments`** — `["<id>", …]`, the person's own comments or replies only. The
comment disappears for everyone; its author can restore it from Trash.

## Rules

- Every list is checked whole before the approval card: one bad entry refuses the whole write and
  nothing changes. Fix the entry the error names and send the list again.
- Your page snapshot was taken when your run started. After a write, trust the ids in the write's
  result, not the (older) lists.
- Never change this guide, its notes or its comments with generic note, document, comment or scope
  tools: they skip the page's anchoring, privacy and version checks.
- You cannot rename the guide or link flashcard decks from here; tell the person to use Edit or
  "Manage linked flashcards".

## When you are stuck

- `guide_loaded` false with `load_error`: the guide could not be read; say so, do not treat it as
  an empty guide.
- `details_error`: key terms or notes and comments failed to load; writes to them are refused
  until they load.
- Something on this page is missing or wrong for your job: report it with the `surface_feedback`
  target so it gets fixed.
