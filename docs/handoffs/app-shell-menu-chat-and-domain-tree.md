# Handoff — the app shell: one sidebar, one header, one chat, and the domain tree behind them

Owner until now: one Claude session (2026-10-01 → 2026-10-05), verified against the code on 2026-10-10.
Status: **mostly done and live; a short list of real gaps remains** (§2). Read this whole file before touching
`features/shell/**`, `styles/shell.css`, the chat dock, `features/shell/constants/nav-data.ts`, or the domain tree.

---

## 1. Vision (Arman's words, in the order he gave them)

**The principle.** *"The death of our system is when we have more than one copy of something to maintain."*
Every person gets **one sidebar and one header they can always count on**, on every page. The only allowed
splits are admin vs user, or genuine performance reasons.

### 1.1 Original asks (2026-10-01)
- **Own the sidebar and header.** Delete unused variants and merge the rest into one.
- **Bottom of the sidebar: three always-visible, evenly sized slots: Settings · Organization · You.**
  Collapsed shows icons, expanded shows text. Theme (light/dark) and Media move out of the avatar menu into Settings.
- **The organization control sits directly above the avatar.** It is the ONLY org selector. It shows the org's
  icon or a 2–3 letter abbreviation, reads and writes the same state, cookies and boot values, and shows every org
  problem. Org selection is removed from the header and the avatar menu.
- **The avatar** is centered and properly sized.
- **Header, right to left:** Notifications (no DMs) · Messages (its own count) · Canvas (always clickable, a
  permanent canvas) · Intelligence dropdown · Search. Nothing else is built into the header; routes may add their
  own actions.
- **The header buttons are tap targets that touch.** No padding or space in the code between them, even though the
  visible circles are spaced apart.
- **Everything works on mobile.**
- **The /board menu was the model:** the normal menu first, the page's own list (chat history) one flip away.

### 1.2 Additions and refinements (each one was explicit)
1. **Settings** (Oct 1): lose nothing. The Notion/Linear-style settings system is the one to keep, built as a
   shared core plus route, window panel and so on. Nothing risky.
2. **Configuration lives in feature knobs** (Oct 1). Anything outside knobs needs Arman's approval.
3. **Org menu** (Oct 1):
   - Remove "keep it at the top" completely.
   - Add a star to favorite any org.
   - Remove the "Working in ___" line; the active org is highlighted instead.
4. **The three bottom menus are identical** (Settings, Org, You), with a bit of color in the logos.
5. **Header edges match** (Oct 1): the last control sits exactly as far from the right edge as the first sits
   from the left.
6. **The menu model changed** (Oct 1–2). Arman: *"the flipping menu is amazing when done correctly"*, and
   *"we are not Linear… Google changes the menu for everything"*. The chosen model, the one used by VS Code and
   Microsoft Teams:
   - an **icon strip that never changes**;
   - an **area's own menu as a panel beside it, starting at the very top**;
   - **chat as the third column**.
7. **Chat is first-class and on ALL pages** (Oct 2): *"the new menu you are building MUST offer the chat on ALL
   pages."* No menu was to be shown without seeing how the chat fits next to it.
8. **The chat button never moves** (Oct 2): *"that button cannot be shown outside when it's open… it remains
   right in the same place."* It is one button, in one place, whether the chat is open or closed.
9. **Remembered layout** (Oct 2): the defaults are fine (chat open at 1440px and wider), but *"the moment the
   user does something… give them the same setup… I don't care what their screen size is."* Choices persist per
   page.
10. **The strip is built from the domain tree** (Oct 2): the product areas plus Industries, *"as long as you make
    100% certain that nothing is lost."* Merge duplicates into one parent (Workflows was listed twice). Anything
    with no home goes under a pink **"Other"**.
11. **Industries has three levels** (Oct 3): strip → industries → each industry's full menu. A dozen more
    industries are coming.
12. **Medical** gets a landing page built with the module-landing skill (Oct 3).
13. **Unreachable pages** (Oct 3): a Sonnet agent finds every page nothing links to, and they go on one list to
    kill or connect.
