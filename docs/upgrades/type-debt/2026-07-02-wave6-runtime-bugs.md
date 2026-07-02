# Wave 6 (`noImplicitAny`) — runtime bugs the loose types were hiding

> The success metric for this campaign (Arman, 2026-07-02): a fix is meaningful when the
> loose type would have caused a downstream failure or ALLOWED an upstream mistake.
> This file is that evidence, from fleet run wf_46d63e4a-b8d (19 Sonnet agents, 817
> implicit-any errors). Each entry carries the agent's evidence; entries were reported
> under a padding-is-worse-than-empty instruction.

## 1. components/matrx/AnimatedForm/separated/components/MatrxRadio.tsx:38
**Defect:** radioSize/indicatorSize lookup maps only covered 5 of the 9 ComponentSize values (xs/sm/md/lg/xl), missing default/2xl/3xl/icon which are all valid, documented values of the shared ComponentSize type used by every other Matrx size-keyed config in config/ui/FlexConfig.ts.
**Runtime consequence:** Any caller passing size="2xl", size="3xl", size="icon", or size="default" (all legal per MatrxRadioProps/BaseMatrxProps) would get `undefined` back from the object-literal index lookup, so the RadixRadioGroup.Item and its indicator would render with no explicit size classes at all — radios would silently collapse to whatever the surrounding CSS/browser default is, with no error or warning.
**Evidence:** types/componentConfigTypes.ts:5-6 declares ComponentSize = "default"|"xs"|"sm"|"md"|"lg"|"xl"|"2xl"|"3xl"|"icon"; config/ui/FlexConfig.ts's buttonConfig/inputConfig/jsonViewerConfig all key on the full Record<ComponentSize,string> including 2xl/3xl/icon/default, confirming these are real, used values elsewhere in the same size system that MatrxRadio's size prop shares.

## 2. components/matrx/AnimatedForm/separated/components/MatrxRadio.tsx:120
**Defect:** field.options is typed string[] | SelectOption[] (types/componentConfigTypes.ts FlexFormField.options), but the render loop treated every option as if it were always a plain string — using it directly as the React key, the Radix value prop, the id/htmlFor suffix, and the visible label text.
**Runtime consequence:** If any caller ever populates field.options with SelectOption objects ({value,label,...}) instead of strings — the type FlexFormField explicitly allows and other MatrxSelect/MatrxRadioGroup consumers in this codebase do exactly that — every radio option would render its label as "[object Object]", the id/htmlFor pairing would break uniqueness, and RadixRadioGroup.Item's value (used for selection matching) would not be a valid string, breaking selection entirely.
**Evidence:** types/componentConfigTypes.ts:34-41 defines SelectOption<T> {value,label,key?,disabled?,icon?,description?} and FlexFormField.options?: string[] | SelectOption[] (line 54); components/matrx/radio/index.tsx:8 shows a sibling Matrx radio component that already consumes options as {value,label}[] objects, confirming SelectOption[] is a real shape this field can carry in practice, not merely a theoretical union member.

## 3. components/matrx/AnimatedForm/separated/components/MatrxCheckbox.tsx:34
**Defect:** checkboxSize/iconSize lookup maps only covered 5 of the 9 ComponentSize values (missing default, icon, 2xl, 3xl) even though the component's prop type is the full shared ComponentSize.
**Runtime consequence:** Any caller passing size="2xl"/"3xl"/"default"/"icon" (all valid per the prop's declared type) would get checkboxSize=undefined (silently dropping the size className) and iconSize=undefined (Check icon silently reverting to lucide's default 24px instead of the requested size) — an inconsistent, hard-to-spot visual regression with no error.
**Evidence:** AnimatedCheckboxProps extends BaseMatrxProps (types/componentConfigTypes.ts) which declares size?: ComponentSize = "default"|"xs"|"sm"|"md"|"lg"|"xl"|"2xl"|"3xl"|"icon", but the local object literals used as lookup tables (checkboxSize/iconSize) only had xs/sm/md/lg/xl keys, so indexing with a 2xl/3xl/default/icon size silently returned undefined.

