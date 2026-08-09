---
status: active
updated: 2026-08-09
repos: [matrx-frontend, aidream]
vision: [/Users/armanisadeghi/code/common-docs/policies/no-dead-ends.md]
---

# No Dead Ends sweep — every identity is a door

Campaign to bring the whole UI onto THE DOOR LAW. Expect weeks. Waves ship
independently; the registry work lights up many surfaces per edit, so it always
outranks per-surface patches.

## Vision — Arman's words (2026-08-08)

> "It looks the part, but then it's just complete garbage. It's telling me I'm
> using one of my own agents, not a system agent. That's cool that the system
> gives me that data. But now I'm trying to do something about it, and the
> system is just missing all the tools I would need to do something about it.
> Where's the link to my agent? Where's the button I just click that opens a new
> tab to show me my agent?"

> "The entire Internet was built on that concept — that you refer to a site, you
> link to it. Yet within our own app, we refer to agents, but we don't link to
> the agent."

> "We have so many features, and they're just not used. We cannot have amazing,
> powerful code dying in a corner because an agent was too lazy to go looking
> before it built a feature."

No size threshold, no exemption for admin pages, demos, dialogs, or toasts.

## Resources

- Doctrine: `/Users/armanisadeghi/code/common-docs/policies/no-dead-ends.md`
- Recipe: the `no-dead-ends` skill · CLAUDE.md § NO DEAD ENDS
- Primitives: `components/official/entity-ref/EntityRef.tsx` (name + doors) ·
  `components/official/entity-ref/doors.ts` (the one resolver) ·
  `components/official/matrx-data-table/MatrxUuidCell.tsx` (id + doors)
- Registries to EDIT (never patch a call site): `features/scopes/registry/entityRegistry.ts`
  (`hrefFor`) · `features/organizations/peek/registry.ts` + `kinds-list.ts` (peek) ·
  `features/overlays/openers/` (window)
- Worked reference: `features/admin/agent-slots/` (FEATURE.md § THE DOOR LAW)
- 🚨 **A door you added can still be INVISIBLE.** `EntityDoorControls` renders at
  `opacity-0` and fades in on hover. It used to reveal ONLY on the named
  `group/entity-ref`, so a standalone caller that forgot that one class shipped
  a door nobody could see — markup right, type-check green, lint green. That
  happened **three times** on 2026-08-09 inside this very campaign (both
  debug-window sidebars, then `DuplicateUploadDialog`), each caught by Bugbot
  and by nothing else. **Widened in the primitive** (2118fda9): it now also
  reveals on a plain Tailwind `group`, which nearly every row already carries —
  but that did NOT save the third case, whose row had no group class at all.
  Use `alwaysShowActions` whenever the surface has no hover affordance of its
  own, and always for a dialog: the user is being asked a question and the
  control that answers it must be on screen when the question is.
  **Repeated occurrences are a default problem, not separate mistakes** — whether
  standalone controls should be visible by default is filed for Arman as
  `.matrx/ARMAN_TASKS.md` item 0a. (It has now happened five times: the two debug
  sidebars, `DuplicateUploadDialog`, the test-modal task rows, and
  `PermissionsList` — the last two caught at write time by asking the question,
  not by review.)

  ✅ **Swept 2026-08-09: every `EntityDoorControls` on this branch is visible.**
  Each one either passes `alwaysShowActions` or sits under an ancestor carrying
  `group` / `group/entity-ref` — including the three that pass the door as a
  PROP (`ListRow`'s `door=`, the history sidebar `Section`'s `action=`), where
  the class lives in the consuming component and a same-file grep would miss it.
  **Re-run that check after any wave**; the one-file view is not enough. The wider lesson for this sweep: **"the door renders" is
  not "the door is reachable"** — and only a browser can settle the difference,
  which is why the section below matters.
- 🚨 **`EntityRef` ALWAYS makes the name a same-tab link.** There is no prop to
  turn that off — `EntityDoorControls` is the surface that offers peek + new tab
  *without* it (`showOpen` opts same-tab back in). So the choice between the two
  is not stylistic, and "it's a dialog" is not the test. **The test is where the
  surface's state lives:**

  | The surface's in-progress state | Door |
  |---|---|
  | Redux, or nothing worth keeping | `EntityRef` — all three doors, name links |
  | Local `useState` the user typed or decided (a textarea, an accept/reject set, a list of launched runs) | plain name + `EntityDoorControls` sibling |

  A same-tab navigation unmounts the dialog/modal and destroys local state with
  no way back; Redux state survives the route change, so the user lands on the
  same unsaved record and loses nothing.

  Written because it was got wrong: on 2026-08-09 five surfaces in this campaign
  were given `EntityRef` **with docblocks claiming same-tab Open was disabled to
  protect the session** — the comment described `EntityDoorControls`' behaviour
  while the code did the opposite. Bugbot caught the contradiction. Resolved in
  both directions after checking each surface: `CleanupReviewDialog` (local
  accept/reject set), `AgentExecutionTestModal` (local list of launched runs),
  `NotifyOwnerDialog` (typed note), and `PromoteToGlobalModal` (edited label
  override) moved to sibling controls; the three window panels kept `EntityRef`
  and had their comments corrected, because their dirty state is in Redux.
  `DuplicateShortcutModal` and `ShareModal` also kept it — two dropdowns and a
  tab index are cheap to rebuild. **Do not blanket-apply either primitive; check
  where the state lives.**
- 🚨 **A uuid-shape check does NOT prove an id is the entity you think.** A
  shortcut id and an agent id are both uuids. Any id you DERIVE — parsed out of
  a key, read from an untyped column — needs a vocabulary that says what it is,
  not a regex. `features/agents/utils/surface-key.ts` is the worked example:
  only 5 of 22 live `surfaceKey` prefixes embed an agent id, and linking the
  rest as agents shipped `/agents/<shortcutId>` from `CreatorHubWindow` on
  2026-08-09 — the same wrong-record class fixed two commits earlier, guarded by
  `isUuidValue` and still wrong. Unknown prefix → no door; guessing is the bug.
