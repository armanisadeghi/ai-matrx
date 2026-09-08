---
status: active
updated: 2026-09-08
repos: [matrx-frontend]
scope: program
feature: Context Menu v3
vision: [features/context-menu-v3/FEATURE.md, features/context-menu-v3/SECTIONS.md]
---

# Context menu everywhere — the rollout program

**What this is:** driving the ONE right-click menu onto every surface in the app, so a user right-clicking a keyword, a page, a task or a contact gets the same menu for that thing wherever it appears — and keeping it that way as new surfaces arrive.
**Scope:** Program
**Feature:** Context Menu v3
**Vision:** Arman's words below (recorded 2026-08-25; the menu PRIMITIVE's own vision lives in `features/context-menu-v3/FEATURE.md`, and the older perfection pass is `docs/handoffs/context-menu-v3-perfection.md` — a separate, still-open doc).

## Vision — Arman's words

- On why shared sections are the whole point (2026-08-25): *"The system will only succeed if agents are instructed to look for those reusable sections and then make important decisions based on their findings."* And on growth: *"each new usage of the core reusable submenu ensures the submenu grows and becomes more feature rich."*
- On availability (2026-08-25): *"although we create these core canonical sections… include a way to disable features that cannot be triggered from a certain page. That way, the menu remains consistent, but inaccessible items are simply disabled. Ideally, when something is disabled, we should add a tool tip that tells the user the right surface to find that item working."*
- On density (2026-08-25): *"menu items cannot have any more than a word or phrase for what they do. Descriptions and subtext is not allowed… if it's not something MacOS would do in the user interface, then we should not do it either."* Descriptions require his explicit approval, requested after the menu ships bare; *"in ninety five percent of cases, those will never be approved."*
- On scale: he wants a large parallel fleet of small (Sonnet-class) agents doing this, run under a coordinator.

## Resources