## 4. components/matrx/matrx-record-list/basic-auto-table.tsx:24
**Defect:** Same ComponentSize/partial-sizeMap gap as MatrxCheckbox — BasicAutoTableProps.size: ComponentSize but sizeMap only covered xs-xl.
**Runtime consequence:** size="2xl"/"3xl"/"default"/"icon" would silently render with sizeMap[size] undefined (no text-size class applied) instead of the requested size, with zero warning.
**Evidence:** BasicAutoTableProps declares size?: ComponentSize (imported from types/componentConfigTypes.ts, the same 9-value union) but the local sizeMap const only defined xs/sm/md/lg/xl keys.

## 5. components/matrx/matrx-record-list/basic-record-list.tsx:29
**Defect:** Same pattern: RecordListProps.size: ComponentSize but sizeMap only covered xs-xl.
**Runtime consequence:** Same silent-undefined-className regression for the 4 uncovered ComponentSize values.
**Evidence:** RecordListProps declares size?: ComponentSize but the local sizeMap const only defined xs/sm/md/lg/xl keys, used at sizeMap[size] in two places.

## 6. components/matrx/matrx-record-list/unified-record-list.tsx:31
**Defect:** Same pattern: UnifiedRecordListProps.size: ComponentSize but sizeMap only covered xs-xl; size is also forwarded as-is to MatrxBasicInput/MatrxBasicTextarea.
**Runtime consequence:** Same silent-undefined-className regression, compounded across three components (this file plus the two field editors it forwards size to).
**Evidence:** UnifiedRecordListProps declares size?: ComponentSize but the local sizeMap const only defined xs/sm/md/lg/xl keys, used at sizeMap[size] in two places plus forwarded verbatim to MatrxBasicInput/MatrxBasicTextarea via size={size}.

## 7. components/matrx/matrx-record-list/basic-record-edit-list.tsx:33
**Defect:** Same pattern: MatrxRecordEditListProps.size: ComponentSize but sizeMap only covered xs-xl; size is also forwarded to the caller-supplied field Component.
**Runtime consequence:** Same silent-undefined-className regression for the label span and for every registered field component that reads the forwarded size prop.
**Evidence:** MatrxRecordEditListProps declares size?: ComponentSize but the local sizeMap const only defined xs/sm/md/lg/xl keys, used at sizeMap[size] and forwarded to <Component size={size} .../>.

## 8. components/mardown-display/markdown-classification/processors/structured-ast-config-system/structured-ast-processor.ts:55
**Defect:** `node.content.match(config.groupTrigger.contentPattern)` called without a null-check on `node.content`, which is `string | undefined` on OutputNode (nodes like tables/containers only carry `children`, not `content`).
**Runtime consequence:** Any AST node whose `type` equals the configured groupTrigger type but has no `content` field (e.g. a heading-typed node that combinedProcessor produced with only children) throws `TypeError: Cannot read properties of undefined (reading 'match')`, crashing the whole structured-AST parse for that markdown sample/config combo.
**Evidence:** combined-processor.ts defines `OutputNode { type: string; content?: string; children?: OutputNode[]; depth: number }` — content is optional; typing the previously-`any` `node` param as `OutputNode` surfaced the missing guard.

