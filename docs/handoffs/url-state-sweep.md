# URL-state sweep — agent brief

**Paste this whole file to a browser-capable agent.** It is the complete brief:
the law, how to test it, the pass bar, how to enlist a surface, and how to
report. Work route by route. Do not batch-rewrite.

---

## THE LAW

**The URL is the view.** Everything that changes *what the user is looking at*
lives in the query string, so that:

- **Refresh** reproduces exactly what was on screen.
- **A copied link** shows a colleague the same thing.
- **Back/Forward** walk the user's own decisions, not just the route.

### What belongs in the URL

Search, sort field + direction, filters, page, page size, active tab, selected
sub-view, date range, grouping, scope selectors (mine / shared / org / public).

### What does NOT belong in the URL

- **View STYLE** — density, column visibility, card-vs-table. That is
  `useListViewPrefs` (`lib/list-views`), a different axis: it is remembered per
  user, not per link.
- **Ephemeral UI** — which dialog is open, hover state, focus, scroll position,
  unsaved draft text.
- **Anything secret.** Never put a token, an email, or personal data in a query
  string. URLs land in logs, referrers, and screenshots.

### The three rules that make it correct

1. **Defaults are OMITTED, never written.** A pristine surface has a clean URL.
   `?p=1&ps=20` on a fresh page is a bug — it means every shared link carries
   noise that says nothing.
2. **Discrete decisions PUSH; high-frequency text REPLACES.** Sort, filter,
   page, tab → one history entry each, so Back undoes exactly one. A search box
   → replace, or typing "Washington" costs ten Back presses.
3. **Every write goes through `lib/url-state/useUrlState`.** A raw
   `history.pushState` fires no event and no popstate, so every *other*
   URL-backed control on the page keeps rendering **stale values**. This is a
   correctness bug, not a style preference.

---

## GROUND RULES FOR TESTING

- **ONE dev server, machine-wide:** `pnpm preview:start` (port 3001) /
  `pnpm preview:stop`. Never `pnpm dev`. Never a second server.
- **Log in:** `/api/dev-login?token=$DEV_LOGIN_TOKEN&next=/<route>` (token is in
  `.env.local`), or `admin@admin.com` / `<see AI_ADMIN_PASSWORD in .env>` at `/login`.
- Use the provider's in-app browser, not the user's Chrome.

### 🚨 Verification traps that will lie to you

I hit all three of these while building the reference implementation. Do not
trust a result that came from a synthetic event:

| Trap | What happens | Do this instead |
|---|---|---|
| `element.click()` | does **not** move focus, so `blur` never fires and a commit-on-blur looks like data loss | drive a **real** mouse click |
| synthetic `KeyboardEvent` | may never reach React's handler; Enter looks like it did nothing | drive a **real** key press |
| a stale dev-server bundle | routes 404, "Router action dispatched before initialization" | `pnpm preview:stop && rm -rf .next-preview && pnpm preview:start` |

**A green check you obtained by faking the input is not a green check.** When a
test fails, first ask whether your *method* failed.

---

## THE TEST — run all five on every surface

For each surface, first identify its view controls (search box, sortable
headers, filter menus, tabs, pager, page-size selector).

**1. Mirror.** Change each control one at a time. After each, the query string
must gain a parameter that plainly corresponds. → *Fail if the URL does not
change.*

**2. Clean defaults.** Load the route fresh. → *Fail if the URL has any query
parameters before you touch anything.* Then set a control back to its default →
*fail if the parameter lingers.*

**3. Refresh.** With 2–3 controls set, reload. → *Fail unless the URL is
byte-identical AND every control visibly shows its value AND the content
(rows/cards) matches what was there before.*

**4. Back / Forward.** Make three distinct discrete changes. Press Back three
times, then Forward three times. → *Fail unless the URL **and the rendered
content** step back and forward together.*

> This is where the reference implementation broke and where you should expect
> most failures: the address bar moves and the list does not re-filter. **Always
> assert on rendered rows, never on the URL alone.**