14. **The review page** (Oct 3–5):
    - one page of links that open in a new tab, each with a decision and notes;
    - built on the custom data system if it works, otherwise browser storage plus a Copy button;
    - later: make the decision meanings clear, and keep redirects and aliases out of the review group;
    - *"leave the pages as they are and I'll resolve them later."*
15. **The Canvas button is right-most** (Oct 4).
16. **The structure must make sense, starting at the core, not just the menu** (Oct 4). Arman: *"imagine 'files'
    being in media. We have an entire python package and separate server for handling our cloud files… that's
    totally backwards."*
    - Files (cloud drive), Media, Content (notes, documents), Data (custom and structured data) and Code are
      separate.
    - War Room is board-like, never under Projects.
    - Knowledge must not use the database icon.
    - Fix the domain tree and the registry, not only the menu.
17. **Naming** (Oct 4): **"Applet(s)"** is THE word for what customers build. Audio becomes its own area (TTS,
    STT, transcripts).
18. **After this session** (Arman, 2026-10-09, done by another lane): the strip's Board and Projects were merged
    into one **"Workspace"** area. Every place a person works is gathered there, Launchpad comes first, and the
    domain tree was updated to match. This supersedes the separate Board and Projects areas from item 16.

### 1.3 Why the key decisions were made
- **Strip + panel instead of one big menu:** every multi-app product (Teams, VS Code, Slack, Figma) keeps a fixed
  rail and gives each area its own panel. Users keep their bearings and each area keeps its own menu.
- **Chat on the left, beside the menus**, which is how the Board already worked. The canvas lives on the right
  edge, so the two never compete.
- **Domains come from the architecture:** an engine with its own package, server or schema that more than one
  area uses becomes its own domain, never a child of one consumer. That is why Files, Audio, Data and Web are
  domains.
- **Registry rows are re-parented in place (same ids):** about 380 settings, 73 entity types and 9 scheduled
  tasks point at node ids.
- **Administration keeps a full-width sidebar:** it is a separate site (manage.aimatrx.com) that does not contain
  the app's pages, so an app strip there would link to pages that don't exist.

---

## 2. Current state (verified 2026-10-10)