## 9. components/mardown-display/blocks/presentations/SlideView.tsx:240
**Defect:** `cols.map((col) => col.title...)` reads `.title` off a value that can come from `splitBullets(slide.bullets)`, whose declared return type `Array<{ bullets: string[] }>` had no `title` field at all, so the two-column layout's fallback path (no `slide.extra.columns`) could never show a column heading even when bullets happened to carry title-like structure downstream.
**Runtime consequence:** Not a crash (JS silently reads `undefined`), but a silent, permanent gap: `col.title` was structurally guaranteed `undefined` on the auto-split fallback path, so the two-column layout's per-column heading feature was dead code for every slide that lacks `extra.columns` — TypeScript correctly flagged this as the field not existing on that variant.
**Evidence:** `function splitBullets(bullets?: string[]): Array<{ bullets: string[] }>` at SlideView.tsx:520 (pre-fix) vs. the columns type used at line 240 `Array<{ title?: string; bullets?: string[] }> | Array<{ bullets: string[] }>` — the union's second arm never included `title`.

## 10. components/mardown-display/tables/MarkdownTable.tsx:265
**Defect:** `THEMES[theme].table` indexed without optional chaining, unlike the sibling StreamingTableRenderer.tsx which already uses `THEMES[theme]?.table`.
**Runtime consequence:** If `theme` is ever a value not present as a key in THEMES (currently unreachable since no caller passes an explicit theme prop, but the prop was typed as plain `string` making any string legal), `THEMES[theme]` is `undefined` and `.table` throws `TypeError: Cannot read properties of undefined (reading 'table')`, crashing the whole table render.
**Evidence:** Sibling file components/mardown-display/blocks/table/StreamingTableRenderer.tsx:286 already had the `?.` guard for the identical pattern; narrowing `theme` to `DisplayTheme` (keyof typeof THEMES) closes the hole at the type level and the added `?.` closes it at runtime.

## 11. features/scraper/utils/json-path-navigation-util.ts:66
**Defect:** getValueByPath's loop called `current[segment.value]` / read `current.parsed_content` without checking that `current` was still an object after a previous step — if a path walked into a primitive (string/number/boolean) partway through, indexing a number or boolean throws (caught) but indexing a string silently returns undefined via JS's odd string-index semantics, and the original code had zero type-level signal that this case existed.
**Runtime consequence:** A bookmark path like 'data["text_data"]["length"]' (walking into a string field then trying to go one level deeper) would previously fall through with no explicit handling; now it explicitly short-circuits to `undefined` at the point `current` stops being an object, which is the same effective outcome but is now enforced by the type system rather than relying on incidental JS behavior.
**Evidence:** features/scraper/parts/BookmarkViewer.tsx calls getValueByBookmark(pageData, bookmark) with `pageData` being the full scraped-page JSON (features/scraper/parts/core/PageContent.tsx passes raw `pageData: any`), so bookmark paths are user-authored against arbitrary nesting depth and can legally terminate on a primitive mid-path.

## 12. features/scraper/parts/OrganizedContent.tsx:63
**Defect:** `item.items.map((listItem, itemIndex) => <li key={itemIndex}>{listItem}</li>)` rendered an unnarrowed list value directly as a React child.
**Runtime consequence:** processOrganizedData's `list` items (item.Lists from the scraper's outline data) can themselves be non-string values (arrays/objects — the sibling SimplifiedView.tsx explicitly handles `Array.isArray(listItem)` and object cases for this exact same data). Rendering a plain object/array as a JSX child throws 'Objects are not valid as a React child' at runtime, crashing the Organized Content tab for any page whose organized data contains a non-string list entry.
**Evidence:** SimplifiedView.tsx (same data source, `item.items.map`) explicitly branches on `typeof listItem === 'string'` vs `Array.isArray(listItem)` vs else `JSON.stringify(listItem)` — proving list items are not always plain strings. OrganizedContent.tsx rendered `{listItem}` with no such guard.