- **A deep link that resolves to nothing is a dead end too.** `?user=`,
  `?category=`, `?block=` each rendered an ordinary empty state while the
  address bar still named a record — three separate surfaces, same defect, all
  found by Bugbot. Use `components/official/deep-link/`:
  `useDeepLinkParam(key)` for the param + a correct `clear`, and
  `<DeepLinkMissNotice>` for the miss (says the record is not in THIS list,
  still offers peek/new-tab because "not here" ≠ "unreachable", one-click
  clear). **Condition the surface's `emptyState` on the same flag** — two
  components disagreeing about why the list is empty is worse than either alone.
- Test login: `/login` → `admin@admin.com` / `Password1234#`

## 🚨 NOTHING IN THIS CAMPAIGN HAS BEEN SEEN IN A BROWSER

**Every door landed so far is verified by reading route files, route builders,
live function definitions, `pnpm type-check`, ESLint and unit tests — never by
loading a page.** No agent on this campaign has run a browser, and the ones that
tried could not.

This is not laziness to be scolded out of the next agent: **a cloud agent session
cannot reach the app.** The network policy refuses `aimatrx.com`, both Vercel
preview hosts, and `db.matrxserver.com` outright (403 at CONNECT — check it with
`curl -sS "$HTTPS_PROXY/__agentproxy/status"` before spending a wave on it). No
page loads, and no Supabase read succeeds, so the `/login` credentials above are
useless from here. Do not burn a wave rediscovering this, and do not claim a
surface is "verified" on the strength of a type-check.

What that leaves unverified, and what a human or a session that CAN reach the app
should look at: layout under the new anchors (a name that became a link inside a
truncating flex row), the `/chat` sidebar agent chip at narrow widths, the two
structured-list sidebars after their `<button>` → `<div>` + controls split, and
every "hover reveals peek / new-tab" affordance — hover states are exactly what
static analysis cannot see. The per-wave "routes to open" lists in **Done** below
are written for that pass.

Two specific questions an adversarial review raised that ONLY a browser can
settle — both are "did we add a door that doesn't open?":

1. **Does `/organizations/[orgId]` degrade gracefully for an org the user can see
   but not open?** Shared rows carry an `organization_id` for orgs the viewer
   may not be a member of, and several surfaces now mint a door from it
   (`ProjectsHub`, `/agents/all` Organization cell). If that route hard-errors
   instead of showing a "no access" state, those are NEW dead ends on the
   shared/orgs scopes. Needs a two-account pass.
2. **Does dnd-kit swallow clicks on the new door controls in the files table?**
   The `<tr>` spreads `useDraggable` listeners, and the door controls are ~20px
   targets — a few pixels of pointer drift could be captured by the drag sensor
   before the click resolves. The pre-existing name button has the same
   exposure, so this may be a non-issue.

## Remaining work

Ordered by traffic. Each item is independently actionable.

1. **`(core)` surfaces — audited 2026-08-09, in progress.** The audit found ~30
   HIGH/MED surfaces and ~130 `router.push`-only navigations (a row that
   navigates on click but is not an anchor: no cmd-click, no middle-click, no
   new tab — a Door Law violation even though clicking "works").
   **In flight:** `lib/entity-list/` shell, `/agents/all` columns, `/chat`
   history sidebar, `/rag/library`, `/war-room/all`, `/lists`, `/files`,
   `/tasks`, `/projects`, `/marketing/{brands,sites,pages}`.
   The agent-adjacent card/panel surfaces named here are DONE — see the
   agent-adjacent entry under **Done**. The `MatrxColumnDef` files under
   `features/marketing/**` are DONE too — see the marketing-tables entry.
   Already correct, do not redo: `features/crm/components/record/*`,
   `features/dashboard/**`, `components/user-generated-table-data/TableCards.tsx`,
   `features/research/components/landing/TopicList.tsx`,
   the conversation-history ROW level, `features/data-tables/components/DocumentListCard.tsx`,
   `features/rag/components/RagHomePage.tsx`, `features/tasks/components/CompactTaskItem.tsx`.

2. ~~**Remaining admin consoles.**~~ DONE. The `features/agents` /
   `features/skills` / tool-registry consoles (`…/system-agents/agents`,
   `…/shortcuts/all`, `…/mcp-tools`, `…/skills`, `…/bundles`) — see the
   tool-registry + skills entry under **Done**. The `features/podcasts` /
   `features/content-ir` four (`/administration/knowledge/{podcasts/shows,
   kg-inspector}`, `/administration/utilities/{kind-registry,content-blocks}`)
   — see the podcasts / KG / kind-registry entry under **Done**.
3. **Dialogs / drawers / warnings — audited 2026-08-09. Every HIGH is closed.**
   13 HIGH + 16 MED found across `components/dialogs/**`, `features/overlays/**`,
   `features/window-panels/windows/**` and every `*Dialog`/`*Drawer`/`*Sheet`.

   **Landed (all HIGH):** `ItemDetailWindow` (generic fallback window — record
   doors in the title bar + every `<token>_id` column openable; divergent item
   types now declare `entityToken` in `features/item-presentation/registry.tsx`)
   · `ManifestDriftDialog` (**false green** — it said "Everything is in sync"
   while holding uncounted `surfaceLabelDrifts`/`valueGroupsDrifts`) ·
   `ShareModal` · `ErrorInspectorWindow` (its `Field` now takes a `token`) ·
   `AgentDebugWindow` + `StreamDebugHistoryWindow` · `ReassignResourcesDialog`
   (+ new `features/organizations/admin/routes.ts`) · `DuplicateUploadDialog` ·
   `ScopeMismatchDialogHostImpl` · `NotifyOwnerDialog`.

   **Remaining, all MED — the `agent-shortcuts` modal family:**
   `LinkAgentToShortcutModal` (`:233/:388/:480/:498`, and `:398` resolves
   "already linked to an agent" then refuses to say WHICH) ·
   `DuplicateShortcutModal` (`:138/:217/:271/:292` — `:217` is a truncated bare
   scope id, and `scope` has an `hrefFor` now) · `PromoteToGlobalModal`
   (`:172/:319/:341`). All three name a shortcut/agent/scope with the id in
   scope. Note `:388` is a picker `<button>` — that one needs
   `EntityDoorControls` as a SIBLING, not an anchor.

   The scattered MED set is **DONE**: `ObservationalMemoryWindow`,
   `AgentContentWindow`, `CreatorHubWindow`, `AgentExecutionTestModal`,
   `CleanupReviewDialog`, `MoveNoteDialog` (`noteId` is now a REQUIRED prop, so
   all four callers were forced rather than grepped), `AddToSetDialog`,
   `ApplySchemaDialog`, `LibraryDocDetailSheet` and `PermissionsList` all carry
   doors.

   ⚠️ `PermissionsList` is only **partly** done, deliberately. Its
   `getPermissionLabel` returns a person's name, an org name, or "Everyone" from
   three branches. The ORG branch links. The USER branch has **no door and must
   not get one yet**: `user` has no registry token, and `AdminUserRef` is the
   wrong door here for the same reason it is wrong in org-admin — this is a
   `(core)` sharing surface reached by ordinary members, for whom
   `/administration/users` is a 403, and a door the viewer cannot open is worse
   than none. Blocked on the `user` registry decision below, not on a call-site
   patch.