### Done and verified
| Area | What exists | Where |
|---|---|---|
| One shell | `AppShell` renders every (core), (admin), (transitional) and (dev) page; the old frames are deleted | `features/shell/components/AppShell.tsx`; guard `features/shell/__tests__/header-right-set.test.ts` |
| Header | Search · Intelligence · Messages · Notifications · **Canvas (right-most)**; 38px tap targets with 0 gap; both edges 8px from the screen (`--shell-edge-gutter`) | `features/shell/components/header/HeaderControlSet.tsx`, `HeaderPhoneOverflow.tsx`, `styles/shell.css` (search `shell-edge-gutter`) |
| Account rail | Settings / Org / You as one menu family (288px panel, `RailMenuHeader`, the same rows) | `features/shell/components/account-rail/{ShellSettingsMenu,ShellOrgSwitcher,RailMenuHeader}.tsx`, `user-block/` |
| Org favorites | Stars stored in `platform.user_entity_state` via `ues_set`/`ues_list` (entity_type `organization`); "keep at top" and "Working in" removed; colored `OrganizationMark` | `features/organizations/hooks/useOrganizationFavorites.ts`; `@ai-matrx/design-system` ≥ 0.50.0 |
| Domain panel | An area's menu sits beside the strip, starting at the top. 8 families use it: Settings, Agent Runs, Chats, Staff, Code, Marketing, Research, Images. Its own cookie means the main sidebar preference is never overwritten | `features/shell/constants/route-menu-registry.ts` (`layout: "panel"`), `features/shell/constants/sidebar-cookie.ts` (`SHELL_DOMAIN_PANEL_COOKIE`), `NavActiveSync.tsx`, `ShellSidebarCookieSync.tsx` |
| One chat | `ShellChatDock` on every signed-in page, including Board and Education (only /chat and /code stand aside). Per-page open/closed choice is a server-read cookie; with no choice it opens at ≥1440px; at 1024–1599px a person's own open folds a domain panel. One fixed toggle button; pop-out, ⌘\ and a phone sheet all work. Pages hand it context via `useShellChatContext` | **Source lives in aidream:** `aidream/apps/shared/chat/src/canvas/workspace/{ShellChatDock,shell-chat-route,shell-chat-dock-owners,shell-chat-page-context,ChatCanvasWorkspace}.ts(x)`; host side: `features/shell/components/header/ShellChatToggle.tsx`, the chat CSS in `styles/shell.css` |
| Strip | 25 entries: Workspace, Agents, Applets, Chat, Workflows, Intelligence, Masterwork, Knowledge (library icon), Web, Content, Data (database icon), Files (cloud icon), Media, Audio, Code, Computer, Publish, Communications, CRM, Marketing, HR, Integrations, Account, Industries (3-level), Other (pink) | `features/shell/constants/nav-data.ts` (`primaryNavItems`, `expandNavChildren`, `INDUSTRY_NAV_CHILDREN`) |
| Nothing lost | A frozen list of every href, window and action the old menu had, plus the old guest view; strip order; no row repeated; max 20 rows per flyout; 3 levels max | `features/shell/__tests__/nav-no-loss.test.ts` |
| Nested menus | Submenus stay open while used: rows inside a submenu never close it, and there is a 700ms grace for diagonal paths; arrow keys work; the phone drawer drills in | `features/shell/components/sidebar/NavFlyoutGroup.tsx` (+ `.test.tsx`), `mobile-sheet/MobileNavigationDrawer.tsx`, `MobileRouteMenuSlot.tsx` |
| Gated items | Make, Records and Kits show where their org switch is on (desktop, phone and phone search) | `features/shell/navigation/useShellNavGates.ts`; guard `features/shell/__tests__/nav-gates-are-wired.test.ts` |
| Active highlighting | Moved families light the correct strip icon (incl. /legal, /medical, /commerce, /user-settings/*) | `features/shell/utils/is-nav-group-active.ts` (+ test) |
| Domain tree | Rewritten from the architecture: files, content, data, audio, web, code (renamed from coding), computer; workspace re-defined on 10-09; the vocabulary says Applet | `common-docs/policies/domain-tree.md`, `common-docs/systems/platform/vocabulary/FEATURE.md` |
| Live registry | New domains and features re-parented in place; workspace (old) and lists-and-workbooks retired as `legacy` | `platform.taxonomy_node`; files `migrations/taxonomy_domain_tree_corrected_2026_10_04.sql`, `migrations/taxonomy_computer_domain_2026_10_05.sql` (applied and ledgered) |
| Docs moved | 9 node folders moved to their new domains; 411 links rewritten across 7 repos | common-docs `systems/{files,data,web,code,board}/…` |
| Medical | `/medical`: the guest landing plus a members page holding a tracked coming-soon promise (`medical.workspace`) and links to features that work today | `app/(core)/medical/`, `features/auth/components/module-landing/landings/MedicalLanding.tsx` |
| Unreachable pages | 26 working pages connected (admin "Feature maps" entry, HR My pay and Clock, New shortcut, org keyword-value, mandate overrides, Hindsight recipes, My Devices) | see the audit below |
| Review page | `/review/page-cleanup` (super admin): Delete / Keep / Unsure with a legend; aliases sit in an "Old addresses that forward" group showing their targets; notes; Copy. Saved through the custom data system (`defineAppTable` + `upsertAppRow`), with a localStorage fallback | `features/admin/page-cleanup/{PageCleanupReview.tsx,page-cleanup-rows.ts}`, `app/(core)/review/page-cleanup/page.tsx` |
| Notifications | The UI redo was finished on 2026-10-01 by its own session | `common-docs/systems/communications/notifications/` |

### Partial or drifted (needs work)
1. **The registry doesn't match the 10-09 Workspace ruling.** The tree doc says board + projects merged into
   `workspace`, but `platform.taxonomy_node` still has `board` and `projects` domains active and `workspace` as
   `legacy`. Re-parent `boards`, `war-room`, `dashboard`, `launchpad`, `start` (if present) and
   `tasks-and-projects` under a revived `workspace`, then retire `board` and `projects`, in place.
2. **The chat "stands aside" list is stale.** `OWN_CHAT_PATHS` in `aidream/…/shell-chat-route.ts` lists
   `/agent-apps/[id]/code`, but the applet code page is now `/applets/manage/[id]/code`, so it gets a second chat
   beside its own coding agent. Fix it in aidream, publish, then run `pnpm sync:matrx-packages` here.
3. **The org switcher still has a "Choose organization" state.** It contradicts the 2026-10-07 law (one active
   org, set at load, never none, nothing prompts — `common-docs/systems/account/organizations/STATE.md` rules
   11–14). See `ShellOrgSwitcher.tsx:66` (`asking`) and `useActiveOrganizationPicker` (`promptForOrg`). Its
   "Switch to X" offer for a record in another org also needs checking against "opening a record never switches
   it" (it is a click, not an automatic switch, but confirm against the law).
4. **Settings still outside feature knobs** (each needs Arman's approval):
   - 6 prompt preferences nothing reads (`lib/redux/preferences/userPreferencesSlice.ts`). Recommendation: delete.
   - The old sandbox preference fields, superseded by the `infrastructure.sandbox.defaults` knobs.
   - One preference in the Organizations settings tab.
5. **Page cleanup decisions are Arman's, and pending.** The three custom-data functions (`custom.table_find`,
   `table_ensure`, `record_upsert`) are **now live**, so the review page should save to the database. Re-verify
   that, and measure the first read: it took over 10s for admin, who belongs to 48 organizations.
6. **Old names in code and schemas:** Board tables live in the `projects` schema, notes in `workbench`, a
   `transcripts` schema, and a `features/data-tables` folder. These are planned moves, not edits.
7. **Two live record updates held back:** the Settings surface manifest still lists `default_organization`, and
   the route manifest still has the old `/settings/*` routes. Both are harmless.

### Not started
- Public sales site redo: `common-docs/projects/public-sales-site-redo/PLAN.md` (needs a vision session first).
- A phone icon-row layout. A deliberate choice: phones use list drill-ins, which suit non-technical users better.

### Known issues and risks
- **Pre-existing test failures owned by other lanes:**
  - `features/mandates/feature-intelligence` "projects › place create";
  - board `remount-safety.work.test.tsx`;
  - `boards-list-front-door.test.tsx` (its mock lacks `usePathname`);
  - `features/admin/constants/admin-navigation.test.ts` (/administration/usage lies outside Users).
- **The fold** (narrow desktop, chat open) closes the domain panel by setting the checkbox without a change
  event, so `useSidebarExpanded` listeners can briefly be stale. Harmless today.
- **The 10-09 strip changes came from another lane** (Workspace group, Board as one row, no add-rows in the nav).
  Treat `nav-data.ts` as shared, and re-read `common-docs/systems/platform/ui-shell/VISION.md` before changing the
  strip.

---

## 3. Architecture / orientation

```
AppShell (server)                      features/shell/components/AppShell.tsx
 ├─ .shell-root  (CSS grid; first track = sidebar width + --shell-chat-w)
 │   ├─ #shell-sidebar-toggle checkbox  → expanded sidebar, OR "panel open" on a panel family
 │   ├─ Sidebar  (strip + route menu)  sidebar/Sidebar.tsx, RouteMenuSlot.tsx, NavFlyoutGroup.tsx
 │   ├─ Header   (hamburger, ShellChatToggle [fixed], route center, HeaderControlSet)
 │   ├─ ShellUserBlock (Settings · Org · You)   user-block/, account-rail/
 │   ├─ <main class="shell-main">  page
 │   └─ ShellChatDock  (fixed, left of page; publishes --shell-chat-w)   @ai-matrx/chat
 └─ islands: NavActiveSync (data-pathname, data-domain-panel), ShellSidebarCookieSync, …
```
- **Menu data:** `features/shell/constants/nav-data.ts` is the one source. The desktop sidebar, phone drawer,
  phone dock (`dockItems`), launchpad and favorites catalog all read it. Use `expandNavChildren` to walk it flat.
- **Area menus:** `route-menu-registry.ts` maps a path pattern to a lazily imported menu component; adding
  `layout: "panel"` puts it beside the strip.
- **Root attributes CSS keys on:** `data-pathname`, `data-domain-panel`, `data-shell-chat-open`,
  `data-shell-chat-available`, `data-shell-chrome="canvas"`.
- **Chat:** the code lives in `aidream/apps/shared/chat`. This app installs it from npm (`latest`). Edit it
  there, publish, then run `pnpm sync:matrx-packages` here.
- **Domain tree:** the doc lives at `common-docs/policies/domain-tree.md`. Live registry rows are in
  `platform.taxonomy_node`; other tables (`platform.entity_types`, `feature_knob`, `scheduler.sch_task`,
  `agent.review_queue`) point to them by id. The Intelligence-by-area snapshot is
  `features/mandates/feature-intelligence/{taxonomy,placement}.ts`.
- **Tests to run after any shell change:** `npx jest features/shell` (about 274 tests), plus
  `aidream/apps/shared/chat` canvas tests in that repo.

---

## 4. Next steps, in order
1. **Registry ↔ Workspace ruling** (small, data only): write `migrations/taxonomy_workspace_merge_<date>.sql`
   modeled on the 2026-10-04 file. It must be atomic, raise on any unexpected row count, re-parent in place,
   and save a snapshot first. Apply it with `pnpm db:apply`, then verify with a SELECT.
2. **Stale chat path:** in aidream, change `OWN_CHAT_PATHS` to `/applets/manage/[id]/code`, add a test, publish,
   run `pnpm sync:matrx-packages` here, and check that page in the browser.
3. **Org switcher vs the one-active-org law:** remove the asking/prompt state if the load ladder guarantees an
   org (read STATE.md rules 11–14 first), and update `features/shell/__tests__/ShellOrgSwitcher.test.tsx`.
4. **Review page on the database:** confirm decisions persist through the custom data system on live, and fix
   the slow first read.
5. **When Arman rules:** page deletions (from the review page), the settings knob cleanup (§2.4), and the two
   held manifest updates.
6. **Planned schema and folder renames** (§2.6): one campaign, using the `db-move-table-schema` skill.

## 5. Gotchas
- **Shared checkout:** dozens of sessions work on `main` at once. Commit with `git commit --only <paths>`; never
  stash, reset, branch or create worktrees. Wait for `.git/index.lock` to clear. If a push is refused, run
  `git fetch && git merge --no-edit origin/main`. If that merge conflicts in files that aren't yours, abort it and
  leave your commit local; the release sync handles it.
- **Preview:** there is one dev server on port 3001, connected to the **live** database. Test only as
  admin@admin.com. Sign in with `pnpm dev-login /route`, which prints the URL for your own host.
  - A hidden browser pane pauses CSS transitions, so measurements taken mid-animation lie. Wait, or keep the pane
    visible.
  - The preview "parks" idle tabs. Click **Resume** and continue.
- **Live database writes:** the Supabase MCP sometimes declines writes. The sanctioned path is a migration file
  applied with `pnpm db:apply`, which records it in the ledger.
- **The tap-target guard** refuses padding on a tap button's own wrapper. Put the spacing on the header (as
  `--shell-edge-gutter` does), never on the wrapper.
- **The chat button is a single fixed element** positioned at the sidebar edge plus the gutter. Never render a
  second open/close control.
- **On a panel family the sidebar checkbox means "panel open".** Its state lives in `SHELL_DOMAIN_PANEL_COOKIE`
  and must never write the main sidebar cookie.
- **Submenus:** React hover events travel through portals. Any leaf `onMouseEnter` that schedules a submenu to
  close must skip rows inside that submenu.
- **Every list that renders nav children** must pass `useShellNavGates()` to `partitionNavChildren`, or gated
  items vanish silently.
- **Changes need Arman:** domain tree changes, deleting pages, and settings outside knobs. Agents propose; he
  rules.
- **Administration stays a separate site** with its own full-width menu. Don't put the app strip there.
