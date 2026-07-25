# FEATURE.md — `lib/json-format` (JSON Detect + Re-print Engine)

**Status:** `stable`
**Tier:** `2` (shared primitive)
**Last updated:** `2026-07-25`

---

## Purpose

One place to answer **"is this text JSON, and what shape should it be in?"** — so
no surface ever hand-rolls another `JSON.stringify(v, null, 2)` / "strip the
backticks" / "does this look like JSON" helper.

Two questions, two exports:

| | Detect | Re-print |
|---|---|---|
| Question | "Is this JSON, and where does it start and stop?" | "Lay this value out this way." |
| Entry | `detectJson(text)` — `detect.ts` | `stringifyJson(value, opts)` / `formatJsonText(text, opts)` — `format.ts` |
| Handles | code fences, prose around the payload, tolerant (JSON5) input | minify / compact / pretty, key sorting, fence add/strip |

Pure — no React, Redux, DOM, or Supabase. **Never throws:** text that is not
JSON comes back as `ok: false` with the input returned verbatim.

---

## The three styles

`JsonFormatStyle` is the whole product surface. For the same 11-line reference blob:

- **`minify`** — one line, zero optional whitespace. The smallest legal form.
  ```json
  {"matrx_version":1,"kind":"reference","type":"file","items":[{"file_id":"cd74…","label":"TEAM_ACCESS_ONBOARDING.md"}]}
  ```
- **`compact`** — width-aware FILL (default `width: 100`). Any subtree whose flat
  form fits the remaining columns is inlined; siblings that fit are **packed
  onto shared lines**. Small AND readable — the "scrunch it down" default.
  ```json
  {
    "matrx_version": 1, "kind": "reference", "type": "file",
    "items": [{ "file_id": "cd74…", "label": "TEAM_ACCESS_ONBOARDING.md" }]
  }
  ```
- **`pretty`** — one entry per line. Byte-identical to `JSON.stringify(v,null,2)`
  when `sortKeys` is off, so it is a safe drop-in for every existing use.

`JSON.stringify` cannot inline, cannot pack, and cannot sort keys. All three are
the point of this module.

---

## Entry points

- `detectJson(text) → JsonDetection` — `detect.ts`
- `formatJsonText(text, options) → JsonFormatResult` — `format.ts` (text in, text out; preserves everything around the payload)
- `stringifyJson(value, options) → string` — `format.ts` (for callers that already hold a value)
- `DEFAULT_JSON_INDENT` (2) / `DEFAULT_JSON_WIDTH` (100) — `format.ts`
- Types: `types.ts` (`JsonFormatStyle`, `JsonFenceMode`, `JsonDetection`, `JsonFormatResult`, …)

---

## Consumers

| Surface | What it does |
|---|---|
| **Context menu v3** — `features/context-menu-v3/utils/json-menu-actions.ts` | Highlight JSON anywhere → a JSON submenu (Condense / Minify / Expand / Sort keys / fence toggle), rewriting editable text in place and copying on read-only surfaces. |
| **Notes cleanup** — `lib/content-cleanup/region-operations.ts` | The `condense-json` / `minify-json` / `expand-json` **region operations**, the only sanctioned path that rewrites a protected region. |

Both go through this module, so a note cleaned by the cleanup pass and a
selection condensed from the right-click menu produce **byte-identical output**.

---

## Invariants

- **The payload is the only thing that changes.** Detection splits text into
  `leading` / `payload` / `trailing`; a fence, the prose above it, and the blank
  lines around it are restored verbatim. A formatter that eats the prose around
  the JSON is worse than no formatter.
- **Never throws, never mangles.** Unparseable input returns `ok: false` and the
  input string unchanged — a formatter that rewrites text it did not understand
  is a data-loss bug.
- **Tolerant parsing is reported, never hidden.** `parser: "tolerant"` means only
  JSON5 accepted it (trailing commas, comments, unquoted keys). Re-emitting that
  as strict JSON silently deletes the user's comments, so consumers that write
  back to a document (the cleanup region ops) **refuse anything but `"strict"`**.
  A consumer that only copies may accept it.
- **`looksLikeJson` ≠ `ok`.** Bracket-shaped text that fails to parse is still
  "JSON-like", so a surface can show the section and report the parse error
  rather than silently offering nothing on a selection the user believes is
  JSON. `ok` is the gate for RUNNING; `looksLikeJson` is the gate for OFFERING.
- **A fence declaring another language is a hard no.** ` ```python ` is not our
  business even if its body would parse.
- **One fenced block per input.** Two fences in one selection is not a single
  payload; spanning them would splice unrelated content together.
- **An unterminated fence stays unterminated.** Inventing a closing fence changes
  the surrounding document's structure, not just this block's.
- **A bare scalar is not offered.** `42` and `"hello"` parse, but every prose
  number would qualify — a scalar root only counts inside an explicit json fence.

---

## Doctrine

- **Never fork the writer.** A new layout is a new `JsonFormatStyle` here, not a
  local pretty-printer next to a consumer. Adding one immediately gives the
  context menu and the notes cleanup pass the same new verb.
- **Never hand-roll detection.** "Does this start with `{`" plus a `JSON.parse`
  in a try/catch is exactly the helper this module exists to delete — it gets
  fences, surrounding prose, and JSON5 wrong every time.
- **A hint must be real.** Consumers showing "13 lines → 3 lines" compute it from
  the actual formatted output, never an estimate. An action that would be a
  no-op is dropped, not shown greyed out.

---

## Tests

`__tests__/json-format.test.ts` — detection (fences, prose, tolerant, garbage,
scalars), every style, key sorting, fence add/strip/preserve/indent, unterminated
fences, and the non-JSON no-op path.

---

## Change log

- `2026-07-25` — Module created. Extracted while adding JSON condensing to the
  notes cleanup pass and the universal context menu; built as a primitive first
  so both consume it rather than either owning it.