4. **Toasts — swept 2026-08-09. The REACHABLE ones are done.** An inventory
   found ~25 sites where a toast named a record it would not let the user open;
   the highest-value class was structural — `duplicateAgent` returns the new
   agent's id and **all three callers threw it away**.

   Done: agent duplication (×3), the fork branch (whose toast literally said
   "open it from the conversation sidebar"), org / project / task / party
   creation **including both partial-failure paths**, the war-room file, the
   system app, the podcast show, the restored CRM party, the schema-overwrite
   agent, the created brand, the reassign destination member, the agent-slot
   repin, the duplicated conversation, the one file that failed in a batch, the
   new bundle, and the added marketing page.

   The primitive is `toastDoor(token, id, { href?, label? })`
   (`components/official/entity-ref/toastDoor.tsx`) — sonner renders a ReactNode
   `action` raw, so the door is a real `<Link>`: same-tab, cmd-click and
   middle-click all work, where an `onClick` would give one and steal the rest.

   **What is left is NOT call-site work** — see the route-blocked and
   toast-system limits recorded above. Do not "finish" this item by forcing
   links onto entities that have no page.

   **Badges were not swept.** The count-is-a-door corollary is only partly
   covered: `ReassignResourcesDialog` got the destination-member door, and the
   deliberately-inert counts are listed in the Blocked section. A systematic
   badge pass has not happened.
5. **`(dev)` demos** — audit in flight 2026-08-09.
6. **aidream admin surfaces** — after matrx-frontend.
7. **Collapse the `AssociationList` fork.** It has ZERO live JSX consumers;
   war-room renders `WarRoomResourcesList`, a second implementation of the same
   grouped row list, while three war-room docblocks still call `AssociationList`
   "canonical". Both carry doors now, so this is cleanup, not a dead end.
   Logged in `.matrx/PATROL_SIGHTINGS.md` (P2).

   ⚠️ **"Zero JSX consumers" does NOT mean the file is dead — do not delete it.**
   The MODULE is still the shared type contract: `WarRoomResourcesList`,
   `useThreadResourcesAdapter` and `ThreadResourcesTab` all import
   `ContainerResourcesAdapter` / `ContainerResourceRow` from it. Deleting the
   component without first moving those types breaks war-room's build. Collapse
   means "one implementation, types where they belong", not "remove the loser".

   Also scoped-out deliberately: this is a Tier-1 refactor, not door work. It
   stays tracked here rather than being folded into a doors wave.

### Registry gaps — the highest-leverage open work

**One registry edit lights up every surface at once, so these outrank any
per-surface patch.** Consolidated from three independent audits on 2026-08-09;
each was verified against `entityRegistry.ts` and the generated entity types,
not assumed.

**No token at all** (nothing to resolve — the name is unavoidably plain text):

| Token | Where it bites |
|---|---|
| **`user`** | THE most frequent gap in the whole campaign. Every actor/owner/assignee/recipient column in `(admin)`, `ShareModal`, `PermissionsList`, `ReassignResourcesDialog`, `NotifyOwnerDialog`, `FeedbackWindow`. Worked around by `AdminUserRef` (admin-only). See item 8. |
| **`ai_model`** | `ModelSwitchConflictDialog` — both model ids are in state and neither resolves. |
| **`ui_surface`** | `ManifestDriftDialog` (every drift row names a `surfaceName`), `SurfaceContextWindow`. |
| **`mcp_server`** | `McpServersSection`, the tools manager. A route now exists (`?server=`), so this is just the registration. |
| **KG entity** (`rag.kg_entities`) | KG inspector. |
| **Content block** (`skill.render_definition`) | Kind assets, content-blocks manager. |
| **`industries`** | Every "Industry — X" grant label. |
| **`skill_category`** | Every category header in the skills browser is inert text. |
| **`recipe`** | Not in the generated registry at all. `RecipesGridUnified` / `RecipesGrid` duplicate a recipe and discard the new id (the POST body is never even read). |

**Slug-keyed routes the id-shaped `hrefFor` cannot express** — `pc_show`'s
canonical page is `/podcast/[slug]`, so registering an `hrefFor(id)` would mint
a link to a record that does not exist under that key. Call sites pass an
explicit `href` instead (`CreateShowDialog`). Either the overlay grows a
slug-aware form, or these routes gain id resolvers like `/scopes/s/<id>` — an
owner's call, not a per-surface patch.

🚨 **The registry route is not always the RIGHT door for the viewer — and this
needs a CHECK, not a rule.** `app` resolves to `/agent-apps/<id>`, the owner's
overview, which is wrong for an operator who just created a system app from the
admin console (`/administration/agents/agent-apps/edit/<id>`). Same shape as the
org-admin 403 reasoning: right record, wrong door for who is looking.

I wrote that as a prose rule and then committed **the identical defect one
commit later** in `AgentSlotsConsole`, whose repin toast used `/agents/<id>`
while the other five links on the page all call the file's own
`agentHref(id, agentType)`. Both caught by Bugbot, not by me. So the rule is
now mechanical:

> **Before adding a door in any `(admin)` / `features/admin/**` file, grep that
> file for an existing href helper** — `grep -oE "[a-zA-Z]+Href\(" <file>`. If
> one exists and covers this entity, pass it as the `href` override. The
> surrounding page is the authority on where its own records open.

Swept the whole branch this way on 2026-08-09: 15 admin-path files carry doors,
`AgentSlotsConsole` was the only miss. `scheduling/runs` and
`ExposureAuditClient` already route through their local helpers;
`KgInspector`'s `mentionHref` takes a mention row, not an org, so the registry
route there is correct. `agent-apps/categories` deliberately has no door on its
deep-link miss — `categoryHref` would link back to the same page with the same
unresolvable param.

🚩 **Wave 4's remainder is blocked on ROUTES THAT DO NOT EXIST, not on call-site
work.** Checked on 2026-08-09 against both the generated registry and the `app/`
tree: `plan_entity`, `study_goal`, and `pc_episode` are registered tokens with
no `hrefFor` **and no per-record page to point one at** — content-plan is a tree
editor at `/marketing/content-plan/[siteId]`, study aids are keyed by slug with
no goal detail, podcasts stop at `/podcast/[slug]` for the SHOW. `brand_asset`
is not registered at all. Adding `hrefFor` for these would mean inventing
routes, which is the wrong-record defect wearing a helpful face.

So the honest state: **those toasts stay doorless until someone builds the
detail pages**, and that is a product decision, not sweep work. `toastDoor`
already returns `undefined` for them, so nothing renders a control that goes
nowhere. Do not "finish wave 4" by forcing links onto these.

The exception worth copying: `tool_bundle` also has no registry route, but its
console has a real `?bundle=<id>` deep link AND the feature owns a `bundleHref`
builder (`features/tool-registry/doors.ts`) — so the call site passes it as an
href override. **Check for a feature-level `doors.ts` before concluding an
entity is unreachable.**

**Not every "created" toast needs a door — check what the surface already
does.** `PromoteToSiteDialog` looked like a textbook case, but the CMS lives in
a SEPARATE Supabase project, so its page id is NOT a `web_page`; using that
token would have minted a wrong-record door. The dialog also already renders a
result panel with its own Open button (`/cms/<client_id>/pages/<id>`). Left
alone deliberately.

**Toast systems that cannot carry a door** — `toastDoor` returns a ReactNode,
which sonner renders raw. The two legacy wrappers cannot take it:
`@/lib/toast-service` (`success(message, moduleKey, options)`) and
`useToastManager` (whose `ToastOptions.action` is `{label, onClick}`). Migrating
a file to `@/lib/toast` is the fix and is usually trivial — EXCEPT where the
manager's `moduleKey` supplies default messages, which migrating would silently
drop (`useQuickSaveCode`, left undone and commented in place).

> ⚠️ **Check tokens against `types/generated/entity-types.generated.ts`, NOT
> `entityRegistry.ts`.** The generated file IS the token registry; the overlay
> only adds icons and `hrefFor`. Grepping the overlay alone reports a registered
> token as "not registered" — I did exactly that on 2026-08-09 and wrote a false
> claim into a code comment before catching it.