## 13. features/agent-apps/sample-code/apps/fact-checker-hooked.tsx:112
**Defect:** Rendered `{error}` directly as a JSX child, assuming useAgentApp()'s raw `error: string | null` contract per the file's own docstring.
**Runtime consequence:** At runtime the shell that mounts this component (AgentAppFullyCustomShell.tsx) spreads `{...hookProps} {...legacyProps}` with legacyProps LAST, and legacyProps always sets `error: { type: 'execution_error', message } | null` for back-compat -- even for Tier-3 apps like this one. So `error` actually arrives as an object, and `{error}` would render the literal string "[object Object]" to the user on any execution failure, instead of the real error message.
**Evidence:** features/agent-apps/components/shells/AgentAppFullyCustomShell.tsx lines 226-246, 267: `const hookProps = ctx as unknown as Record<string, unknown>; const legacyProps = { ..., error: error ? { type: 'execution_error', message: error } : null, ... }; <CustomApp {...hookProps} {...legacyProps} />` -- legacyProps.error always wins over ctx.error for any key collision.

## 14. components/ui/chip.tsx:305
**Defect:** Chip/EnhancedChip demo callsites passed variant="danger" but the component's variants/gradientVariants/glowColors/glowIntensity maps (and the canonical MatrxVariant union) only define "destructive", never "danger".
**Runtime consequence:** Rendering <Chip variant="danger"> or <EnhancedChip variant="danger"> indexes every style map with a key that doesn't exist, producing undefined for className/glow color -> chip renders with no variant background/border/shadow classes at all (falls through to just baseStyles), and getGlowStyle's drop-shadow uses `undefined` as the color when glow is set.
**Evidence:** grep -n 'variant="danger"' showed 3 call sites (EnhancedChipExamples line 305/306, ChipExamples lines 429/445 pre-edit); the variants/gradientVariants/glowColors/glowIntensity object literals in the same file only enumerate default/primary/secondary/destructive/success/outline/ghost/link/warning/info/purple/pink/indigo/teal/orange - no 'danger' key anywhere, and MatrxVariant (components/ui/types.ts) also only has 'destructive'.