- **The census — start here.** `pnpm check:context-menu` (`scripts/check-context-menu.ts`). `--json` for machine rows, `--population=<name>`, `--strict` to fail. It is the backlog, the grader, and three law checks.
- **Sharding:** `npx tsx scripts/context-menu-shard.ts --agents N --population <name>`. Groups by directory (siblings usually share an identity) and asserts the partition is disjoint.
- **The registry:** `features/context-menu-v3/SECTIONS.md` — 39 registered identities + THE ADOPTION PROTOCOL. Every worker's step 2.
- **Skills:** `context-menu-rollout` (the fleet worker's contract — the assembly line), `context-menu-v3` (wrapper mechanics + THE DENSITY LAW), `surface-check` S6 (the verifier), `live-ui-iteration` (per-surface driver that delegates menus to these).
- **Primitives built for this program** (all verified live 2026-09-08, 119/119 tests pass):
  - `features/context-menu-v3/utils/per-row-entity.ts` — the `data-entity-*` DOM sniffer.
  - `features/context-menu-v3/utils/availability.ts` — `unavailableHere` / `needs` / `withAvailability`, the consistency-step mechanism.
  - `features/context-menu-v3/menu-presence.tsx` — `useIsInsideContextMenu`, so a shared primitive mounts a menu only as a FLOOR.
  - `features/context-menu-v3/value-resolution.ts` — the mounted-`SurfaceRuntime` underlay + the single `ambient` key.
- **Test:** `pnpm preview:start` (port 3001, ONE dev server machine-wide), log in per `docs/official/browser-testing.md`. Verification is opening the menu and watching the console for `INERT MENU` / `VALUE MAPPING GAP` — the census is a textual heuristic and its "covered" verdict is NOT certification.

## Remaining work

1. **Decide the Vault.** `features/window-panels/windows/vault/VaultWindow.tsx` is the last window with no menu and was deliberately withheld from every fleet wave. The Vault forces empty selection/content as credential-leak hardening (pinned by a test in `__tests__/value-resolution.test.ts`), so an ordinarily-wired menu there could surface secrets. Either wire it with an explicit, reviewed action set, or mark it `// context-menu: deliberately-absent — <reason>` so it stops appearing as unclaimed. **Do not hand this to a fleet worker.**

2. **Two genuinely new windows, unwired** — created after the waves ran, which is the recurring "new surfaces arrive unwired" case: `features/window-panels/windows/hindsight/HindsightFindingWindow.tsx` and `features/window-panels/windows/admin/user-search/UserSearchWindow.tsx`. Ordinary shard work; run `context-menu-rollout`.

3. **`PdfExtractorWindow` is structurally blocked.** `features/pdf-extractor/components/PdfExtractorWorkspace.tsx` calls `createPortal` to `document.body`, so no wrapper written in the window file can attach (Radix `asChild` needs a real DOM child). The menu must be mounted INSIDE the portaling component; that file has no menu at all today.

4. **`editables` (42) — the last content-surface population.** Real editors: `components/markdown-studio/EditorPanel.tsx`, admin `text-cleaner`, `features/secrets` (2 — check the hardening question first), `components/official-candidate/*` (4). Shard it 4–6 ways with `context-menu-shard.ts --population editables`.

5. **The `data-entity-*` sweep was never run.** The DOM sniffer exists, is tested, and has **zero real consumers** (`grep -rl 'data-entity-type=' app components features lib` → 1 hit, and it is a comment example). It was built so a child component can give its rows an identity with one attribute instead of a resolver, which is what most of the 154 "shells" need. Either run that wave or delete the primitive — an unused primitive is a liability.

6. **`form-fields` (75) — decide whether it is work at all.** These are short inputs in dialogs/forms, split out of `editables` deliberately because wrapping an invite field to satisfy a counter is padding. They are tracked, not scheduled. This needs a ruling, not a fleet.

7. **Two open defects in `FOUND_DEFECTS.md`**, both verified still live 2026-09-08:
   - `CaptureStudio.tsx` types `sourceFeature` as plain `string` and **defaults it to `"camera"`**, which is not in the generated allow-list — so every caller that omits the prop is misattributed. tsc cannot catch it. The typing fix is mechanical; **which valid value replaces it is an attribution decision, not an agent's guess.**
   - `components/official/ContentEditor.tsx` wraps only `plain` and `preview`; its DEFAULT `matrx-split` mode plus `wysiwyg` and `markdown` have no menu. Same class in `features/notes/components/NoteEditorCore.tsx`.

8. **`mandate` is still fragmented four ways** and is the largest registry violation left: `useMandateRowActions` (browse list — the richest: Duplicate & customize, Copy for AI, …), `MandatesConsole` (copy key/id), `MandateWindow` (open/new tab/view agent), `SeoOperationsClient` (one item). A ruling was requested from the `Mandate purpose definition` cloud session on 2026-09-08; **no answer has been received**. Unifying requires deciding what a mandate's canonical verb set IS — a mandate-system call, not a context-menu one.

## Done

- The census, sharder and three law checks — `scripts/check-context-menu.ts`, `scripts/context-menu-shard.ts`.
- Phase 0/1 primitives (DOM sniffer, runtime underlay, ambient key, availability mechanism, menu-presence floor) — `features/context-menu-v3/`.
- `ProTextarea` mounts a menu as a floor for ~360 fields that had none — `components/official/ProTextarea.tsx`.
- The fleet contract and its hard-won rules — `.claude/skills/context-menu-rollout/SKILL.md`.
- 39 shared section builders registered — `features/context-menu-v3/SECTIONS.md`.
- `tables` 101→1, `windows` 117→4, covered 105→627 — ~138 commits since 2026-08-27.

## Decisions needed

**1. The Vault's right-click menu.**
*Situation:* The credential Vault deliberately reports empty selection and empty content so a menu can never copy or send a revealed secret; a test pins that behaviour. It is now the only window in the app with no right-click menu at all, so it shows up on every backlog scan as unfinished work.
*Decide:* (a) leave it permanently menu-less and record the reason in the file, or (b) give it a deliberately narrow menu — and if so, which actions are safe on a screen showing credentials.

**2. Do short form fields get menus?**
*Situation:* 75 files are short inputs inside dialogs and forms (an invite field, a rename box) rather than content bodies. Wrapping them would add a right-click menu to almost every form in the app. They were split into their own bucket rather than being worked.
*Decide:* leave them permanently out of scope, or schedule them as a low-priority wave.

**3. `sourceFeature` for the camera/capture studio.**
*Situation:* The capture studio stamps every agent run it launches with the source `"camera"`, which the server's allow-list does not contain, so those runs are filed under a feature that does not exist. Valid nearby options are `"files"` or `"image-studio"`.
*Decide:* which one it should be. (The type fix that prevents a recurrence needs no decision and can ship either way.)