**Registered but no `hrefFor`** (peek may still work; the route does not):
`pc_show`, `pc_episode`, `content_ir_kind` (routes exist — three surfaces pass
an `href` override today and could drop it) · `folder` · `scope_type` (also no
resolver route and no peek) · `context_item` (no peek either) · `tool`,
`tool_bundle`, `skill`, `user_feedback` (routes exist but sit behind the
super-admin layout — the "403 door" question, item 11/16) · `workflow` (lives in
aidream's workflow-studio, D139).

**Correction (2026-08-09), so it does not propagate:** commit `ce1ae00c`'s
message claims `message` and `context_item` "have no entity token at all".
**That is wrong** — both ARE registered, and both match their item-presentation
`detailSource`, so both correctly resolve doors. The code was right; only the
stated rationale was wrong. (`session`, `email`, `image`, `video`, `audio` do
genuinely lack a token, which is why they render none.)

**Item-type vocabulary drift — FIXED 2026-08-09, and worth knowing about.**
`KnownItemType` is *mostly* the token vocabulary but not entirely: `table` →
`dataset`, `document` → `udt_document`, `picklist` → `structured_list`. These
are now declared as `entityToken` on the item-presentation registry entries and
resolved through `entityTokenForItemType()`. **Never hand a raw `ItemType` to
`resolveEntityDoors`.** Each mapping was matched by `schema.table`, never by
name — a token resolving to a different table opens the WRONG record.

### Blocked / needs a decision

0. ~~**`scope` still has no registry `hrefFor`.**~~ RESOLVED 2026-08-09 —
   `entityRegistry.ts` now carries `scope: { hrefFor: (id) => scopeShortHref(id) }`
   (verified live at `entityRegistry.ts:418`), so every surface naming a scope
   resolves a door with no call-site change. Call sites that still pass
   `scopeShortHref(id)` as an explicit `href` override are harmless but
   redundant — drop the override opportunistically.
   **Still open:** `scope_type` has no `hrefFor`, no resolver route, and no peek.
0b. **`ContextSummaryChips` cannot carry doors yet.** It is THE context-selection
   display (file rows, note footers, chat header, transcripts sidebar) and every
   chip names a record with an id — org, scope, project, task, all four of which
   have routes. It renders INSIDE a `<button>` in `ActiveContextButton`, so
   anchors are invalid DOM there. **Needs** an opt-in `withDoors` prop that the
   four non-button consumers (`FileInfoTab`, `FileContextSection`,
   `ProjectContextSection`, `TaskContextSection`) turn on.
0c. **`ContextValueDisplay` renders a legacy `value_reference_id` as
   `→ <uuid>`** — a bare id with no copy and no door. The docblock says zero
   current rows use the pre-fence column, so this is a restored-old-version
   path only; the cell shape would need `value_reference_type` to resolve a
   token.

8. **No canonical user-account route** (FOUND_DEFECTS D138) — the most common
   remaining dead end in `(admin)`; every actor column. The stand-in is
   `features/admin/users/components/AdminUserRef.tsx` (a menu of param-consuming
   per-user admin pages); **consume it, don't hand-roll**. Give
   `/administration/users` a deep-link param + register a token with `hrefFor`
   and every `user_id` column lights up at once. Note
   `/administration/users/admins` accepts NO param, so an existing Accounts
   row-menu item promises a filter it cannot deliver.
9. **Association edges have no listable destination.** `edge_count` /
   `closure_rows` / `reverse_edge_count` (`RelationshipRulesClient`,
   `ProblemsPanel`) count real `platform.associations` rows nothing can list, so
   they stay inert on purpose. A client read would LIE: SELECT is
   `iam.has_org_access(organization_id)` while the counts come from
   `is_super_admin()` RPCs. **Needs** `admin_association_edges(p_source_type,
   p_target_type, p_label, p_direction)` + an Edges destination on the hub.
   Same shape blocks Exposure Audit's "N link" / "N grant" and the Entitlements
   "Events" / "Users" counts.
10. **Stale `url_path_template` rows** (FOUND_DEFECTS D137). Mitigated — a
    registered token with no `hrefFor` now returns null instead of the template
    — but the rows are still wrong. Decide: correct each (then
    `pnpm tsx scripts/regen-shareable-registry-snapshot.ts`), or drop the column
    so the entity registry is the only route authority. Shared with aidream.
11. **Routes that do not exist for real entities.** `workflow` (D139 — lives in
    aidream's workflow-studio), `skill` (admin-only route; a 403 door is still a
    dead end), `quiz_session`, `flashcard_data`, `canvas_items`. Peeks render;
    no route does. Decide per entity: build the route, or link out.
12. **Association-edge endpoints with NO door at all** — `crm_campaign`,
    `seo_keyword`, `folder`, `working_document`, `flashcard_set`, `quiz_session`,
    `code_folder`, `code_repository`. These are valid edge endpoints, so an
    attached item of these types is plain text. **A peek each is the cheapest
    fix** — the picker is where "which one is that?" actually bites.
13. **Scheduling admin consoles show only the viewer's own rows** (D140) — they
    present as fleet-wide and are not.
14. ~~**`scope` has a real route the registry doesn't know.**~~ FULLY RESOLVED —
    the resolver route was built (`/scopes/s/[scopeId]`, `scopeShortHref`) AND
    the registry now points at it (see item 0). `scope_type` still has no
    resolver and no peek.
15. ~~**`brand` and marketing `site` are not registered tokens at all.**~~
    RESOLVED — `web_brand` (`/marketing/brands/<id>`), `web_site`
    (`/marketing/sites/<id>`, the id-only shim that resolves `brand_id` and
    redirects) and `web_page` (`/marketing/pages/[pageId]`, the same resolver
    shape) all carry `hrefFor` now — verified at `entityRegistry.ts:310/319/396`
    against the route file `app/(core)/marketing/pages/[pageId]/page.tsx`.
    **Follow-up, not a blocker:** the GSC breakdown / dig / insight / watch /
    crawl-ledger / cost-rollup columns still build their own
    `marketingRoutes.sitePage(...)` href. That is correct and NOT a dead end —
    but each one could now drop the local builder for an `EntityRef`, gaining
    peek and new-tab for free. Do NOT re-register `web_page`; it exists.
16. **Registry entries that need an owner's call, not a call-site patch.**
    - `user_feedback` — HAS a working route
      (`/administration/users/feedback?feedback=<id>`, see `Done`). Registering
      `hrefFor` would light up every feedback reference at once, but the route
      sits behind the super-admin `(admin)` layout, so it is the same
      "403 door" question as `skill` in item 11.
    - `context_item` / `scope_type` — registered tokens, no `hrefFor` and no
      peek. The System Context console falls back to an in-surface filter for a
      category and a copy-only uuid for the item. A peek on each is the cheap
      fix (same argument as item 12).
17. **`/sandbox/[id]` is owner-only** — `app/api/sandbox/[id]/route.ts` filters
    `.eq("user_id", user.id)`, so the FLEET-WIDE console at
    `/administration/compute/sandbox` can only open the viewer's OWN instances;
    the rest would 404. Needs a super-admin read path (or an admin-side sandbox
    detail route) before every row can open. Same family as item 13.
18. **Industries have no entity token at all** (`public.industries`), so every
    "Industry — X" grant label in shared-knowledge is unavoidably plain text.
19. **Agent-set MEMBERS cannot be linked from the set CARD.** `/agents/sets`
    renders each member as an anonymous glyph because `AgentSetSummary` (the
    `agent_set_list()` RPC) carries only `memberCount` — no member ids, no
    names. The count is now a door to the builder, where every member IS named
    and linked, which is the honest fix without a per-card fetch. Naming them on
    the card needs `agent_set_list()` to return the first N member
    `(id, name)` pairs.
20. **An agent app's `N runs` has no user-side destination.** `AgentAppCard`
    shows `total_executions`; the only executions console is
    `/administration/agents/agent-apps/executions?app=<id>`, behind the
    super-admin `(admin)` layout — the same "403 door" question as item 11. A
    `/agent-apps/[id]/executions` route would light up the count for owners.
21. **MCP servers have no entity token.** `features/agent-connections`'
    `McpServersSection` lists real `McpCatalogEntry` records, but there is no
    registered token, so `ListRow`'s `door` slot has nothing to resolve and
    those rows stay panel-only. A server now HAS a route
    (`mcpServerHref` → `/administration/agents/mcp-servers?server=<id|slug>`,
    `features/tool-registry/doors.ts`), so registering `mcp_server` with that
    `hrefFor` would light up that section — but it is super-admin only, the same
    "403 door" question as `skill` in item 11. A peek would serve the panel
    without the gate.
22. **`tool` and `tool_bundle` are registered tokens with no `hrefFor`.** Both
    have a real destination, and both destinations are super-admin admin routes
    (`toolHref` / `bundleHref`), so the admin consoles pass them as an `href`
    override rather than registering a door most users cannot walk through.
    Peek already works for both (`RegistryPeek`, via their `titleColumn`), so a
    non-admin surface naming a tool CAN preview it today. Build a user-facing
    tool route → register `hrefFor` and every call site drops its override.
23. **`skill_category` has no route and no peek.** `SkillsBrowser` groups every
    skill under a category label that names a real `skill.category` row and
    opens nothing; `SkillCategoryTreeEditor` is the only place a category
    exists, and it is a mode of the admin console, not an address. A peek is the
    cheap fix (same argument as item 12).
24. **Counts still without a destination** (deliberately left inert): a library
    store's `N members` and the sandbox console's `Unique users` have no list to
    reach; the enum Usage tab's `schema.table` names have nowhere to go —
    `/administration/database/database-admin` reads only `?tab=`, no table
    param. An invitation request has no user FK and Accounts reads no deep-link
    param, so an applicant's email cannot reach an account.

## Done

- **`components/official/entity-ref/`** is the campaign's spine:
  `doors.ts` (the ONE resolver), `EntityRef` (name + doors),
  `EntityDoorControls` (doors WITHOUT the name, for a name that can't be an
  anchor — an inline editor, a picker toggle). `MatrxUuidCell`, `PeekDialog`,
  `OrgResourceList` and `getResourceSharePath` all consume the same resolver, so
  a registry edit can never light one surface and miss another.
- **Podcasts / KG inspector / Kind Registry / Content Blocks consoles** — the
  four admin routes that render from `features/podcasts`,
  `features/administration/kg-inspector` and `features/content-ir`:
  - **`/administration/knowledge/podcasts/shows` (+ `[showId]`)** — show and
    episode titles are `EntityRef` anchors (`pc_show` / `pc_episode` ARE
    registered tokens with a `titleColumn`, so `RegistryPeek` + new-tab come
    free; the admin route is passed as an `href` override because neither has a
    registry `hrefFor`). The record's PUBLIC page was clipboard-only on every
    row — new `PublicPageLink` opens it, and the show header's
    `/podcast/<slug>` text became that link. `app/(core)/podcast/[slug]`
    resolves a show OR an episode, by slug or uuid, filtering only
    `deleted_at is null`, and every admin read path filters the same, so no
    door lands on a soft-deleted row. Route builders consolidated into
    `features/podcasts/utils.ts`.
  - **`/administration/knowledge/kg-inspector`** — the Organization column is
    an `EntityRef` (it had the name AND the id and rendered a `<span title>`);
    its `"Unknown organization"` fallback is gone, because
    `fetchOrganizationNamesByIds` returns `{}` on a FAILED read too and that
    string asserted more than the data supports (`name={null}` → truncated id).
    An entity's canonical name is a real control (the mentions destination the
    `<tr onClick>` already had, now keyboard-reachable), and Top edges' source /
    target — which carried `src_id` / `dst_id` all along — select that entity
    and jump to Mentions. **Deliberately NOT linked:** an edge endpoint's
    `kind` and a mention's `source_kind` are NER / RAG classes, not canonical
    entity tokens (a kg entity kinded `organization` is an extracted name, not
    an `iam.organizations` row), so neither is handed to the door resolver; an
    unmapped mention source gets a copyable `MatrxUuidCell`, not a guessed route.
  - **`/administration/utilities/kind-registry`** — the Catalog's Kind cell
    declares `href`, and the component / surface / example counts are doors to
    `?tab=assets` / `?tab=examples` (read server-side). **A live 404 class
    removed:** a `snapshot-only` row is GONE from the live DB
    (`gatherKindDetail` → null → `notFound()`), yet the Board linked every such
    row and the Catalog's row click + new-tab button did too. New
    `features/content-ir/admin/kind-registry-routes.ts` is the one authority
    both consume; those rows keep their "gone from live DB" flag instead.
  - **`/administration/utilities/content-blocks`** — a content block is
    addressable at last: `?block=<uuid|block_id>`
    (`components/admin/content-blocks-route.ts`, deliberately pure so linking
    to a block never drags the 2.5k-line editor into a chunk; selection is
    DERIVED from it, not seeded in an effect, and `replaceState` keeps the url
    in step). That closed the Kind Registry Assets tab's worst dead end — it
    lists the skills and blocks teaching a kind, prints each id, and sent all
    of them to the same list page. A skill row now links
    `/administration/agents/skills?open=<skill_id>` (accepts the business key;
    no peek, `SkillPeek` reads `.eq("id", …)`), and the block editor's Skill
    picker got `EntityDoorControls` — peek only, because navigating away from a
    dirty form would discard it.
  - Content-IR render routing was NOT touched: doors only.
  - Verified by `pnpm type-check` (green), ESLint on every changed file (the
    remaining `set-state-in-effect` errors are pre-existing, in effects nobody
    touched), and reading each destination on disk — the `[kind]` / `[showId]` /
    `[episodeId]` / `podcast/[slug]` route leaves, `gatherKindDetail`'s
    `notFound()`, the skills console's `?open=` handler and `fetchSkillById`'s
    `isUuid` branch. **No browser** — see the banner above.
  - **Registry gaps found, not patched at the call site** (they need the
    `entityRegistry.ts` owner): `pc_show` / `pc_episode` / `content_ir_kind` are
    registered tokens with NO `hrefFor` — adding one would let three surfaces
    drop their `href` overrides; a KG entity (`rag.kg_entities`) has no token at
    all, so its only destination is this console's own Mentions tab; and a
    content block (`skill.render_definition`) has no token either, so the new
    `?block=` link is a hand-passed href rather than a registry door.
