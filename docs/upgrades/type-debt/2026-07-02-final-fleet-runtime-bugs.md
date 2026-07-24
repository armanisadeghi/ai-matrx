# Final fleet (components/ + app/) — runtime bugs the loose types were hiding

> Fleet run wf_495ab3dc-9cb, 2026-07-02: 11 grinders + finisher over components/mardown-display,
> components/official|ui|admin|matrx, app/api, app/(admin), app/(core)+(public).
> Same padding-is-worse-than-empty contract as Wave 6. 692 hatches fixed; strict:true flipped.

## 1. components/mardown-display/chat-markdown/BasicMarkdownContent.tsx:132
**Defect:** isTaskItem detection called `.includes()` directly on `node.properties.className`, which per hast's `Properties` type can be `string | number | boolean | (string|number)[] | undefined` — not always an array
**Runtime consequence:** any list-item node whose className hast property resolved to a plain string, number, or boolean (not an array) would throw `TypeError: .includes is not a function` at render time inside react-markdown's list-item renderer
**Evidence:** hast's Properties type allows className: string | number | boolean | Array<string|number>; the old code assumed array shape unconditionally via optional chaining that still calls .includes()

## 2. components/mardown-display/chat-markdown/ConfigurableMarkdownContent.tsx:707
**Defect:** identical className-shape bug in the `li` renderer's isTaskItem detection
**Runtime consequence:** same TypeError as above for any non-array className on a list-item node in the configurable renderer
**Evidence:** same hast Properties union as the BasicMarkdownContent.tsx case

## 3. components/mardown-display/chat-markdown/BasicMarkdownContent.tsx:515
**Defect:** `strong`/`em` renderers read `node.parent?.tagName` to detect a heading ancestor, but react-markdown's hast nodes (via hast-util-to-jsx-runtime) never carry a `.parent` reference
**Runtime consequence:** isInHeading was always false at runtime for every message ever rendered — bold/italic text inside headings never got the intended heading-aware styling; not a crash, but a silently dead feature masked by the `any` cast that let `.parent` compile without error
**Evidence:** verified in node_modules/hast-util-to-jsx-runtime source: no code path ever attaches a `parent` field to element nodes passed to the components map

## 4. components/mardown-display/chat-markdown/ConfigurableMarkdownContent.tsx:567
**Defect:** identical node.parent dead-code bug in the configurable renderer's strong/em components
**Runtime consequence:** same permanently-false isInHeading in this renderer variant
**Evidence:** same hast-util-to-jsx-runtime behavior

## 5. components/mardown-display/chat-markdown/block-registry/BlockRenderer.tsx:620
**Defect:** "image"/"video" block cases used `block.src!` (non-null assertion) even though `RenderBlock.src` is `string | undefined`
**Runtime consequence:** if the splitter ever emitted an image/video block without a resolvable src, `src={undefined}` would reach ImageBlock/VideoBlock, whose `src: string` prop is required and immediately does `fetch(src)` / derives a download filename from it — `fetch(undefined)` throws or silently hits the wrong URL
**Evidence:** components/mardown-display/blocks/images/ImageBlock.tsx requires `src: string` and calls `fetch(src)` unconditionally in copy/download handlers

## 6. components/mardown-display/chat-markdown/block-registry/BlockRenderer.tsx:974
**Defect:** the "decision" case cast `block.serverData`/`block.metadata?.decision` to `any` and only checked `.options?.length`, never validating the object actually matched the `InlineDecision` shape (`id`, `prompt`, `options[].id/label/text`)
**Runtime consequence:** malformed or partial decision data (e.g. missing `id`/`prompt`, or options missing `label`/`text`) would pass the loose `.options?.length` check and be handed to InlineDecisionBlock, which reads `decision.options[...].label`/`.text` unconditionally — undefined values rendering as blank buttons instead of a safe fallback to plain markdown
**Evidence:** components/mardown-display/blocks/inline-decision/InlineDecisionBlock.tsx destructures decision.options and reads .label/.text directly with no guards; the old code's only check was array length, not field presence

## 7. components/mardown-display/markdown-classification/MarkdownInput.tsx:48
**Defect:** ResizablePanelGroup was passed `direction="vertical"` under an @ts-ignore, but react-resizable-panels v4 renamed that prop to `orientation` (verified in node_modules/react-resizable-panels/dist/react-resizable-panels.d.ts, default 'horizontal'). The prop was silently dropped at runtime.
**Runtime consequence:** The markdown-input sidebar's textarea/preview split rendered horizontally instead of the intended vertical stack — a visible layout defect masked by the ts-ignore.
**Evidence:** Group's declared prop is `orientation?: "horizontal" | "vertical"`; there is no `direction` prop at all, so passing it was a no-op.