**5. Search does not spam history.** Record `history.length`, type 6 characters
in the search box, record again. → *Fail if it grew by more than 1.*

**Bonus (report, do not fix):** open the same surface in two tabs with different
views and confirm they do not interfere.

---

## THE PASS BAR

| Verdict | Meaning |
|---|---|
| **PASS** | all five, asserted on rendered content |
| **PARTIAL** | mirrors but fails 3 or 4 — usually a one-way sync. **This is the most common real defect.** |
| **ABSENT** | no view state in the URL at all |
| **N/A** | the surface genuinely has no view state (a detail page with no controls) |

A surface is only **enlisted** when it is PASS *and* uses `lib/url-state`.
PARTIAL is not enlisted — a half-working Back button is worse than none, because
the user learns to distrust it.

---

## HOW TO ENLIST A SURFACE

Pick by **shape**. Never hand-roll `history.pushState`.

```
one control owns one parameter      →  useUrlState(key, codec)
a cluster moving together           →  useMirroredUrlState({ parse, toParams, isSame, textKeys })
a MatrxDataTable                    →  lib/data-table/useTableUrlState
a bespoke grid                      →  compose useMirroredUrlState
```

**Worked reference — copy its shape:**
- `features/data-tables/table-view-url.ts` — the pure codec (+18 tests)
- `features/data-tables/hooks/useTableViewUrlState.ts` — the wiring
- `components/user-generated-table-data/UserTableViewer.tsx` — the consumer

**Use the shared parameter vocabulary.** `q` search · `sort` `<field>.<asc|desc>`
· `f` JSON filters · `p` page · `ps` page size. A second name for the same
concept is a small betrayal of every user who learned the first one.

### 🚨 The mistake you will otherwise make

Breaking the two-way sync loop by remembering *"the last URL I wrote"* and
skipping matches **looks correct and is not**. Pressing Forward to a view the
user already visited produces a URL you did write before, so the guard swallows
it — address bar moves, surface does not. **Break the loop BY VALUE:** compare
the decoded state to the current state and return the previous object when they
match. Your own write compares equal and stops.

---

## THE WORKLIST

**Never hand-maintain a list.** Two sources, both self-updating:

```bash
pnpm check:url-state          # every surface bypassing the primitive
pnpm check:url-state --json   # same, machine-readable
```

At the time of writing: **33 raw history writes across 21 files, all silent**
(none dispatch `matrx:url-state`). Densest first: `features/shell/` (6),
`features/files/` (8 across 4 files), `features/notes/` (2),
`features/content-ir/admin/` (2).

Then walk the `(core)` list routes for surfaces with view controls but *no*
history writes at all — those are ABSENT, and the guard cannot see them:
`/data` · `/agents` · `/notes` · `/files` · `/documents` · `/projects` ·
`/images` · `/crm` · `/lists` · `/reports` · `/podcast` · `/marketing` ·
`/knowledge` · `/rag` · `/education` · `/code` · `/messages` · `/artifacts`.

---

## SCOPE AND SAFETY

- **Route by route.** Test → fix → verify → commit that one surface. Do not
  sweep 21 files in one commit; that is how `/files`, `/notes` and the shell nav
  break together.
- **Do not "fix" what you have not tested.** A PARTIAL diagnosis must come from
  a failed run, not from reading the code.
- **`features/shell/components/NavActiveSync.tsx` (6 writes) is route-level
  navigation, not view state.** Read it before touching it and report what it
  is doing rather than assuming it is a fork.
- Shared checkout, many concurrent agents: `git add <your files>`, commit often,
  never `git stash` / `reset --hard` / `checkout -- .`.
- Run `pnpm type-check` before reporting done.

---

## REPORT

One table, plus a defect list:

| Route | Controls found | Mirror | Defaults | Refresh | Back/Fwd | Search | Verdict | Action |
|---|---|---|---|---|---|---|---|---|

For each failure record: the exact URL before and after, what the content did
(not just the URL), and the one-line cause. For each fix: which primitive you
used and the evidence it now passes all five.

End with the new `pnpm check:url-state` count so the number is seen to move.
