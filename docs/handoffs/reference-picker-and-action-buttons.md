# Handoff — "Insert reference…": links and action buttons from anywhere

Owner until 2026-10-10: one Claude Code session (with subagent lanes). State verified against `main` on 2026-10-10.
Server half lives in `../aidream`; shared packages live in `../aidream/apps/shared/*`.

---

## 1. Vision (authoritative)

### Original ask (2026-09-11)
1. A **system-wide right-click action** that inserts — or, where the text can't be edited, copies — a reference to any record (chat, note, task, project, file, …).
2. **Much easier than the admin builder** at `/administration/agents/relationships/directives`: no raw ids, **no technical words** ("directive", "noun", "verb", table names). Plain names only.
3. **Pick the type first.** Common types (chat, note, task, project…) come first under familiar names; **"see more"** reveals every other type.
4. A **good search** to find the record by its name.
5. The **action defaults to Link**; other actions (Create / Update / Delete) are offered and choosable when the type supports them.
6. Insert the minified block: `{"__kind":"directive_v1_reference_<noun>","items":[{"id":"…"}]}` inside a ```` ```matrx ```` fence.
7. Advise whether references can be hidden inside the plain-text note editor. **Answer given:** no new editor needed — the formatted views render the fence as a chip/card.

### Additions and refinements (in order)
- **"Get it 100% done; ask only basic questions; document it."** → every change ships with tests, FEATURE.md updates and live verification.
- **Common types must be org-configurable**, not hardcoded → feature knobs `platform.reference_picker.common_types` and `platform.reference_picker.hidden_types`.
- **2026-09-30: "Make Create/Update (and other actions) genuinely usable, world-class — in the picker AND the admin builder."** The scope grew from "insert a link" to "insert a working action button".
- Action buttons must be **safe and honest**. They show before → after in plain words, and nothing runs until the person confirms. The confirm names the record and the organization. Delete is red and says what is lost. Applying twice never duplicates. The "Applied" state survives a reload. "Run again" states its consequence. Failures read as plain words with Details behind a toggle.
- Every record a chip names **must open the real record** (the no-dead-ends law); a missing record says "Not found" and a trashed one says "(in trash)" and offers Restore.
- **One name per record type everywhere** (picker, chip, card, confirm).
- **Phones are first-class**: the picker is a bottom sheet, forms are one control height, the date picker opens as a sheet, and the admin builder works at 375px.
- 2026-10-03 rule change: **test on LIVE as `admin@admin.com`**; the nightly clone is no longer the test target.

### Why the key decisions were made
- **Blank never erases** (`buildSchemaPayload`). Update schemas mark every field optional, but that doesn't mean the column accepts null. A cleared field once sent `null` into a NOT NULL column.
- **Validation offers, never blocks.** Missing fields warn beside the button; Apply stays clickable. Platform law.
- **The confirm waits for its facts.** A confirm showing "Reading…" with only Cancel beats one that asks blind. The reviewer once saw "Update note Note ae33f4e0?" with no values.
- **Every write carries an explicit organization.** The admin pages are bound to the system org, so builder runs use the person's active org (`personWrite`). Platform law.
- **The catalog is split into a summary and per-type schemas.** It was 2.4 MB and took 5–7 s, which made every action list feel broken.
- **Block placement rule:** at the very start of a paragraph → before; anywhere else → after. A "first half" rule surprised people on wrapped lines.
- **Phone notes open in Write.** Plain text showed raw fences on phones. The default is now `write` (changed outside this lane; confirm it is intended).

---

## 2. Current state (verified 2026-10-10)

### Done and verified live
| Area | Where |
|---|---|
| Right-click "Insert reference…" / "Copy reference…" (read-only) | `features/context-menu-v3` (`cm:insert-reference`), test `__tests__/a-reference-can-be-inserted-or-copied-anywhere.test.ts` |
| Picker: type first, common types, grouped "All types", knobs | `features/matrx-envelope/components/reference-picker/` (`ReferencePickerBody.tsx`, `referencePickerTypes.ts`, `useCommonReferenceTypes.ts`), `features/overlays/components/ReferencePickerOverlay.tsx`, groups `features/scopes/utils/referenceTypeGroups.ts` |
| Search: recent-first, same-named rows told apart (org · status · created/edited, then "1 of 2") | `features/scopes/service/recordFacts.ts`, `ReferenceTypeAdder.tsx` |
| Write forms from the server schema: "Title" label, app's words for choices, "Unchanged" on update, people search, Repeat picker, design-system `DateField` | `features/directive-catalog/schemaFields.ts`, `components/SchemaFieldsForm.tsx`, `valueVocabulary.ts`, `identityPicker.ts` |
| Insert into every editor (Write, Split, Plain); blocks never split words | `features/context-menu-v3/utils/insert-into-editor.ts`; `@ai-matrx/rich-editor` `core/block-insert.ts`, `visual/context-menu-caret.ts` |
| Chips open the real record; "Not found"; "(in trash)" with Restore | `features/matrx-envelope/referenceDoor.ts`, `referenceTrash.ts`, `components/useReferenceDoor.tsx`; guard `every-reference-chip-opens-its-record.test.ts` |
| Action cards (package `SideEffectDirectiveCard`): old → new, honest confirm, "Applied" + link survives reload, Run again, "Nothing to change", copies count | package `@ai-matrx/content-ir-react`; host `features/matrx-envelope/directiveHost.tsx`, `components/DirectiveConsequence.tsx`, `directiveFailureWords.ts` |
| Server: one apply path, idempotent per person/conversation, real soft delete, `before` values kept, "already up to date", plain errors | `aidream/services/output_directives/`, `aidream/services/directive_apply/` (`service.py`, `executor.py`, `keys.py`) |
| Catalog split: summary `GET /directives/catalog` (~32 KB gzipped, ETag) + `GET /directives/catalog/{noun}` | `aidream/services/directive_catalog/` |
| Moved tables still resolve (task/project after `workspace.*` → `projects.*`) | `aidream/services/platform_entities.py` (`resolve_platform_model`) |
| Admin builder: searchable paged type list, Fields/JSON, confirm on every run, red Delete, truthful badge, "already applied", phone layout, run survives remount | `features/directive-catalog/components/DirectiveBuilderPanel.tsx`, `DirectiveCatalogClient.tsx`, `DirectiveCatalogGrid.tsx`, `builderRunStore.ts`, `nounOptions.ts` |
| Notes crash ("matrxDirectiveHost before initialization") fixed; import cycle cut | `features/content-ir/host/directiveHostSlot.ts`; guard `pnpm check:host-cycles` |
| Phone popovers inside sheets (duplicate Radix layer copies) | `package.json` `pnpm.overrides`; guard `features/overlays/__tests__/one-radix-layer-stack.test.ts` |

### Partial: built and unit-tested, never walked live
The shared preview was saturated, with more than 4 live sessions and our tab evicted constantly. These were never clicked through:
- A Chat link chip opens promptly. The last observation, during a server restart, was 20 s on "Opening chat…".
- A File link chosen via "Browse files" opens the file.
- At 375 px, one Task through Create → Update → Delete end to end.
- Write-mode placement (start of paragraph → before) and a trailing space surviving.
- The admin builder's latest fixes, live: "No Task chosen", "This already ran once.", "Create" label, builder first on a phone.
- The open note's "Move to Trash" on the phone More sheet. The code path exists: `NoteEditorDock` → `moveToTrash`, `MobileNoteEditor` → `onDelete`.
- The catalog boot warm-up (aidream `c9b0bc482d`) on the live server, i.e. that the first cold "Change…" is fast.

### Regressions found today (2026-10-10), caused by other lanes
`npx jest features/directive-catalog features/matrx-envelope features/context-menu-v3 features/content-ir/host` → 719 passed, **3 failed**:
1. `features/directive-catalog/__tests__/the-write-form-is-one-control-family.test.tsx`: multiline/off-family controls rose to 4. Likely the 2026-10-08 "writing boxes → ProInput/ProTextarea" sweep (commit `58f732d8096`). Reconcile with the new law: a box a person writes in is `ProInput`/`ProTextarea`; raw values keep the bare control. Update the form or the guard, whichever matches the law.
2. `features/directive-catalog/__tests__/the-catalog-stacks-on-a-phone.test.tsx`: the type table no longer has `h-[NNdvh]`. A later edit to `DirectiveCatalogClient.tsx`/`DirectiveCatalogGrid.tsx` changed the phone layout. Re-check at 375 px.
3. `features/matrx-envelope/__tests__/a-comment-reply-is-a-line-not-the-reply.test.tsx`: commit `e47a98e9de8` ("Every error display carries the Alchemy Menu") added a copy button to a failure line the test asserts has none. Decide which rule wins and align.

### Not started
- About 10 rarely used types have no page or preview, so their chips show a plain name: fc_detail, item_mastery, research_analysis, research_content, research_keyword, research_media, research_synthesis, study_attempt, study_session, wc_claim. Giving them a door needs entity-registry rows (title column, route or peek).
- Migrating the app's ~79 browser date inputs and two legacy date-pickers onto the design-system `DateField`, as each area is touched.
- About 40 machine columns on `research_source` are still writable in forms.
- `custom.anon_form` has no generated server model, so it is not writable.

### Known issues and risks
- Truly identical records (same title, same second) can only be told apart by "1 of N".
- A right-click on an existing chip doesn't move the caret; the new block lands next to the previous selection.
- Inline references are impossible by design: a matrx fence is block-level. Notion-style inline @mentions would need a new inline node in `@ai-matrx/rich-editor`.
- Human applies are remembered per person with no expiry. Re-running intentionally needs "Run again" (`force=true`).
- `__matrx_apply_key` is still written by three agent-only server paths (`_db_create`, project/task managers). It is reserved on purpose (migration 0642); left as is.
- The type name for `content.document` vs `udt_document`: `udt_document` = "Document". The Markdown one uses the registry label. Its final name was never ruled on (proposed: "Page").

---

## 3. Architecture and orientation

```
right-click (context-menu-v3, cm:insert-reference)
  └─ ReferencePickerOverlay ── ReferencePickerBody
        type step (referenceTypeGroups + knobs) → record step (recordFacts search)
        → action step: Link | Create one | Update it | Delete it
             └─ WriteStep: deriveSchemaFields(schema) → SchemaFieldsForm → buildSchemaPayload
        → wireItems() → ```matrx {"__kind":"directive_v1_<class>_<noun>","items":[…]}```
  └─ insert-into-editor.ts → rich-editor block-insert (or copy + "Copy a reference" when read-only)