- **Registry routes added**, each verified against the route AND the table it
  reads: `agent_shortcut`, `app`, `project`, `organization`, `message_template`,
  `transcript`, `studio_session`, `data_store`; `code_file` corrected; an
  `organization` peek added.
- **Live 404s removed**: six peeks with "Open" buttons to nonexistent routes;
  share links built from a stale DB template (incl. the public share page);
  the fork-a-shared-quiz redirect; agent-usage workflow links; the org workflows
  tile; `sourceLinkFor`'s hand-written transcript/code routes.
- **Wrong doors prevented**: column-name token inference is opt-in
  (`fk.token: "auto"`), because `scheduler.sch_run.task_id` is NOT a workspace
  task; a dangling-reference integrity check no longer links the record it just
  proved missing; a catalog deep link can no longer save under another
  application.
- **Consoles done**: Agent Slots (`features/admin/agent-slots/FEATURE.md`, the
  worked reference) · Users & Access · Relationships hub · reporting/events
  audit log · agent-apps · scheduling · applications · every association surface
  (`features/scopes/components/associations/`) + war-room resource lists ·
  shared-knowledge (Access Explorer / Stores & Grants / Industries) ·
  scopes-context/system-context · users/feedback · database/{enums,sql-functions}
  · compute/sandbox · users/{email,announcements,invitations}.