## 8. components/mardown-display/markdown-classification/parts/CodeComponent.tsx:24
**Defect:** CodeComponent destructured/checked an `inline` prop that react-markdown v10 (package.json pins ^10.1.0) never passes — its `code` component type is `ComponentPropsWithoutRef<'code'> & ExtraProps`, with no `inline` field (removed upstream; v9+ distinguishes code vs inline-code via the `language-*` className only).
**Runtime consequence:** `props.inline` was always `undefined` at runtime, so `!inline` was always `true` — the branch silently depended only on `match` already; harmless today but the code lied about its own gating logic and any future react-markdown upgrade relying on the stale prop would silently misbehave.
**Evidence:** react-markdown's exported `Components['code']` type (node_modules/react-markdown/lib/index.d.ts) has no `inline` field.

## 9. components/mardown-display/markdown-classification/MarkdownClassifier.tsx:13
**Defect:** Imported `usePrepareMarkdownForRendering` (a React HOOK) and called it as a plain async function — `await prepareMarkdownForRendering(markdown, selectedCoordinatorId, selectedViewId)` — inside `useEffect` and a click handler. This violates the Rules of Hooks (hooks may only be called at component top level) and also didn't match the hook's real signature (one options object, not 3 positional args) or return shape (a stateful hook result, not a Promise).
**Runtime consequence:** Calling a hook conditionally/outside render throws 'Invalid hook call' at runtime in React, or (since this component itself was never actually mounted anywhere — zero external importers) would have thrown the moment anyone did wire it up. `await`-ing a non-Promise object also silently resolves to that object immediately rather than the awaited async result.
**Evidence:** usePrepareMarkdownForRendering.ts's exported hook takes `{markdown, coordinatorId, requestedView, requestedProcessor, requestedProcessorConfig}` and returns `{ast, processedData, coordinatorDefinition, viewId}` via internal useState, not a Promise.

## 10. components/mardown-display/markdown-classification/processors/processor-registry.ts:274
**Defect:** `executeIntelligentProcessor` called `processorInput.ast = parseMarkdownToAst(markdown);` without awaiting — `parseMarkdownToAst` is `async` and returns `Promise<AstNode>`.
**Runtime consequence:** Any processor invoked through this path would receive a Promise object where it expected an AstNode; every `.type`/`.children` read on it would be `undefined`, producing an empty/broken processed result with no thrown error — a silent-wrong-output bug, not a crash.
**Evidence:** Function signature: `export const parseMarkdownToAst = async (markdownText: string): Promise<AstNode> => {...}` in markdown-processor-util.ts.

## 11. components/mardown-display/markdown-classification/processors/combined-processor-config-system/break-config-processor.ts:33
**Defect:** `processAST`/`processNode` were typed to take `AstNode[]`/`AstNode` (the raw markdown AST) but were actually called with, and their bodies actually read, `OutputNode`-shaped data (`.content`, non-optional `.depth`) — the real input is `combinedProcessor({ast})`'s `OutputNode[]` return value. `AstNode` (from custom/combined-processor.ts) has no `content` field at all; this only compiled because of a `[key: string]: any` index signature on that local AstNode interface.
**Runtime consequence:** None directly (JS is untyped at runtime, so `.content` reads worked) — but the type was actively lying about the shape, hiding the real bug below.
**Evidence:** combinedProcessor's return type is OutputNode[] (`{type, content?, children?, depth}`), passed straight into `processAST(processedAst, config)` at the bottom of the file.

## 12. components/mardown-display/markdown-classification/processors/combined-processor-config-system/break-config-processor.ts:47
**Defect:** When a break-triggering node matched but had `content: undefined` (a node whose type/depth matched the break config but carried no direct text, only children), `currentContent.push(node.content)` pushed literal `undefined` into a `string[]` — inconsistent with the `else` branch two lines below, which correctly guards with `if (node.content)`.
**Runtime consequence:** `result[currentKey] = [...result[currentKey], ...currentContent]` would propagate `undefined` into the final `ProcessedContent` (typed `{[key:string]: string[]}`); any consumer calling `.trim()`/`.length` on that entry, or rendering it directly, would crash or render the literal string "undefined".
**Evidence:** The parallel `else` branch at the same nesting level already guards identically: `if (node.content) { currentContent.push(node.content); }`.

## 13. components/mardown-display/markdown-classification/processors/structured-ast-config-system/structured-ast-processor.ts:90
**Defect:** `currentGroup[fieldKey] = ((currentGroup[fieldKey] as string[]) || []).concat(childContent);` blindly cast `currentGroup[fieldKey]` (typed `string | string[]`) to `string[]` without checking — if a prior write to the same fieldKey had stored a plain `string` (via the `useTriggerContent` or `contentPath` branches), `.concat()` would dispatch to `String.prototype.concat` at runtime instead of `Array.prototype.concat`, silently producing a garbled string instead of an array.
**Runtime consequence:** A config where the same fieldKey is reachable via both a `collectAllChildren` trigger and a `useTriggerContent`/`contentPath` trigger would produce a corrupted string value where an array was expected, breaking any downstream `.join()`/`.map()` on that field. (Function is currently unreferenced anywhere in the codebase per an existing code comment, so not live today.)
**Evidence:** StructuredOutput's `groups` field type is `{[key:string]: string | string[]}[]`, so `currentGroup[fieldKey]` is honestly `string | string[]`, not always `string[]`.