render (MarkdownStream → content-ir kind registry)
  reference_* → chip   (referenceResolvers + referenceDoor → open / peek / page / trash)
  create|update|delete_* → SideEffectDirectiveCard (package)
        host seams in directiveHost.tsx: nouns/labels, valueLabel, prepareDirectiveQuestion,
        applyState, explainFailure, confirm → POST /directives/confirm
        content-ir host reads the directive host via directiveHostSlot.ts (no static import)

server (aidream)
  GET  /directives/catalog            summary (no schemas), cached, ETag
  GET  /directives/catalog/{noun}     schemas for one type
  POST /directives/confirm            card Apply  ─┐ one core: output_directives.dispatcher
  POST /directives/execute            admin Run   ─┘ .apply_directive_items (ledger claim, org, before-values)
  GET  /directives/apply_state        what a card already did (survives reload)
```

- **Snapshot for tests:** `docs/protocol/kind_directives_catalog.generated.json`. It is generated in aidream and mirrored with `pnpm check:protocol-sync:fix`. Never hand-edit it. Nouns are generated by `scripts/gen-directive-nouns.mjs`.
- **Packages:** `@ai-matrx/content-ir-react` (cards), `@ai-matrx/rich-editor` (insert), `@ai-matrx/design-system` (controls incl. `DateField`), `@ai-matrx/kit`.
- **Feature docs to read first:** `features/directive-catalog/FEATURE.md`, `features/matrx-envelope/FEATURE.md`, `features/context-menu-v3/FEATURE.md`, `aidream/aidream/services/directive_apply/FEATURE.md`, `.../directive_catalog/FEATURE.md`, `.../agent_data/FEATURE.md`.

---

## 4. Next steps (in priority order)

1. **Fix the 3 failing suites** in section 2 (about an hour). Run `npx jest features/directive-catalog features/matrx-envelope features/context-menu-v3 features/content-ir/host`. It must be 0 failed.
2. **Run the never-walked live checks** listed under Partial, at a quiet time:
   - First check `pnpm preview:status` and the `[walk-cap]` lines in `$TMPDIR/matrx-frontend-preview-$(id -u)/shared-next-dev.log`.
   - Use one browser-driving agent only; parallel lanes share a hostname and steal each other's tab.
   - Read back each write: rows, `organization_id`, `deleted_at`.
   - Trash leftover test notes `0583c0e5-43c9-426b-8e08-db4675e6767d` and `86bf7688-984e-4969-bf21-22962545ee90` through the app.
3. **Confirm the catalog boot warm-up is live**: a cold "Change…" for Task shows actions in under 1 s.
4. **Get the name for the Markdown document type** settled. Proposed "Page"; check the vocabulary doc `common-docs/systems/platform/vocabulary/FEATURE.md` first.
5. Then the Not-started list, in the order above.

---

## 5. Gotchas

- **Shared checkout.** Dozens of agents edit `main`. Commit with `git commit --only <paths>`. Never `stash`, `reset --hard`, `checkout -- .` or `clean`. A sweeper commits stray work as "local work not committed by agents who made them", so expect your files there.
- **Package fixes go IN the package**, then publish, then adopt in the same session:
  1. Commit in aidream.
  2. Merge `origin/main` and push.
  3. Push tag `npm/<pkg>/vX.Y.Z` and wait for the tarball.
  4. Run `pnpm sync:matrx-packages`.
  - Never commit app code that uses an unpublished package API. It breaks the shared preview for everyone; this happened twice.
- **One preview server** (`pnpm preview:start`, port 3001, live DB). Use your session hostname from `pnpm dev-login`, never plain `localhost`. It admits **4 live browser sessions**; don't evict others. Admin pages need a profile that includes `(admin)`, and an admin route can redirect to `manage.aimatrx.com`. **Never sign in there.**
- **Test as `admin@admin.com` only**, on disposable records you name and trash. Never print credentials.
- **The catalog's "update" schemas make every field optional.** That doesn't mean nullable; blank is never sent.
- **Aliases:** the catalog maps `document` → `udt_document`. A real type keeps its own name over an alias (`referenceTypeDisplayLabel`).
- **Moved tables:** registry addresses can run ahead of generated server models during a schema move. `resolve_platform_model` falls back by entity token and logs a warning. Don't regenerate models before the move reaches production.
- **The API's generated types come from the aidream checkout** (`pnpm sync-types`). Never hand-edit generated files.
- **In-app text is layout:** secondary text ≤60 chars, tooltip ≤140. Invoke the `interface-text` skill before writing strings.