## 15. components/ui/matrx/matrix-switch.tsx:48
**Defect:** sizeClasses (MatrxLabeledSwitch) and the three iconSizes maps (MatrxIconSwitch/MatrxSideIconSwitch/MatrxIconToggle) only covered 6 of the 9 ComponentSize values (xs/sm/default/md/lg/xl), silently missing '2xl', '3xl', and 'icon' which are valid values of the shared ComponentSize type these components declare as their size prop.
**Runtime consequence:** Any caller passing size="2xl", size="3xl", or size="icon" (all valid per the shared ComponentSize contract in types/componentConfigTypes.ts) gets `undefined` back from the lookup: sizeClasses[size] silently drops the text/gap classes from the label className, and iconSizes[size] passes `size={undefined}` into the lucide Sun/Moon icon (falls back to lucide's default 24px, breaking the intended visual scale for that switch size).
**Evidence:** ComponentSize = "default"|"xs"|"sm"|"md"|"lg"|"xl"|"2xl"|"3xl"|"icon" (types/componentConfigTypes.ts:5-6); the four local size maps in matrix-switch.tsx only had 6 of the 9 keys before this fix, and tsc TS7053 flagged the ComponentSize-keyed lookups as the type had no index signature.

## 16. features/applet/runner/layouts/options/SidebarSearchLayout.tsx:33 — NOT YET FIXED (briefed)
**Defect:** getAppletIcon({ appletIconName, size: 28, appletAccentColor }) passes properties named appletIconName/appletAccentColor, but getComponent (via getAppletIcon) destructures icon/color — every other of the ~20 call sites in the codebase (HeaderLogic.tsx, Grid.tsx, Sidebar.tsx, applet-card/*, app-display/*, IconPicker.tsx) correctly uses { icon, color, size }
**Runtime consequence:** icon and color both silently fall back to their defaults ("Search" icon, "rose" color) inside getComponent instead of using the applet's real selectAppletRuntimeAppletIcon/selectAppletRuntimeAccentColor values — the sidebar-search applet layout has been rendering the wrong default icon/color for every applet regardless of its configured appearance, live in production today
**Evidence:** grep of every getAppIcon/getAppIconWithBg/getSubmitButton/getAppletIcon call site in the repo shows icon:/color: as the universal correct keys (e.g. features/applet/runner/header/desktop/HeaderLogic.tsx:98-102 `getAppIcon({ color: accentColor, icon: iconName, size })`); SidebarSearchLayout.tsx is the sole outlier using appletIconName/appletAccentColor, which are not keys of GetComponentProps

## 17. features/administration/database-admin/DatabaseAdminDashboard.tsx:63
**Defect:** functions state was typed unknown[] and stored the raw get_database_functions RPC result with zero shape validation, unlike the sibling permissions path which already validates rows via toDatabasePermissions before storing.
**Runtime consequence:** If the RPC ever returned a malformed/partial row (e.g. during the in-flight 2026 schema-reorg noted in CLAUDE.md, or a future column rename), FunctionsList/FunctionDetails would silently render undefined/blank cells for name/schema/arguments instead of surfacing the mismatch — a silent data-integrity gap, not a crash, but exactly the class of bug the missing validation was hiding.
**Evidence:** actions/admin/database.ts getFunctions() returns ActionResult<unknown[]> (fully untyped); use-database-admin.ts fetchFunctions() passes it straight through; DatabaseAdminDashboard.tsx previously did setFunctions(functionsData || []) with no shape check, while the parallel loadPermissions() path already used toDatabasePermissions() to filter/validate rows against DatabasePermission before storing.

## 18. utils/server/appDataCache.ts:78
**Defect:** getAppData validated data.app_config/data.applets on a value that TypeScript (correctly) saw as `{}` (Json narrowed by a truthy check), meaning there was no actual structural guarantee the RPC payload had the documented AppConfig/AppletConfig shape before it was blindly `as AppData`-cast and handed to callers (e.g. app/(transitional)/apps/custom/[slug]/[appletSlug]/layout.tsx reads applet.description/applet.creator/applet.name).
**Runtime consequence:** If fetch_app_and_applet_config ever returned an app_config missing id/name/slug (e.g. a partial row from a future schema change or an RPC error path returning a stray object), the old code would pass it through as a fully-typed AppConfig; downstream `.name.trim()` / `.slug` reads would only fail far from the source, with a generic TypeError instead of the loud CACHE-DEBUG error this function is designed to produce.
**Evidence:** Line 90 was `return data as AppData;` — a bare cast on a value typed `{}`/`Json`, with no runtime check that app_config or each applet entry actually carries the required string fields the interfaces declare.

## 19. utils/server/appDataCache.ts:56
**Defect:** supabase.rpc call passed `p_id: id` / `p_slug: slug` where id/slug are `string | null`, but the generated RPC Args type is `{ p_id?: string; p_slug?: string }` (optional-undefined, not nullable) — passing `null` for an omitted optional arg is a real (if minor) contract mismatch with the generated wire types.
**Runtime consequence:** Depends on PostgREST/postgrest-js's handling of an explicit `null` vs an omitted key for an optional RPC parameter; at minimum it fights the generated contract, and at worst sends `p_id: null` to a function whose SQL default is `NULL::uuid` in a way that differs from omitting the argument entirely.
**Evidence:** Callers (app/api/apps/id/[id]/route.ts, app/api/apps/[slug]/route.ts) genuinely pass `null` for the unused one of slug/id, so `id`/`slug` are truly `string | null` at this call site — confirmed by reading both API route callers.

## 20. components/ai/AIChatInterface.tsx:31
**Defect:** Selector read `state.flashcardChat[flashcardId]?.chat` but the slice's actual shape is `{ flashcards: {...}, currentIndex }` — flashcards live at `state.flashcardChat.flashcards[flashcardId]`, not `state.flashcardChat[flashcardId]`.
**Runtime consequence:** `chatMessages` always resolved to `[]` regardless of Redux content: prior chat history never displayed in the AI chat modal, and the OpenAI request never included conversation history (`...chatMessages` spread was always empty), so every follow-up question lost all context.
**Evidence:** lib/redux/slices/flashcardChatSlice.ts defines `interface FlashcardChatState { flashcards: {...}; currentIndex: number }` and every reducer (addMessage, clearChat, etc.) reads/writes `state.flashcards[flashcardId]`, never `state[flashcardId]` directly.

## 21. lib/redux/app-builder/thunks/appBuilderThunks.ts:269
**Defect:** `saveAppThunk` read `savedApp.appletIds` but `savedApp` is a `CustomAppConfig` (the service/DB-layer type), which has `appletList`, not `appletIds` — `appletIds` only exists on the Redux `AppBuilder` state shape.
**Runtime consequence:** `savedApp.appletIds` is `undefined` at runtime, so `savedApp.appletIds || []` always fell back to `[]` — every successful app save wiped the app's applet associations out of the returned Redux state, even though the DB save itself succeeded and the applets were never actually removed from the DB. The two other sibling thunks (createAppThunk line 35, updateAppThunk line 61) and the fetch path (line 206-207) already do the correct `appletList.map(item => item.appletId)` conversion — only this one thunk had the bug.
**Evidence:** lib/redux/app-builder/types.ts:30 declares `appletIds: string[]` on the state type; lib/redux/app-builder/service/customAppService.ts declares `CustomAppConfig` with `appletList`; the exact same file's `setActiveAppWithFetch` thunk (lines 205-207) does the correct extraction pattern this fix now mirrors.

## 22. components/ai-help/AIHelpButton.tsx:63
**Defect:** `handleSaveImage(quality: ImageQuality = 'full')` indexed `lastContext.screenshot[quality]` directly, but `ImageQuality` values ('full'|'compressed'|'thumbnail') don't map 1:1 onto `ScreenshotData` keys — the field is `fullSize`, not `full`.
**Runtime consequence:** Calling `handleSaveImage()` with the default quality (or explicitly with 'full', which the paired AIHelpDialog Select dropdown offers as 'Full Resolution') set `link.href = undefined`; clicking the resulting anchor either did nothing or downloaded a file named 'page-screenshot-full-<timestamp>.png' with no image content.
**Evidence:** types/screenshot.ts: `ScreenshotData { fullSize: string; compressed: string; thumbnail: string; ... }` vs `ImageQuality = 'full' | 'compressed' | 'thumbnail'`. AIHelpDialog.tsx's own `getCurrentImageData()` (lines 42-53) already has the correct switch-case mapping 'full' -> `screenshot.fullSize`, confirming this was the known-correct pattern that AIHelpButton's `handleSaveImage` and AIHelpDialog's inline `<img src={lastContext.screenshot[imageQuality]}>` (line 207) both bypassed.

## 23. components/ai-help/AIHelpDialog.tsx:207
**Defect:** Screenshot preview `<img src={lastContext.screenshot[imageQuality]}>` indexed `ScreenshotData` directly with the `ImageQuality` union, same 'full' vs 'fullSize' key mismatch as AIHelpButton.tsx.
**Runtime consequence:** Selecting 'Full Resolution' in the quality dropdown set `<img src={undefined}>`, breaking the screenshot preview (broken-image icon) instead of showing the full-resolution capture — only 'compressed' and 'thumbnail' ever actually rendered.
**Evidence:** Same `ScreenshotData`/`ImageQuality` shape mismatch; fixed by routing through the file's own already-correct `getCurrentImageData()` helper instead of the raw index.

## 24. lib/ai/adapters/MultiApiBaseAdapter.ts:164
**Defect:** `replaceVariablesInRecipe` (and `extractVariablesFromRecipe`) converted a plain-string `message.content` into `[{ text: message.content }]`, omitting the required `type: 'text'` discriminant field that `ContentBlock` (`{ type: 'text'; text: string }`) declares.
**Runtime consequence:** Every recipe message whose `content` started as a bare string (the common case — see actions/ai.ts:18 `{ role: 'user', content: message }`) came out of `replaceVariablesInRecipe` as a `Message[]` whose content blocks silently violated the `ContentBlock[]` contract (missing `type`). Current callers only read `.text` so it happened not to crash today, but any future/other consumer switching on `contentPart.type === 'text'` (the normal way to consume a discriminated union) would silently drop or mishandle every recipe message that started life as a string.
**Evidence:** Type definitions at lib/ai/adapters/MultiApiBaseAdapter.ts:11-18 (`ContentBlock = { type: 'text'; text: string }`, `Message.content: string | ContentBlock[]`); caller actions/ai.ts:18 constructs messages with plain-string `content`, which then flows through `adapter.replaceVariablesInRecipe(recipe, variables)` at actions/ai.ts:56.

## Dead code deleted under the standing no-legacy-code authority

- components/matrx/next-windows/untested/NextWindowManager.tsx — zero importers repo-wide (grep for 'NextWindowManager' only matched the separate, live components/matrx/next-windows/parts/NextWindowManager.tsx, a fully distinct already-typed file); path is under untested/; not a Next.js route file.
- components/matrx/next-windows/backup/WorkingVersion.tsx — zero importers repo-wide (grep for 'WorkingVersion' returned no other matches at all); path is under backup/; not a Next.js route file.
- components/matrx/next-windows/SliderDock.tsx — zero importers repo-wide (verified via grep for "next-windows/SliderDock" and "SliderDock" across .tsx/.ts, excluding the file itself); its default export LayoutControl also had zero importers; not a Next.js route file; directory is a graveyard of experimental components (siblings named backup/ and untested/).
- components/matrx/CompactTable.tsx — zero importers repo-wide (grep -rln "CompactTable" . across *.tsx/*.ts hit only itself before deletion); not a route file (page/layout/route/loading).
- components/matrx/tooltip/tooltip.tsx — zero importers repo-wide (grep -rn "matrx/tooltip" . hit nothing but itself before deletion); not a route file. Parent directory removed after (now empty).
- components/matrx/next-windows/parts/CommandPallet.tsx — exact duplicate of components/matrx/next-windows/CommandPallet.tsx; the only real importer (NextWindowManager.tsx) imports the non-parts path (`@/components/matrx/next-windows/CommandPallet`), confirmed via grep -rn "next-windows/parts/CommandPallet" . returning zero hits before deletion; not a route file.
- components/mardown-display/markdown-classification/processors/dynamic-function-executor.ts — zero exports consumed anywhere (module has no import/require references repo-wide via `grep -rln createDynamicProcessor` and `grep -rln dynamic-function-executor`, both excluding node_modules, returned only the file itself); self-executing `new Function(...)` demo/scratch script with hardcoded sample data and a top-level `console.log`, not a Next.js route file.
- features/scraper/parts/core/PageTabs.tsx
- features/scraper/utils/json-explorer-utils.ts (grep -rn "json-explorer-utils" repo-wide outside .claude/worktrees/* returned zero importers — the file only referenced itself; its exported getKeysAtPath/getDataAtPath/getNextLevelOptions have no callers anywhere in the active worktree, and equivalent logic already lives in components/official/json-explorer/json-utils.ts and components/official/processor-extractor/utils/json-path-navigation-util.ts)
- features/scraper/parts/ActionButtons.tsx (grep -rn for imports of 'scraper/parts/ActionButtons' and 'import ActionButtons' within features/scraper returned zero hits; the only other component named ActionButtons that IS imported (by components/official/json-explorer/RawJsonExplorer.tsx) resolves to the sibling components/official/json-explorer/ActionButtons.tsx via a relative './ActionButtons' import, confirmed by reading that file's own directory — not a route file, not imported)
- `components/matrx/next-windows/SliderDock.tsx` + `config/ui/density.tsx` — deleted by the orchestrator after re-verifying zero importers (agent deletions that failed to land / briefed).
