# Education Library — how to work on this page

You are on the **Education Library** (`/education/library`, surface `matrx-user/education-library`).
This guide is for an agent helping the person here. Read it once before your first write.

## What the page is

One list of everything the person studies from, whatever made it. Four record types share it:

| `kind` | What it is | `format` values | Opens at |
|---|---|---|---|
| `fc_set` | a flashcard set (deck) | `flashcards` | `/education/flashcards/<id>` |
| `assessment` | a quiz or practice test | `quiz`, `practice_test` | `/education/quizzes/<id>`, `/education/practice-tests/<id>` |
| `study_media` | generated study media | `audio`, `summary`, `mind_map`, `memory_aid` | `/education/audio-study/<id>`, `/education/summaries/<id>`, `/education/mind-maps/<id>`, `/education/memory/<id>` |
| `note` | a study note | `notes` | `/education/notes/<id>` |

Three tabs split them by owner: **Mine** (`mine`, the person's own), **Shared with me**
(`shared`), and **Public** (`public`, anyone's public items). The page shows 25 rows at a time
by default (cards view), with a search box, a filter panel (type, format, status, visibility)
and a sort.

## What you can read

- `library_state`: `"ready"`, `"loading"` or `"failed"`. Only when it is `"ready"` do the list
  values exist. `"loading"` or `"failed"` is never an empty library; say the list has not loaded
  (and give `library_error` when it failed).
- `library_list` (shown to you in full, no lookup needed): what is on screen, in the person's
  current tab, search, filters and sort; the first 25 rows, each
  `{ id, title, kind, format, items, due, accuracy_pct, last_studied, mine }`.
  - `items` is the card or question count (null for formats without one).
  - `due` is how many items are due for review right now.
  - `accuracy_pct` is 0-100, or null until the person has studied it. Null is never 0%.
- `library_total`: how many items match in all (across pages). If it is larger than the rows
  you see, say so.
- `tab_counts`: `{ mine, shared, public }` for the current search and filters.
- `library_rows`: the same rows with every field (description, topic, difficulty, source
  material, workspace, owner, dates, and `href`, the item's own page). Look it up ONCE with the
  `context` tool only when you need those fields.
- `active_tab`, `search_query`, `active_sort` (e.g. `"updated desc"`), `active_filters`
  (e.g. `{ "kind": ["assessment"] }`), `list_page` (`{ page, page_size }`).
- `filter_options`: the filter values the library offers in this tab, with counts.

"What's in my library?" is answered from `library_list`, `library_total` and `tab_counts`
alone. Group by `kind`, name what is due, and mention the tab you are describing.

## What you can write

One target, **`library_view`**. It changes what the list shows, exactly like the search box,
tabs, filter panel, sort and pager. It saves nothing and changes no study item. The person
approves it on a card. Send only the keys you want to change:

```json
{ "tab": "mine", "kinds": ["assessment"], "formats": ["quiz"], "sort_by": "title", "sort_direction": "asc" }
```

- `search_query`: text; `""` clears it.
- `tab`: `"mine"`, `"shared"` or `"public"`.
- `kinds`: any of `fc_set`, `assessment`, `study_media`, `note`.
- `formats`, `statuses`, `visibilities`: values from `filter_options` (`subtype`, `status`,
  `visibility`).
- Each array REPLACES that filter; `[]` clears it.
- `sort_by`: `updated`, `created`, `title`, `kind`, `subtype`, `status`, `visibility`,
  `organization_name`, `owner_email`.
- `sort_direction`: `asc` or `desc`.
- `page`: 1 or more. A change of tab, search or filter goes back to page 1 unless you send
  `page`.

An unknown key or value refuses the whole change, with the reason, before any card is shown.
After it lands, the values you were given still describe the OLD view (they were captured when
your run started), so do not report the new list from them. Tell the person what you changed.

## What this page cannot do

The library has no save, rename, archive or delete for any item: its row menu is Open, Study
(flashcards), Attach to and Share. So there are no write targets for the records themselves,
on purpose:

- To change or delete an item, send the person to its page (`library_rows[].href`). Every one
  of those pages has its own tools.
- To create study material, send them to `/education/start` ("Create kit").
- To browse other people's public decks and save copies, send them to the Community Library,
  `/education/library/community`.

Never use generic scope, context or database tools to create, edit or delete these items. They
skip each type's own rules (card membership, study progress, sharing).

## When you are stuck

- Empty `library_list` with `library_state: "ready"`: nothing matches. Check `search_query`
  and `active_filters` before saying the library is empty, and offer to clear them with
  `library_view`.
- Something about the page is wrong or missing: report it with the `surface_feedback` target.