- **`AdminUserDoorControls`** (`features/admin/users/components/AdminUserRef.tsx`)
  — the user doors WITHOUT the name, the `EntityDoorControls` half of the user
  stand-in. For a name that labels a checkbox, sits in a `<SelectItem>`, or
  lives inside a "filter by this assignee" button. `AdminUserRef` composes it,
  so the verified destination list is still declared exactly once.
- **Feedback records became linkable** — `?feedback=<id>` on the console route
  (`app/(admin)/administration/users/feedback/doors.ts`) opens that row's detail
  dialog, so the id cell, the parent edge and a pasted URL all arrive somewhere.
  The parent edge used to copy the parent's id and toast a preview of the answer
  it already had.
- **Count-doors**: an enum's `{usage_count} tables` opens the detail's Usage tab
  (which lists those tables); an org's member count opens
  `/administration/users/organizations?org=<id>`.
- **`/scopes` surfaces**: the hub table's scope name is an `EntityRef` anchor and
  its owning org is a door; `AssignedScopesDisplay` (the read-only "what is this
  tagged with" display, used on project workspaces) links every scope chip/row
  and the org; the settings panel's active org is reachable. Backed by a new
  **`/scopes/s/[scopeId]` server resolver** (org + type lookup → redirect to the
  canonical `/organizations/{org}/scopes/{type}/{scope}` route), exposed as
  `scopeShortHref()` in `features/scope-system/utils/scopeRoutes.ts` — the same
  shape as `/marketing/pages/[pageId]`. This is what makes a scope openable from
  its id alone anywhere in the app.
- **`/documents` + `/workbooks`**: workbook cards are real anchors (they were
  `<button onClick={router.push}>`), the documents table name cell is an
  `EntityRef`, and both surfaces put `EntityDoorControls` on `original_file_id`
  so an imported file's ORIGINAL upload is reachable (it was persisted and
  emitted to the agent context, but no UI ever linked it).
- **Notes**: global-search hit groups carry `EntityDoorControls` beside the
  collapse button (peek + new tab; same-tab open deliberately off mid-search),
  and the info panel's Org / Project / Task ids render through `MatrxUuidCell`
  instead of as bare uuids.
- **Research sources**: `SourceResultsTable` titles are `EntityRef`s
  (`research_source`), `SourceList`'s desktop rows got the anchor its mobile
  cards already had, the decorative `ArrowUpRight` became the real new-tab door,
  and the source's own URL is reachable without opening the overflow menu.
- **Agent-adjacent cards + panels** (`features/agents` outside `browse/` and
  `conversation-*`, `features/agent-shortcuts`, `features/agent-apps`,
  `features/agent-connections`). The recurring shape was a card or row whose
  ONLY way in was a JS click — `AgentCard` / `AgentListItem` even hand-rolled
  `window.open` on cmd-click, which is not an anchor and gives nothing to
  middle-click, keyboard or the context menu:
  - names became `EntityRef` anchors: the agent on `AgentCard` /
    `AgentListItem` (registry route, `basePath`-aware so an admin card stays in
    the system-agents shell), the app AND **the agent it runs** on
    `AgentAppCard` (that line was `Agent: <name>` with the id right there and
    no door), the shortcut label + the agent column in `ShortcutDirectory` (it
    printed a raw uuid when the join missed), and the agent in the
    agent-connections detail pane.
  - `AgentShortcutsPanel`'s shortcut rows were `<button onClick={router.push}>`
    → whole-row anchors.
  - `AgentSetCard` — see the dedicated commit; the tile's four doors plus a
    mouse-only overlay link that replaces the old `role="button"` + `onClick`.
  - agent-sets member surfaces (`AgentRoleCard`, `AgentLibraryRail`,
    `SetMemberGrid`, `MemberInspector`, `OrchestratorInspector`) had a peek and
    nothing else — a member agent could be previewed but never opened. They now
    carry `EntityDoorControls` beside the peek (new tab always; same-tab Open
    only where leaving does not discard a canvas in progress), and the invented
    fallback labels (`"Member"`, `"Orchestrator"`, `"Agent"` for an agent the
    slice had not loaded) were replaced with `null` so the id shows instead.
  - **Primitives extended, not forked:** `EntityRef` gained `nameClassName` so a
    CARD title can wrap (`line-clamp-2/3`) instead of being forced onto one
    truncated line — the reason card surfaces were hand-rolling name anchors.
    `features/agent-connections/components/ListRow` split into a button + a
    `door` slot rendered as its SIBLING (the row's click means "show in this
    panel", so the name cannot be the anchor and `<a>`-inside-`<button>` is
    invalid DOM).
  - Verified by `pnpm type-check`, ESLint on every changed file, and reading
    each destination route on disk (`app/(core)/agents/[id]`, `…/sets/
    [orchestratorId]`, `…/[id]/shortcuts/[shortcutId]`, `app/(core)/agent-apps/
    [id]`, `app/(admin)/administration/agents/system-agents/agents/[id]`).
    `getAgent`/`getAgentApp` both filter `deleted_at is null`, and neither list
    surface has a trash view, so no door lands on a soft-deleted row. **No
    browser** — see the banner above.
