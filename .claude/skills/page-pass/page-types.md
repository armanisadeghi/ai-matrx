# Page types — name yours before running the core

Every page is exactly one type. The type says which core rules change and what
it adds. "Core" = the seven areas in [`SKILL.md`](./SKILL.md); everything not
mentioned here applies unchanged.

**Two top-level families first:**
- **Promotional** — someone who isn't using the product yet reads it. Selling,
  explaining, pricing.
- **Everything else** — someone is using the product. The first-screen rules
  (core 3) apply in full: title alone, no filler, no wasted space.

Where the route lives is a strong hint, never the answer: a page in `(public)`
can be a shared link, and a page in `(core)` can be a course's public page.
Judge by who is looking at it and why.

---

## Promotional
- **Recognize it:** a visitor who isn't signed in, or hasn't started, is the
  audience; the page wants them to understand, trust, or sign up. Home,
  `how-it-works`, `why-ai-matrx`, `pricing`, `free`, `developers`, `download`,
  a feature's public landing page, a course's public page.
- **Changes:** core 3's "title stands alone" and "no wasted space" do NOT
  apply — headlines, descriptions, pictures and generous space are the point.
  Core 1 is usually light: a surface that exposes the page's copy is enough;
  no write targets.
- **Adds:** one clear primary action per screen (sign up, try it, contact);
  every claim is true today (no promise of a feature that doesn't exist — a
  future feature goes through the Coming Soon registry); OG image and
  description set; fast first load; reads well on a phone before a desktop.

## List page
- **Recognize it:** the page's job is a collection of one kind of thing —
  notes, agents, contacts, classes — to find, open, create, archive.
- **Adds:** `EntityListPage` (or `MatrxDataTable` for tabular data) with
  search, sort, filter, saved view preferences, and the archive control;
  empty state says what the list is for and offers the create action; every
  row opens its record; the right-click menu is delegated per row (right-click
  a row → that row's actions). Core 1: the `list` inline tier for the
  condensed visible list, the full rows as a lookup value, and full
  create/update/delete targets for the record type.

## Single-record page
- **Recognize it:** one thing, viewed or edited — a note, an agent, a class, a
  document, a contact. Usually a route with an id.
- **Adds:** the header names the record (a switcher/dropdown for `[id]`
  routes), with Back doing `router.back()`; unsaved changes are never lost
  (autosave or a clear save state, and a guard on leaving); the page's
  `contentSource` and `entity` are the record's own, so Copy, Export, Attach
  and Share work on it; a missing or forbidden id shows the access gate, never
  a blank or a raw error. Core 1: the `record` inline tier for the record,
  `draft` targets for the fields a person authors, and the record's own
  child lists get their own create/update/delete sets.

## AI workspace
- **Recognize it:** AI does the work live here — chat, agent runs, a builder's
  test pane, a battle or comparison.
- **Adds:** output renders only through the one stream pipeline (never a
  hand-built renderer); a run survives a page refresh; a stalled or failed
  stream says so and offers a retry; the person's typed input is never lost.
  Core 1: the agent that IS the page receives only its own engineered inputs,
  never the page's values; outside helpers may still bind.

## Dashboard or report
- **Recognize it:** numbers, status and charts, read more than edited.
- **Adds:** every number opens the list of records behind it (a count over
  our records is never a dead end); every chart and table can be copied and
  copied for AI; time range and filters are visible and are values the agent
  sees; no decorative tiles — a number earns a tile only if a person acts on
  it. Core 1: usually read-only values; write targets only for the filters.

## Settings page
- **Recognize it:** choices that change how something behaves — preferences,
  configuration, connections.
- **Adds:** every setting shows its current value and its default, and what
  it affects in one short line; a change saves visibly (or has one clear save)
  and can be reset to default; a setting reads from the one settings system,
  not a second copy. Core 1: each setting group is a write target with a
  description naming every allowed value.

## Admin page
- **Recognize it:** under `/administration` or `manage.aimatrx.com` — our own
  internal tools.
- **Changes:** content sits below the header by design (core 3's
  header-clearance rule is already met by the layout); the admin seat never
  acts as itself — no "Mine", "My orgs" or active-org filters; a management
  page shows only the platform's own records.
- **Adds:** otherwise the list/record/dashboard/settings rules for whatever
  the page is.

## Window or pop-up
- **Recognize it:** it floats over another page — a window panel, a dialog
  with its own surface, a sheet.
- **Changes:** no page header, tab title or favicon (core 3's header rules and
  core 5's title/favicon rule are `na`).
- **Adds:** it mounts its OWN right-click menu and surface (otherwise the page
  underneath answers with the wrong agents); the page behind stays visible and
  clickable; the header drags it; its phone presentation is set (full screen
  or bottom sheet); a dialog with its own fields marks its root
  `data-surface-layer`. Procedure: `window-panels`, `surface-authoring/references/overlay-surfaces.md`.

## Shared link
- **Recognize it:** a page someone was SENT — a form to fill in, a shared
  document, a booking or reminder page, an unsubscribe page (`(link)`, and
  `/p`, `/s`, `/l`, `/r`, `/c`, `/open`, `/unsubscribe`, `appointment-reminder`).
- **Changes:** no app chrome at all — no shell header, nav or marketing
  footer; core 1 is usually `na` (no signed-in agent).
- **Adds:** a stranger understands it with zero context: who sent it, what it
  is, the one thing to do; works fully on a phone; an expired or invalid link
  says so and what to do next.
