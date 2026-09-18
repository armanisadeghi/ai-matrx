# VERIFY-D — the topic panel, walked in a real browser

Lane D's browser walk, written to be EXECUTED by a verifier who did not build the panel, on a
machine that can host the app (this build's container cannot). Every step names what to click,
what must be on the screen, and what a failure looks like. No fixture, mock mode or seed script is
on; the build SHA is recorded at the top of the report.

## Setup

1. `pnpm preview:start`; open the printed `http://<session>.localhost:3001`. Sign in as
   `admin@admin.com` (`AI_ADMIN_PASSWORD`), or `pnpm dev-login /marketing/c2db36a1-…/content/map/e9df6779-8e0e-45e9-a664-375e7d1ecffd`.
2. Real data: All Green Recycling — map `e9df6779-8e0e-45e9-a664-375e7d1ecffd`, brand
   `c2db36a1-…`, site `d0aff5b6-0710-4848-8304-164db3c80ab7`. 50 active topics; `cable-and-wire-recycling`
   carries exactly one live page (`https://allgreenrecycling.com/wires-and-cable-recycling`, 2 clicks /
   586 impressions over 28 days on 2026-09-18) and one facet (`offering_kind: service`).
3. Knobs (live 2026-09-18): `detail_panel=window`, `topic_agent_change_mode=apply`,
   `description_regeneration_mode=queued`, `performance_window_days=28`.

## The walk

| # | Do | Must see | Fails if |
|---|---|---|---|
| 1 | On the outline, click **Cable and Wire Recycling**, then open its panel (row door / "Open topic panel" in the right-click menu). | A floating window titled "Topic". Name, `cable-and-wire-recycling` in mono, a path crumb **Electronics Recycling › Cable and Wire Recycling**, counts `1 page · 0 planned · 0 keywords`, the description. | Drawer instead of window while the knob says `window`; a slug where the crumb should be a name; counts printed when the outline loaded without them. |
| 2 | Click the name. Type `Cable and Wire Recycling (test)`, Enter. Then rename it back. | The name changes in place AND in the outline behind the window (same slice); no reload. | A dialog; the outline not following. |
| 3 | Click the description, edit one word, Cmd/Ctrl-Enter. | Saved in place. | Nothing saved; a toast with no sentence. |
| 4 | Change status to `retired` in the status select, then back to `active`. | Both writes land; the outline's mark follows. | — |
| 5 | Clear the name entirely and commit. | The editor cancels (empty is not a rename). Now rename to a name and set slug… skip. Instead: open Change → Move → pick the topic's own child (none) / pick `(root of the map)` → Preview. | Preview shows `seo.map_dry_run`'s `would_return` and a consequence sentence naming the move; **Move** is the second click; Cancel. | Move runs on the first click; an "Are you sure?" with no consequence. |
| 6 | Change → Retire → policy "Refuse if anything is attached" → Preview. | The function's own 23514 sentence naming the attached page appears VERBATIM in red under the form (the refusal is the function's, not reworded). Cancel. | A generic error; a reworded message; the topic retired. |
| 7 | Facets: the `offering_kind service` chip has an X; hover a chip on a child topic whose value is inherited — e.g. open **Hard Drive Shredding** (child of a topic that sets `offering_kind`). | Own chip: solid, with X. Inherited chip: dashed, no X, "from <parent name>", and a "Set on this topic" picker. | An X on an inherited chip; "from <slug>". |
| 8 | Open the `region` facet picker on any topic. | The values list is two-level: a state, then its cities indented, "(all)" for the state itself. Pick one, then clear it. | A flat list of 255 places. |
| 9 | Pages section. | `traffic over 28 days` on the right; the page row: a green dot (in place), the name as an EntityRef (Open / peek / new tab), `2 / 586`, an external-link icon to the live URL. If the page has a CMS record and `?site=` is set, a CMS icon too. | A bare `<span>` name; traffic without the window; a dot for a page whose intent the workspace never listed. |
| 10 | Open the map's **pages** screen, set an intent (move) on that page, return to the panel. | The dot is amber (leaving). | Still green. |
| 11 | Planned pages → **Make a page here** (with `?site=d0aff5b6-…` in the URL). Title `Verify D planned page`, create. | A toast, the new node listed with a door to `/marketing/content-plan/nodes/{id}`; the content plan shows it under the site with `topic_id` set (`plan.node.topic_id`). Then delete that node in the content plan (it was made for this walk). | The control hidden; a node with no topic_id; the write going through the Python server. |
| 12 | Without `?site=`, on a map used by one site. | The dialog names that site; on a map used by none it says so with the remedy ("site uses map"). | A silent no-op. |
| 13 | Keywords section (on a topic with keywords — check the workbench first). | Each keyword a chip linking to the Keyword Workbench; the section action "Keyword Workbench" opens it in a new tab with `topic=<slug>`. Without a brand route: "workbench needs the brand route". | A dead label. |
| 14 | Attached → **Attach** → pick anything (a note). | The sheet opens; the attach is REFUSED by the database with `Unknown association type: note -> seo_map_topic … Register it in platform.association_types first.` shown on the picker's own error line. Register `web_youtube_video → seo_map_topic` is already registered: attach a YouTube video if one exists in the org. | A silent success; a reworded refusal. |
| 15 | With any generic kind attached (see 14, or register a pair in `/administration/database/relationships/rules` and attach one): | The row appears under a group headed by the registry's plural label and an icon (e.g. "YouTube videos 1"), an EntityRef, the role, and a detach X — with no code change. | A kind missing from the panel; a `switch` in the code. |
| 16 | History section on a topic that was retired and restored. | Rows: status, time, actor short id (full id in the title), tier as recorded, "still attached: …". | Invented tier; missing rows. |
| 17 | **Rewrite description** / **Ask about this topic**. | While `seo.topic_curation` has no `mandate.definition` row: both disabled AND the sentence `Not available yet — this runs the job "seo.topic_curation"…` under them. Once Lane S provisions it: click opens the mandate window IN PLACE on that job, with this surface's values (map_id, selected_topic_slug) visible in the window's scope; below the buttons the line `Rewrite: the new description is queued for review. Changes: changes are applied as the agent makes them.` | A link to `/mandates`; a live-looking button that fails on click; values missing from the window. |
| 18 | Top Agents menu (shell header). | "Topic agent" listed for this surface (manifest `agentRoles`); no chip/badge on the panel itself. | A visible disclosure block on the panel. |
| 19 | Right-click inside the panel. | The v3 menu with the topic section: copy slug, move, retire/reject enabled; "Open in a window" disabled with its reason. Export → Download as Markdown works. | The page's menu underneath. |
| 20 | Set the knob `detail_panel=drawer` for the org, reload, open a topic. | The SAME body inside the side drawer. Mobile 375×812: a bottom drawer. | Two different bodies. |
| 21 | On `/chat`, use an `EntityRef` to any topic (e.g. from a research note) → Quick look. | The peek renders the same body read-only: every write control ABSENT (no Attach, no Make a page, no Change, no agent buttons, no X on chips), everything readable present; the panel loaded the tree itself. | "Topics are not loaded here yet" on a peek; a disabled write control. |
| 22 | Open `/marketing/topical-maps/topics/<id>` for a retired topic, and for an invented id. | The retired one: the P0002-style sentence "This map has no topic … History screen"; the invented id: the access gate's denial, identical to a foreign id. | Different answers for foreign vs invented. |
| 23 | Light and dark theme through steps 1–9. | Every state visible in both. | A raw white/black. |

## Guards the coordinator runs once after the merge

`pnpm type-check` (0 in `panel/**`), `pnpm check:dead-ends`, `pnpm check:agent-disclosure`,
`pnpm check:mandate-keys` (allowlist rows carry the key), `pnpm check:scroll-chain`. Lane-local and
green here: `pnpm check:parse`; `jest features/marketing/seo/topical-map/panel` (14 cases).