- **Marketing table columns** (every `MatrxColumnDef` file under
  `features/marketing/**`). The domain-wide shape was a record printed as text
  with a whole-row `onRowOpen` as its only way in — no cmd-click, no
  middle-click, no keyboard, nothing for the context menu. Identity cells now
  declare `href`, so the table renders a real `next/link`:
  - **Site workspace tables** — crawl sessions (`CrawlsTable`), snapshots
    (`SnapshotsTable`), findings (`FindingsTable`), the analysis priority queue
    (`SiteAnalysisTable`), sitemap listings (`SitemapDetail`), and the crawl run
    URL ledger (`CrawlUrlsTable`). Each destination is the one `onRowOpen`
    already used.
  - **Relationships that were knowable and unreachable** — a finding's affected
    page was a `<button onClick={router.push}>` (no new-tab gesture reached it);
    a crawl run URL and the crawl-report response ledger both carried the
    `page_id` the crawler had already resolved and printed the URL as text.
  - **Cross-site hubs** — `BatchesTable` (the id fragment was an inner link
    while the rest of the identity cell was inert), `BatchDetailWorkspace`,
    `SiteCostWorkspace`, `WorkspaceCostWorkspace`, `CrossSiteRanksHub`.
  - **Search Console, in ONE edit** — `buildGscKeyColumn`
    (`search-console/lib/columns.tsx`) takes an optional per-row `recordHref`
    and renders the door itself, so `GscDimensionTable`, `DigResultsTable`,
    `InsightsTab` (CTR-gap + trend), and `ClassInsights` (movers + juice) all
    light up at once. `gsc_perf_breakdown` / `_dig` / `_ctr_gap` / `_trend` /
    `_class_movers` / `_juice` every one RETURNS `page_id` — the page was
    knowable in all six. `WatchlistTab` resolves the same door through
    `entity_id` when `kind === "page"`; `NewPagesTab` rows ARE pages.
  - The door in those tables is a trailing anchor, not the whole cell, because
    the row click there is the DRILLDOWN (queries for this page / pages for this
    query). Swallowing that gesture would trade one destination for another
    rather than adding one.
  - **Bare ids that became doors:** the site-access grant's `grantee_id` when
    `grantee_type === "organization"`, and the workspace cost rollup's
    `client_org_id` — both via `fk.token: "organization"`, so route + new tab +
    peek come from the registries with no call-site wiring. A `user` grantee
    stays copy-only (no canonical account route — D138).
  - **Route builders, not string concatenation:** `marketingRoutes` gained
    `sitePage(brandId, siteId, pageId)` and `batch(batchId)`; six hand-built
    `/marketing/sites/<id>` / `/marketing/batches/<id>` paths now go through the
    builders.
  - Verified by `pnpm type-check` (green), ESLint on every changed file, and
    reading each route leaf on disk under
    `app/(core)/marketing/brands/[brandId]/sites/[siteId]/` plus
    `/marketing/batches/[batchId]`. Cross-site links that know only `site_id`
    use the id-only form, whose `[...rest]` shim resolves the brand and replaces
    the URL. **No browser** — see the banner above.
  - **Deliberately left door-less, do not "fix":** `DismissedPagesTable` (its
    rows ARE soft-deleted pages and the single-page fetchers exclude them — a
    door there is the /files/trash 404 bug); `CrawlLogsTable` (crawl events have
    no route); `FindingDetail`'s result rows and its `run_id` /
    `payload_instance_id` (analysis results and runs have no route);
    `PlanNodesTable` (a plan node has NO shareable URL at all — the workbench
    holds the selection in React state; a `?node=<id>` deep link is the fix and
    is a workbench change, not a column change); both backlink tables (external
    domains/anchors, already real anchors, and no internal record id on the
    row); `SiteKeywordPerformanceWorkspace`'s query column (keywords have no
    route — its "Strongest page" column was already a door).
- **Tool registry + skills consoles** (`/administration/agents/{mcp-tools,
  mcp-servers,bundles,skills}`; the system-agents agent grid and shortcut
  directory were already done by the agent-adjacent wave). The recurring shape
  here was a console that MANAGES a record type while being unable to open one,
  plus two live 404s:
  - **`/administration/agents/mcp-servers/<id>` does not exist.** Both
    `McpToolsManager`'s "MCP" column and `ToolViewPage`'s MCP Server row linked
    it — one via `window.open`, one via a raw `<a target="_blank">`. The console
    is a single page holding its selection in React state, so a server had no
    address at all. Fixed with `?server=<id|slug>` (matches either, because
    `tool.definition.managed_by_server_id` is an id while the console's list is
    keyed by slug).
  - **`features/tool-registry/doors.ts`** is the one place these routes and
    deep-link params are declared — `toolHref` / `toolUiHref` /
    `toolIncidentsHref` / `toolEditHref` / `mcpServerHref` / `bundleHref`. None
    of them belongs in `entityRegistry.ts`: every one sits behind the
    super-admin `(admin)` layout, the same "403 door" question as `skill` in
    item 11. Admin surfaces pass them to `EntityRef` / `MatrxUuidCell` as an
    explicit `href` override.
  - **Deep links are DERIVED, never an effect** — an explicit click wins, and
    until there is one the param picks the row. A param the list cannot resolve
    renders its own loud state naming the id, never the neutral "pick one" empty
    view (and the bundles one says the list is filtered to Active, because that
    is the likely reason an id misses).
  - **`tool` and `tool_bundle` are registered tokens with a `titleColumn`**, so
    `RegistryPeek` previews them for free — no new peek component was written.
  - MCP tools table: the NAME opens the tool, the raw ID column is a
    `MatrxUuidCell`, and **Samples / UI Components are count-doors** to the
    pages that list those rows.
  - Bundles: member tool names open (a member whose tool row did not come back
    renders the id, never a made-up name), the lister tool id is a door, and the
    add-member picker keeps its click while `EntityDoorControls` rides as a
    SIBLING so a preview never costs the user the dialog.
  - Skills: browser rows gain the registered `skill` peek beside their click;
    **the editor now renders the PARENT SKILL**, which was loaded on every skill
    and shown nowhere; project chips are `EntityRef`s. `SkillsBrowser`,
    `SkillDetailEditor` and `SkillIngestPanel` take an optional `skillHref` so
    the super-admin console supplies the route and the agent-connections panel
    (same components, ordinary users) shows the peek alone.
  - Verified by `pnpm type-check` (green) and ESLint on every changed file (the
    only errors are pre-existing `react-hooks/set-state-in-effect` on effects
    this wave did not write). Route leaves checked on disk under
    `app/(admin)/administration/agents/`, which is how the missing
    `mcp-servers/[id]` leaf was found. **No browser** — see the banner above.