## 14. components/mardown-display/blocks/math/MathProblemBlock.tsx:75
**Defect:** canvasMetadata passed course/topic/module fields that the canonical CanvasContent metadata type never declares, and nothing in the canvas rendering pipeline (CanvasBody, CanvasRenderer, artifact renderers) reads any key besides title/subtitle/sourceMessageId/etc.
**Runtime consequence:** Opening a math problem in Canvas silently dropped course/topic/module every time, with no error to explain why -- surfaced only once the prop was tightened from Record<string, any> to the real CanvasContent metadata shape and TypeScript flagged the excess properties.
**Evidence:** grep for metadata.course / metadata.topic / metadata.module across features/canvas/** returned zero read sites; only metadata.title is consumed anywhere.

## 15. components/mardown-display/blocks/presentations/PresentationExportMenu.tsx:341
**Defect:** exportPDFWithAllSlides() called slide.bullets.map(...) and parseMarkdownToHTML(slide.title / slide.description) without guards, but SlideData.bullets/title/description are all declared optional.
**Runtime consequence:** Exporting a deck to PDF where any slide omitted bullets (e.g. an intro-only slide) threw "Cannot read properties of undefined (reading 'map')" and aborted the whole export.
**Evidence:** SlideView.tsx's SlideData interface declares bullets?/title?/description? all optional; the PDF export path read them as guaranteed.

## 16. components/mardown-display/blocks/presentations/presentation-export.ts:304
**Defect:** exportToPowerPoint() called slideData.bullets.map(...) unguarded and parseMarkdownForPPT(text: string) rejected undefined text.
**Runtime consequence:** Exporting to PowerPoint for any slide missing bullets/title/subtitle/description threw at runtime and aborted the export -- identical class of bug to the PDF path, in the PPTX path.
**Evidence:** Same SlideData optional fields; parseMarkdownForPPT/createTextWithFormatting both called with values that can be undefined per the real slide schema.

## 17. components/mardown-display/blocks/presentations/presentation-export.ts:509
**Defect:** exportToGoogleSlides() and exportToPowerPoint() destructured `theme` directly off PresentationData and called hexToRgb(theme.primaryColor) / theme.primaryColor.replace(...) with no null check, but real callers (features/research/components/outputs/OutputsStudio.tsx) pass theme={deck.theme ?? {}} confirming theme is genuinely optional/absent at runtime.
**Runtime consequence:** Exporting a presentation deck whose theme was undefined/null (a deck with no explicit theme, the common case from research-generated decks) threw "Cannot read properties of undefined (reading 'primaryColor')" immediately on export.
**Evidence:** features/research/components/outputs/OutputsStudio.tsx:1015 already defensively passes `theme={deck.theme ?? {}}`, proving theme is treated as optional by at least one real caller; the export functions never guarded it.

## 18. components/mardown-display/blocks/presentations/presentation-html-generator.ts:20
**Defect:** generatePresentationHTML() read theme.primaryColor / theme.backgroundColor and slide.title/subtitle/description directly with no defaults, same PresentationData.theme optionality issue as presentation-export.ts.
**Runtime consequence:** Generating the standalone interactive HTML export for a themeless deck threw on theme.primaryColor before any HTML was produced.
**Evidence:** Same PresentationData.theme contract; parseMarkdownAndEscape(text: string) previously rejected undefined slide.title/description.

## 19. components/admin/ResizableDebugPanel.tsx:148
**Defect:** framer-motion onDrag/onDragStart handlers read event.clientX/event.clientY, but the real event param type is MouseEvent | TouchEvent | PointerEvent — TouchEvent has no clientX/clientY (coordinates live in event.touches[]). Removing the `any` on `info` and typing the event param honestly surfaced this.
**Runtime consequence:** Dragging the debug panel on a touch device (iPad/touch laptop) would compute NaN for clientX/clientY, snapping the panel to a broken position or freezing the drag — silently, no console error.
**Evidence:** Sibling correctly-typed components in the same codebase (components/ui/enhanced-draggable-card.tsx, components/ui/transformable-card.tsx) use `info.point.x`/`info.point.y` from framer-motion's PanInfo instead of `event.clientX`, confirming the panel's own event-based reads were wrong for the full event union its own handler signature already claimed to accept.

## 20. components/ui/animated-tooltip.tsx:36
**Defect:** handleMouseMove used event.target.offsetWidth instead of event.currentTarget.offsetWidth to compute the tooltip rotate/translate half-width
**Runtime consequence:** If the mousemove event bubbled from a descendant node of the <Image> (or any element without offsetWidth), halfWidth would be wrong or NaN, breaking the tooltip's spring rotate/translate animation
**Evidence:** event.target is EventTarget (untyped, could be any node the event bubbled through); event.currentTarget is the actual bound <img> element. Typing the handler as React.MouseEvent<HTMLImageElement> and reading currentTarget.offsetWidth is the only type-honest and behaviorally-correct fix.

## 21. components/ui/sparkles.tsx:84
**Defect:** tsparticles interactivity.events.resize was set to the boolean `true` (cast with `as any`) instead of the required IResizeEvent shape { enable: boolean; delay?: number }
**Runtime consequence:** tsparticles options loader expects an object for `resize`; passing a bare boolean does not match IResizeEvent and would likely be dropped/ignored during the engine's options merge, silently disabling the intended resize-responsiveness behavior with zero warning
**Evidence:** node_modules/@tsparticles/engine IResizeEvent.d.ts declares `{ delay: number; enable: boolean }`; the `as any` was the only thing letting a boolean pass where an object was required

## 22. components/ui/JsonComponents/JsonViewerComponent.tsx:163
**Defect:** Object.entries(parsedData) was called without checking parsedData wasn't an array, so a top-level JSON array would render as if it were a plain object (numeric-string keys), losing array semantics (no brackets icon, no item-count collapse text)
**Runtime consequence:** Passing a top-level array as `data` (e.g. `[1,2,3]`) to <JsonViewer> would silently render it through the object-keyed path instead of the array-aware JsonViewerItem branch
**Evidence:** Object.entries on an array yields [['0',1],['1',2],...] with no array-type information passed down; JsonViewerItem's own isArray/isSimpleArray logic depends on receiving the true array, not a per-index re-keyed traversal

## 23. components/ui/file-upload/FileUploadWithStorage.tsx:65
**Defect:** normalizedToLegacyResult defaulted a missing NormalizedFile.url to empty string "" instead of surfacing the failure, violating the media-durability rule (never silently mask a missing durable URL)
**Runtime consequence:** If upload() with createShareLink:true ever completed without stitching a URL onto the NormalizedFile, callers would receive a UploadedFileResult with url:"" that looks like a valid-but-empty string rather than a failed upload, and any renderer using it as an <img>/<video> src without a truthy-guard would silently show a broken asset
**Evidence:** NormalizedFile.url is `url?: string` (features/files/handler/types.ts) — genuinely optional; UploadedFileResult.url is required `string`; the `?? ""` coercion papered over the boundary mismatch instead of throwing

## 24. components/ui/file-upload/PasteImageHandler.tsx:139
**Defect:** Same class of bug as FileUploadWithStorage: normalized.url defaulted to "" via `??` instead of surfacing an upload that completed without a durable URL
**Runtime consequence:** A pasted image whose upload succeeded but did not receive a durable URL would be handed to onImagePasted with url:"", masquerading as a valid (empty) URL instead of a failed paste
**Evidence:** Same NormalizedFile.url optionality as above; the existing try/catch in handlePaste already logs + calls onError/toast.error, so throwing here routes the failure through the correct existing error-handling path instead of injecting a fake empty URL

## 25. components/ui/transformable-card.tsx:173
**Defect:** handleMouseMove (bound to onMouseMove) cast a React.MouseEvent through `as unknown as PointerEvent` to satisfy framer-motion's dragControls.start(event: PointerEvent, ...) signature
**Runtime consequence:** framer-motion's DragControls.start reads pointer-specific fields; forcing a MouseEvent through an unsafe cast risks passing an event object that doesn't actually behave like a PointerEvent at runtime for touch/pen input, and the cast hid a genuine type mismatch rather than fixing it
**Evidence:** framer-motion's DragControls.start signature is `start(event: React.PointerEvent | PointerEvent, options?)`; switching the handler + JSX prop to onPointerMove/React.PointerEvent<HTMLDivElement> satisfies the real signature with zero casts and additionally makes drag-initiation work correctly for touch/pen input, not just mouse

## 26. components/official/ImageCropUploader.tsx:91
**Defect:** assetToResult(asset) was typed asset: ReturnType<typeof Object.assign> (an untyped catch-all) instead of the real Asset type from @/features/files, and defensively did `asset.variants ?? {}` even though Asset.variants is Record<string, AssetVariant> (never undefined).
**Runtime consequence:** Because the parameter type was not the real Asset shape, any future caller passing a differently-shaped object would silently compile; the `?? {}` fallback masked the fact the loose type gave no real guarantee variants existed, and any drift between this ad-hoc type and the canonical Asset contract used in ImageAssetUploader.tsx's own assetToUploaderResult would go undetected by the compiler.
**Evidence:** Compared against features/files/types.ts:1274 `export interface Asset { ... variants: Record<string, AssetVariant> ... }` (non-optional) and the sibling canonical implementation ImageAssetUploader.tsx:241 mapAssetToLegacyVariants(asset: Asset) which accesses asset.variants directly with no fallback.

## 27. components/official/processor-extractor/utils/json-path-navigation-util.ts:176 — NOT FIXED (briefed)
**Defect:** cleanJson's internal cleanRecursively() had a `typeof input === 'string'` branch that re-JSON.parse'd string values recursively, but it was placed AFTER `if (input === null || typeof input !== 'object') return input;`, which already returns for every string before reaching that branch. The string-reparsing branch was dead code that never executed.
**Runtime consequence:** Any caller relying on cleanJson to recursively parse nested JSON-encoded strings inside an object (e.g. a field whose value is itself a JSON string) got the raw string back unparsed, silently, with no error — the intended recursive-unwrap behavior for stringified nested JSON never ran.
**Evidence:** components/official/processor-extractor/utils/json-path-navigation-util.ts (pre-edit): the two guards are literally sequential in the same function body with no early return or state change between them that could make the string check reachable.

## 28. components/matrx/camera/camera-view.tsx:43
**Defect:** errorMessages.noCameraAccessible! and .permissionDenied! used non-null assertions on optional props; a caller passing a PARTIAL override object (e.g. {noCameraAccessible: 'custom'}) would get undefined for the other key while the `!` lied to TS it was a string
**Runtime consequence:** Camera permission-denied warning would render literal 'undefined' text instead of a message whenever a caller customizes only one of the two error strings
**Evidence:** camera-types.ts declares errorMessages?: {noCameraAccessible?: string; permissionDenied?: string} - both independently optional, so a partial override is a valid call shape the type system already allowed

## 29. components/matrx/AnimatedRevealCard/SmallAnimatedRevealCard.tsx:50
**Defect:** IconComponent wrapper spread `{...props}` (typed `any`) into DynamicIcon, including a `strokeWidth={1}` prop that DynamicIcon's real IconProps interface (components/official/icons/IconResolver.tsx) does not declare or forward
**Runtime consequence:** strokeWidth={1} was silently dropped at runtime on every call site in both Small/StandardAnimatedRevealCard - the icon stroke width prop had zero effect and no compiler warning ever surfaced it
**Evidence:** IconResolver.tsx's IconProps = {name, color, size, className, fallbackIcon} - no strokeWidth field, and DynamicIcon destructures only those five before rendering

## 30. components/matrx/AnimatedForm/FlexAnimatedForm.tsx:259
**Defect:** ColorPicker's `color` prop expects a `Colord` class instance (from the `colord` library), but the color-field branch passed the raw formState value (a string from user input) directly, hidden behind `formState[field.name]` typed via FormState's `[key:string]: any`
**Runtime consequence:** Passing a plain string where ColorPicker expects a Colord instance would break `.toHex()`/color-manipulation calls inside ColorPicker at runtime for any consumer that uses the 'color' field type in a FlexAnimatedForm
**Evidence:** components/ui/color-picker.tsx declares `color?: Colord` and calls `color.toHex()`; FlexAnimatedForm's own local FormState was `[key: string]: any` masking the type mismatch entirely

## 31. components/matrx/AnimatedForm/separated/FlexField.tsx:160
**Defect:** Same ColorPicker/Colord mismatch as FlexAnimatedForm.tsx, independently duplicated in the separated/FlexField.tsx variant of the same form-field renderer
**Runtime consequence:** Same runtime break as above for any caller of the separated FlexField renderer using a 'color' field type
**Evidence:** identical formState[field.name] as any passed straight into ColorPicker's color prop

## 32. components/matrx/AnimatedForm/AnimatedButton.tsx:8
**Defect:** FlexForm.tsx passed a `size` prop to AnimatedButton (suppressed with @ts-ignore, 'size prop type mismatch, removing from commonProps') but AnimatedButton's real prop type never declared `size` at all - the prop was silently dropped every render
**Runtime consequence:** Submit/Next buttons in FlexForm never got the compact/comfortable-density sizing they were coded to request - always rendered at default size regardless of density setting
**Evidence:** AnimatedButton.tsx's React.FC<ButtonHTMLAttributes & MotionProps & {disabled}> had no size field before this fix; the @ts-ignore existed specifically to hide that the prop did nothing

## 33. app/api/agent-shortcut-categories/[id]/duplicate/route.ts:119
**Defect:** insertPayload used organization_id: source.organization_id ?? null then forced the insert through with .insert(insertPayload as never); platform.categories.organization_id is NOT NULL on Insert.
**Runtime consequence:** Any source category whose organization_id resolved to null/undefined would hit a raw Postgres NOT-NULL constraint violation surfaced as an opaque 500, instead of a clean validation error.
**Evidence:** types/database.types.ts platform.categories Insert requires organization_id: string (no '?'); the route's as never cast was the only thing letting a possibly-null value compile.

## 34. app/api/agent-shortcut-categories/[id]/route.ts:166
**Defect:** PATCH built topLevel from unvalidated client body fields, then forced the update through with .update(topLevel as never) with no type or shape validation on client-supplied label/color/sort_order/etc.
**Runtime consequence:** A client sending e.g. sort_order: 'abc' or label: 123 would pass straight to Postgres, producing a raw type-mismatch DB error instead of a clean 400.
**Evidence:** Rewrote topLevel as the real platform.categories Update type with per-field typeof guards; removing as never immediately required (and exposed the previous absence of) type checks.

## 35. app/api/webhooks/resend/route.ts:199 — NOT FIXED (briefed)
**Defect:** handleEmailComplained() ran .eq('user_id', data.to) where data.to is the recipient's raw email address from the Resend payload, but users.user_email_preferences.user_id is an auth UUID column.
**Runtime consequence:** Every spam-complaint webhook silently failed to unsubscribe the user (query matches zero rows, error stays null) - a compliance-relevant no-op with no visible failure.
**Evidence:** types/database.types.ts users.user_email_preferences.user_id: string (UUID FK to auth.users); no getUserByEmail/RPC exists in the codebase to resolve email->user_id, confirming this path was never wired correctly.

## 36. app/api/auth/extension/exchange/route.ts:86
**Defect:** email: user.email! asserted non-null before calling supabase.auth.admin.generateLink({type:'magiclink', email}).
**Runtime consequence:** A phone-only or email-less auth.users row hitting this endpoint would pass email: undefined to generateLink, producing a confusing upstream Supabase error instead of a clear 400.
**Evidence:** Supabase auth.users.email is nullable; added an explicit if (!user.email) guard returning 400 before the assertion was removed.

## 37. app/api/deepgram/speak/route.ts:64
**Defect:** .catch((error: any) => new NextResponse(error || error?.message, {status:500})) passed a raw Error/unknown object directly as the NextResponse body.
**Runtime consequence:** NextResponse body expects BodyInit (string/stream); passing a non-Error, non-string thrown value would coerce to '[object Object]' or throw during body serialization instead of returning the real error message.
**Evidence:** NextResponse constructor's body param type; rewrote to error instanceof Error ? error.message : String(error).

## 38. app/api/sharing/notify/route.ts:42
**Defect:** getResourceDetails('canvas') queried .from('canvases') on the default public schema - a table that does not exist anywhere in the generated schema.
**Runtime consequence:** Every canvas-share notification email silently failed (caught by the inner try/catch, returned null), producing a 404 'Resource details not found' response to the sharing user with no indication of the real cause.
**Evidence:** grep of database.types.ts shows no canvases table in any schema; the real data lives in canvas.canvas_items (has a title column). Repointed the query to .schema('canvas').from('canvas_items').

## 39. app/api/sharing/notify/route.ts:57 — NOT FIXED (briefed)
**Defect:** getResourceDetails('collection') queried .from('collections') - no such table exists in public or any other schema in the current DB.
**Runtime consequence:** Every 'collection' share notification silently failed the same way as the canvas case above (caught error -> null -> caller 404).
**Evidence:** grep of database.types.ts confirms zero collections table anywhere; left as an explicit no-op with a warning log rather than guessing at a replacement table (no evidence of what collections should resolve to today).

## 40. app/(admin)/administration/chat/cx-dashboard/errors/errors-content.tsx:43
**Defect:** onExportJSON handler called exportToJSON(errors as any, "errors") where `errors` is `{error_requests, error_tool_calls}` (an object) but exportToJSON's signature is `(data: Record<string, unknown>[], ...)` — an array.
**Runtime consequence:** Clicking 'Export JSON' on the Errors admin page would silently no-op: exportToJSON does `if (!data.length) return;` and an object's `.length` is `undefined` (falsy), so the function returns immediately with zero download and zero error — the button appeared to do nothing.
**Evidence:** features/cx-dashboard/utils/export.ts:49-57 exportToJSON signature + `if (!data.length) return;` guard; app/(admin)/administration/chat/cx-dashboard/errors/errors-content.tsx type ErrorsData = {error_requests, error_tool_calls} (an object, not an array).

## 41. app/(admin)/administration/chat/cx-dashboard/requests/[id]/request-detail-content.tsx:93
**Defect:** onClick handler called exportToJSON(detail as any, "request-detail") where `detail` is `{user_request, requests, tool_calls, cost_verification}` (an object), not an array.
**Runtime consequence:** Clicking 'Export' on a Request Detail admin page would silently no-op for the same reason as the Errors page: `detail.length` is `undefined`, exportToJSON returns before building/downloading the JSON blob.
**Evidence:** app/(admin)/administration/chat/cx-dashboard/requests/[id]/request-detail-content.tsx type Detail = {user_request, requests, tool_calls, cost_verification}; features/cx-dashboard/utils/export.ts exportToJSON expects an array.

## 42. app/(public)/p/[slug]/page.tsx:22
**Defect:** Custom hand-rolled RPC wrapper type cast (as unknown as any + reinvented .rpc() signature) bypassed the real generated get_aga_public_data return type, and the resulting object was force-cast (as never) into PublicAgentApp, which requires 6 fields (app_kind, shared_context_slots, search_tsv, total_tokens_used, total_cost, unique_users_count) the RPC never returns.
**Runtime consequence:** Not a crash today (the renderer never reads those 6 fields), but any future consumer of PublicAgentApp reading them would silently get undefined typed as a required field with no compiler warning, a latent contract violation.
**Evidence:** RPC Returns shape in types/database.types.ts:25118 lists exactly 24 fields; PublicAgentApp (features/agent-apps/types.ts) requires 6 more that aren't in that list.

## 43. app/(core)/agents/[id]/apps/page.tsx:27
**Defect:** getAppsForAgent's partial Supabase select (a subset of app.definition columns) was force-cast via as unknown as AgentApp[] to the full AgentAppRecord shape. The DB's status column is a bare string (no enum) and tags is string[] | null, but AgentAppRecord.status: AppStatus (literal union) and tags: string[] (non-null) were asserted without validation.
**Runtime consequence:** If app.definition.status ever held any value outside draft/published/archived/suspended, or if tags was null for a legacy row, downstream code trusting the typed AgentApp.status/tags would either silently mis-branch or throw on null.
**Evidence:** types/database.types.ts:1866-1904 shows app.definition.status: string and tags: string[] | null vs features/agent-apps/types.ts AgentAppRecord requiring status: AppStatus and tags: string[].

## 44. app/(core)/podcast/[slug]/feed.xml/route.ts:97
**Defect:** The public RSS feed route cast raw pc_shows/pc_episodes rows directly to PcShow/PcEpisode via as, bypassing the canonical mapPcShowRow/mapPcEpisodeRow converters that validate display_mode, parse speakers JSON, and parse rss_settings JSON, instead re-implementing a weaker unvalidated version of the rss_settings normalization inline with no shape check at all.
**Runtime consequence:** If rss_settings ever held a non-object JSON value, the raw cast would silently produce a PcShowRssSettings whose field reads return undefined from an array/string instead of triggering the parseRssSettings null-guard, producing an inconsistent iTunes RSS feed served to real podcast directories.
**Evidence:** features/podcasts/types.ts:192-195 parseRssSettings explicitly guards typeof raw !== object || Array.isArray(raw) before trusting the shape; the feed.xml route's inline cast had no such guard.

## 45. app/(public)/app_callback/route.ts:10
**Defect:** OAuth provider env vars (NOTION_CLIENT_ID, GITHUB_CLIENT_ID, SLACK_CLIENT_ID + secrets) were asserted non-null with ! with no other reference to these vars anywhere else in the codebase, meaning they are very likely unconfigured.
**Runtime consequence:** If this GET route were ever actually hit, URLSearchParams would stringify undefined as the literal string undefined for client_id/client_secret, sending a broken OAuth token-exchange request to the provider instead of a clear 500 from our own config check.
**Evidence:** grep -rn NOTION_CLIENT_ID / GITHUB_CLIENT_ID across the repo (excluding this file) returned zero other results.

## 46. components/mardown-display/MarkdownRenderer.tsx:57
**Defect:** The `li` component override destructured `ordered` and `index` from react-markdown's props via `: any`. react-markdown v10 (installed version, confirmed in node_modules/react-markdown/lib/index.d.ts) removed these props entirely in its v9 rewrite — they no longer exist on the `ExtraProps`/`Components` type and are never passed at runtime.
**Runtime consequence:** The custom ordered-list numbering branch (if ordered && typeof index === 'number') was permanently dead: ordered is always undefined at runtime, so the branch condition is always false. Any content relying on the custom span-based numbering markup (distinct styling from native ol numbering) silently never rendered — it fell through to the plain li branch every single time, with no error or warning.
**Evidence:** node_modules/react-markdown/lib/index.d.ts defines Components as ComponentType<JSX.IntrinsicElements[Key] & ExtraProps> where ExtraProps only has node. Corroborated independently by a comment already present in a sibling file (components/mardown-display/markdown-classification/parts/CodeComponent.tsx:14-17, owned by another agent) documenting the same upstream removal for the code/inline case.

## 47. components/mardown-display/MarkdownRenderer.tsx:139
**Defect:** The `code` component override destructured `inline` from react-markdown's props via `: any` and used `!inline && language` to decide block-vs-inline code rendering. `inline` was removed from react-markdown's public API in the same v9 rewrite and is never passed.
**Runtime consequence:** Not a behavior bug (since !undefined is always true, the check silently degraded to language ? block : inline, which happens to be correct because inline code never carries a language-* className) — but the : any hid that inline was phantom, and a future edit that changed the condition to also check inline truthiness would have silently broken block-code detection with zero type error to catch it.
**Evidence:** Same react-markdown v10 type definitions; same corroboration from CodeComponent.tsx's documented comment for the identical upstream change.

## Dead code deleted (32 files, zero-importer proof each)

- components/mardown-display/markdown-classification/custom-views/deprecated-to-be-removed/registry.ts (100% commented-out dead code, zero importers, folder literally named 'deprecated-to-be-removed')
- components/mardown-display/markdown-classification/custom-views/deprecated-to-be-removed/loading-components.tsx (100% commented-out dead code, zero importers, same folder)
- components/admin/state-analyzer/sliceViewers/EntitySliceViewer.tsx — zero importers in the live tree (stateViewerTabs.tsx no longer imports it); not a route file.
- components/admin/GeneratePromptForSystemModal.tsx — zero importers anywhere in app/ or components/; not a route file.
- components/admin/ResizableDebugPanel.tsx — zero importers anywhere; not a route file. (Type/bug fixes made to it earlier in the session are superseded by this deletion.)
- components/admin/ReorderableTab.tsx — zero importers anywhere (ReorderableTab/ReorderableTabs both unreferenced); not a route file.
- components/admin/AdminSaveButton.tsx — zero importers anywhere (AdminSaveJsonButton/AdminSaveTextButton/AdminSaveImageButton all unreferenced); not a route file. (Type fixes made to it earlier in the session are superseded by this deletion.)
- components/admin/ClientDebugWrapper.tsx — zero importers anywhere; not a route file.
- components/admin/applet-admin/ValidationStatus.tsx — zero importers anywhere; not a route file.
- components/ui/menu-system/GenericContextMenu.tsx (zero importers anywhere; only referenced by its own barrel index.ts)
- components/ui/menu-system/GenericDropdownMenu.tsx (zero importers anywhere)
- components/ui/menu-system/MenuCore.tsx (zero importers outside the folder)
- components/ui/menu-system/MenuRegistry.ts (zero importers outside the folder; unrelated to the live features/shell/constants/route-menu-registry.ts which is a different, unconnected system)
- components/ui/menu-system/GlobalMenuItems.ts (zero importers outside the folder)
- components/ui/menu-system/types.ts (zero importers outside the folder)
- components/ui/menu-system/index.ts (barrel with zero external importers)
- components/ui/loaders/loading-button.tsx (zero importers anywhere; not in the official component registry or react-live-scope.ts)
- components/ui/loaders/loading-button-group.tsx (zero importers anywhere)
- components/ui/loaders/loading-button-group-pairs.tsx (zero importers anywhere)
- components/ui/samples/accordion.tsx (zero importers anywhere)
- components/ui/samples/button.tsx (zero importers anywhere)
- components/ui/samples/calendar.tsx (zero importers anywhere)
- components/ui/samples/radio-group.tsx (zero importers anywhere)
- components/ui/samples/select.tsx (zero importers anywhere)
- Removed the unused local helper function `formatPhotoForMobile` from components/image/unsplash/mobile/MobileUnsplashGallery.tsx (defined with a `(photo: any)` param, zero callers anywhere in the codebase - grep confirmed no invocation).
- app/(admin)/administration/utilities/utils/text-cleaner/utilities/junk/errorFormatter.ts (zero importers anywhere in the repo; folder literally named junk/; ErrorFormatter class read parsed.summary/parsed.suggestions fields never declared on ParsedError, only reachable via the any-shaped index signature it depended on)
- app/(admin)/administration/utilities/utils/text-cleaner/utilities/junk/errorHandlers.ts (zero importers anywhere in the repo; folder literally named junk/; ErrorHandlerConfig type held the Record<string, any> hatches)
- app/(admin)/administration/utilities/utils/text-cleaner/utilities/errorProcessors.ts lines 752-821 (an entire parseGenericTypeScriptError function body sitting inside a /* ... */ block comment — genuinely dead/inert code, not a real hatch since it never compiles, but matched the hatch scanner's text search)
- components/mardown-display/data-display/JsonDataDisplay.tsx — zero importers anywhere in the repo (grep confirmed). A completely different, unrelated JsonDataDisplay already lives at utils/logger/components/ReduxLogViewer.tsx:62 and is the one actually used. The scoped file also called the component as a plain function (parsedContent: any) rather than with a props object, and its : any param was the only hatch in it.
- components/mardown-display/enhanced-rederer-older/EnhancedMarkdownRenderer.tsx — directory name signals a stale prior-generation copy ('older'); zero importers anywhere in the repo (grep confirmed, including string-path/dynamic-import searches).
- components/mardown-display/new/MarkdownFlowDiagramConverter.tsx — zero importers anywhere in the repo; only self-references were its own definition/export lines. Deleting also removed the now-empty new/ directory.
- components/mardown-display/code/HtmlPageEditor.example.tsx — a .example.tsx demo file with zero importers anywhere in the repo. Left components/mardown-display/code/README.md in place (docs only, not code).
