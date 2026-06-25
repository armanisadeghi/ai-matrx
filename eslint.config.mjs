// ESLint flat config (ESLint v9+ / Next.js 16+).
// Replaces the legacy .eslintrc.json. `next lint` was removed in Next.js 16 —
// run lint via the ESLint CLI: `pnpm lint` (which now invokes `eslint .`).
//
// Faithful port of the previous .eslintrc.json. The `no-restricted-imports`
// guard around `features/window-panels/windows/**` is preserved to keep the
// window-panels bundle-splitting contract intact (see .claude/skills/window-panels/SKILL.md).

import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import noBarrelFiles from 'eslint-plugin-no-barrel-files';

const windowPanelsImportRestriction = {
    patterns: [
        {
            group: [
                '@/features/window-panels/windows/*',
                '@/features/window-panels/windows/**/*',
            ],
            message:
                "Import window components only via the overlay controller's per-overlay dynamic() (features/overlays/OverlayController.tsx). Direct imports break bundle splitting. See .claude/skills/overlay-system/SKILL.md.",
        },
        {
            group: ['*supabase*storage*', '*storage*Bucket*'],
            message:
                'Direct Supabase Storage usage is banned. All file flows go through @/features/files (which talks to the Python backend). See docs/FILE_HANDLING_CONSOLIDATION_PLAN.md.',
        },
        // Phase 0 of the file-handling consolidation: external callers must
        // import the public surface from `@/features/files` (the locked
        // public index), never from internal subdirectories. Phase 1 will
        // tighten further to deny the api/redux/upload subpaths entirely.
        // See docs/FILE_HANDLING_CONSOLIDATION_PLAN.md.
        {
            group: ['@/features/files/api', '@/features/files/api/*'],
            message:
                'Do not import from features/files/api — use @/features/files (the public surface). HTTP helpers (getJson/postJson/del/patchJson/etc.) live at @/lib/python-client.',
        },
        // Tier 1 of the file-handling ring-fence (per
        // docs/SWEEP_INTERNAL_IMPORTS.md): zero external importers today,
        // so the ban lands now with no migration. New external imports of
        // these internal subdirs fail the build.
        {
            group: [
                '@/features/files/cache',
                '@/features/files/cache/*',
            ],
            message:
                'features/files/cache is internal infrastructure (in-memory LRU, IndexedDB store, Service Worker registration). Use the public hooks from @/features/files instead.',
        },
        {
            group: [
                '@/features/files/virtual-sources',
                '@/features/files/virtual-sources/*',
            ],
            message:
                'features/files/virtual-sources is internal — the adapters are registered at module load. External code should compose against the public hooks / handler facade.',
        },
        // Tier 2 of the file-handling ring-fence (post-Tier-1, the
        // tier-2 sweep cleared every external violator): hooks, upload,
        // providers, services. Everything that was importable here is
        // now re-exported on the public index.
        {
            group: [
                '@/features/files/hooks',
                '@/features/files/hooks/*',
            ],
            message:
                'features/files/hooks is internal. Import the hook you need from @/features/files (the public surface index).',
        },
        {
            group: [
                '@/features/files/upload',
                '@/features/files/upload/*',
            ],
            message:
                'features/files/upload is internal. Use useFileUpload from @/features/files (or `requestUpload` for non-React imperative call sites — also exported from @/features/files).',
        },
        {
            group: [
                '@/features/files/providers',
                '@/features/files/providers/*',
            ],
            message:
                'features/files/providers is internal. The single CloudFilesRealtimeProvider mount lives in app/Providers.tsx; import via @/features/files if you really need it.',
        },
        {
            group: [
                '@/features/files/services',
                '@/features/files/services/*',
            ],
            message:
                'features/files/services is internal. Use the public hooks from @/features/files.',
        },
        // Tier 4 of the file-handling ring-fence: the slice / selectors /
        // thunks / converters / realtime middleware. Store wiring
        // (cloudFilesReducer, cloudFilesRealtimeMiddleware) is re-exported
        // on the public index so even lib/redux/{store,entity-store,
        // rootReducer}.ts goes through @/features/files. Bulk-mutation
        // callsites in the image-cloud cluster + the bulk-selector
        // consumers (RAG hits, WhatsApp media, picker pages) are tracked
        // for a follow-up sweep — they need new public hooks (a
        // useFileMutation family + a paginated all-files view) before
        // their imports can be cleanly migrated.
        {
            group: [
                '@/features/files/redux',
                '@/features/files/redux/*',
            ],
            message:
                'Do not import slice/selectors/thunks/converters directly. Use the public hooks (useFile, useFileNode, useFolderNode, useCloudTree, useFolderContents) and converters (fileIdToMediaRef, cloudFileToMediaRef, urlToMediaRef, fileUriToMediaRef) re-exported from @/features/files. Store wiring (cloudFilesReducer, cloudFilesRealtimeMiddleware) and the narrow explorer-state contract (setActiveFileId, setActiveFolderId, selectTreeStatus) are public named exports.',
        },
        // Tier 3 of the file-handling ring-fence (per
        // docs/SWEEP_INTERNAL_IMPORTS.md): the four largest internal
        // subdirs. External callers must import from `@/features/files`.
        // app/(a)/files/** is allowlisted below for the co-located route
        // shell (PageShell) and the server-only utils (server-cookies,
        // server-search-params).
        {
            group: [
                '@/features/files/handler',
                '@/features/files/handler/*',
            ],
            message:
                'Do not import handler internals — use the public surface (@/features/files) which re-exports fileHandler, useFile, useFileAs, useFileSrc, useFileBlob, useFileUpload, normalize, preferIdentityLocator, and all handler types.',
        },
        {
            group: [
                '@/features/files/components',
                '@/features/files/components/*',
            ],
            message:
                'Do not import component internals — use the public surface (@/features/files) which re-exports the canonical render / picker / dialog set (FilePreview, MediaThumbnail, FileTree, FileResourceChip, PreviewPane, WindowPanelShell, PdfAnnotationLayer, useFileActions, useFolderActions, CloudFilesPickerHost, openFilePicker, openFolderPicker, etc.). If your component is missing from the index, promote it instead of importing internally.',
        },
        {
            group: ['@/features/files/types'],
            message:
                'Import types from @/features/files (the public surface re-exports the entire type module via `export type *`).',
        },
        {
            group: [
                '@/features/files/utils',
                '@/features/files/utils/*',
            ],
            message:
                'Do not import from features/files/utils — use the equivalent re-exports from @/features/files (CloudFolders, folderFor*, formatFileSize, isImageMime, getFilePreviewProfile, etc.). app/(a)/files/** is allowlisted for the server-only helpers (server-cookies, server-search-params).',
        },
    ],
};

// File-handling consolidation — paths permanently banned for new imports.
// Each entry below is either a deleted hook (so any new import would fail
// to compile) or a soon-to-be-deleted shim being kept alive only while
// its remaining internal callers are migrated.
//
// useFileAsset (Asset envelope hook) and useFileDocument (RAG metadata
// lookup) are NOT in this list — they are canonical single-purpose hooks
// kept across the rebuild.
const deletedFileHooksRestriction = {
    paths: [
        {
            name: '@/features/files/hooks/useSignedUrl',
            message:
                'useSignedUrl was deleted. Use useFileSrc({kind:"file_id",fileId}) from @/features/files.',
        },
        {
            name: '@/features/files/hooks/useGuardedFileUpload',
            message:
                'useGuardedFileUpload was deleted. Use useFileUpload().uploadMany from @/features/files.',
        },
        {
            name: '@/features/agents/hooks/useAiImageUrl',
            message:
                'useAiImageUrl was deleted. Extract the cld_files UUID from the URL and use useFileSrc({kind:"file_id",fileId}) from @/features/files.',
        },
        {
            name: '@/components/ui/file-upload/useFileUploadWithStorage',
            message:
                'useFileUploadWithStorage was deleted. Use useFileUpload from @/features/files.',
        },
        {
            name: '@/components/ui/file-upload/usePasteImageUpload',
            message:
                'usePasteImageUpload was deleted. Attach a paste listener and call useFileUpload().upload({kind:"file"}) from @/features/files.',
        },
        {
            name: '@/features/files/handler/hooks/useFileMediaBlock',
            message:
                'useFileMediaBlock will fold into useFileAs({kind:"media_block"}) in a follow-up.',
        },
        {
            name: '@/features/files/handler/hooks/useFileDownloadUrl',
            message:
                'useFileDownloadUrl will fold into useFileSrc({mode:"download"}) in a follow-up.',
        },
        {
            name: '@/features/files/upload/cloudUpload',
            message:
                'cloudUpload is internal to @/features/files. Use useFileUpload from @/features/files.',
        },
    ],
};

// Banned lucide-react icons — Wand / Sparkles / Bot are AI-cliché icons
// we're purging from the app. Implemented as a tiny inline plugin so we
// can wire it as `warn` independently of the (deliberately `error`) global
// `no-restricted-imports` / `no-restricted-syntax` slots, without flat
// config's "later rule wins" replacing those higher-severity bans.
const BANNED_LUCIDE_ICON_RE = /^(Wand2?|Sparkles?|Bot)$/;

// Media durability — a raw <img>/<video>/<audio>/<source> pointing at OUR
// storage can't self-heal: a signed S3 link rots when its signature expires,
// and a public viewer can't re-mint it. The doctrine (CLAUDE.md "Media
// durability") is: render our media through <InlineMediaRef> (it re-mints from a
// file_id / serves the CDN URL). We can't lint dynamic `src={var}` (the runtime
// value is unknown — that's the DB-edge guard's job), but a hardcoded storage
// URL in a raw tag is an unambiguous, catchable regression. See KNOWN_DEFECTS D1.
const OUR_STORAGE_HOST_RE =
    /matrx-user-files\.s3|cdn\.matrxserver|\.supabase\.co\/storage|\/podcast-assets\//i;

const matrxLintPlugin = {
    rules: {
        'no-raw-storage-media': {
            meta: {
                type: 'problem',
                docs: {
                    description:
                        'Disallow raw <img>/<video>/<audio>/<source> whose src is a hardcoded AI-Matrx storage URL — render via <InlineMediaRef> instead.',
                },
                schema: [],
                messages: {
                    raw: "Raw <{{tag}}> with a hardcoded AI-Matrx storage URL. Our media must render through <InlineMediaRef> (@/features/files) so it re-mints / serves a durable URL — a raw tag can't self-heal and a signed S3 link rots. See CLAUDE.md 'Media durability' / KNOWN_DEFECTS D1.",
                },
            },
            create(context) {
                const MEDIA_TAGS = new Set(['img', 'video', 'audio', 'source']);
                const check = (node, raw, tag) => {
                    if (typeof raw === 'string' && OUR_STORAGE_HOST_RE.test(raw)) {
                        context.report({ node, messageId: 'raw', data: { tag } });
                    }
                };
                return {
                    JSXOpeningElement(node) {
                        const tag =
                            node.name && node.name.type === 'JSXIdentifier'
                                ? node.name.name
                                : null;
                        if (!tag || !MEDIA_TAGS.has(tag)) return;
                        for (const attr of node.attributes) {
                            if (
                                attr.type !== 'JSXAttribute' ||
                                attr.name.name !== 'src' ||
                                !attr.value
                            ) {
                                continue;
                            }
                            const v = attr.value;
                            if (v.type === 'Literal') {
                                check(attr, v.value, tag);
                            } else if (v.type === 'JSXExpressionContainer') {
                                const e = v.expression;
                                if (e.type === 'Literal') {
                                    check(attr, e.value, tag);
                                } else if (e.type === 'TemplateLiteral') {
                                    check(
                                        attr,
                                        e.quasis.map((q) => q.value.cooked).join(''),
                                        tag,
                                    );
                                }
                            }
                        }
                    },
                };
            },
        },
        'no-banned-lucide-icons': {
            meta: {
                type: 'suggestion',
                docs: {
                    description:
                        'Disallow Wand / Sparkles / Bot icons from lucide-react.',
                },
                schema: [],
                messages: {
                    banned:
                        "'{{name}}' from lucide-react is banned (AI-cliché icon). Pick a domain-specific Lucide icon, or use a custom icon from @/components/icons.",
                },
            },
            create(context) {
                return {
                    ImportDeclaration(node) {
                        if (node.source.value !== 'lucide-react') return;
                        for (const spec of node.specifiers) {
                            if (
                                spec.type === 'ImportSpecifier' &&
                                spec.imported.type === 'Identifier' &&
                                BANNED_LUCIDE_ICON_RE.test(spec.imported.name)
                            ) {
                                context.report({
                                    node: spec,
                                    messageId: 'banned',
                                    data: { name: spec.imported.name },
                                });
                            }
                        }
                    },
                };
            },
        },
    },
};

// Doctrine anti-pattern #3 — Parallel Redux slices (see PRINCIPLES.md).
// `createSlice` / `createReducer` must live alongside the rest of the store
// in `lib/redux/**` or `features/*/redux/**`. Calling them anywhere else
// is almost always a sign that a new slice is being spun up for data that
// already has a canonical home. Extend the existing slice instead.
// The bottom-of-file override (allowedSlicePaths) re-enables these imports
// for the legitimate slice dirs only.
const parallelSliceRestriction = {
    paths: [
        {
            name: '@reduxjs/toolkit',
            importNames: ['createSlice', 'createReducer'],
            message:
                'createSlice / createReducer must live in lib/redux/** or features/*/redux/**. Adding a new slice elsewhere fragments global state. Extend an existing slice instead — see PRINCIPLES.md anti-pattern #3 (Parallel Redux slices). If a genuinely new slice is needed, place it in the canonical dirs.',
        },
        {
            name: '@reduxjs/toolkit/react',
            importNames: ['createSlice', 'createReducer'],
            message:
                'createSlice / createReducer must live in lib/redux/** or features/*/redux/**. See PRINCIPLES.md anti-pattern #3.',
        },
    ],
};

// features/scopes is the single owner of every `ctx_*` table. The
// chokepoint is `features/scopes/service/scopesService.ts` — every other
// file in the repo must go through that service (or a thunk/hook layered
// on top of it). The selector catches `supabase.from('ctx_anything')`
// calls anywhere outside the allowlist below.
//
// This is the "scopesService is the sole Supabase chokepoint" invariant
// from features/scopes/FEATURE.md. Violations of this rule are how the
// scope system rotted into 8 overlapping slices last time.
const scopesChokepointSyntaxRestrictions = [
    {
        selector:
            "CallExpression[callee.property.name='from'][arguments.0.type='Literal'][arguments.0.value=/^ctx_/]",
        message:
            "Direct supabase.from('ctx_*') is banned. Every ctx_* table goes through @/features/scopes/service/scopesService (mounted via scope thunks). See features/scopes/FEATURE.md.",
    },
];

// Client tool results MUST be posted through @/features/agents/api/submit-tool-results
// (the `submitToolResult` thunk → microtask batcher → `postToolResults`). That
// funnel intrinsically reads `continuation_needed` on the response and fires
// `resumeInstance` against /ai/conversations/{id}/resume so the agent loop
// continues after the backend's hard-suspend (`_suspend_for_delegation`).
//
// Any direct POST to /tool_results from anywhere else skips the resume handoff
// and reintroduces the "user submits an ask-user answer → nothing happens" bug.
//
// The selectors catch:
//   - `path: "/ai/conversations/{conversation_id}/tool_results"` (callApi)
//   - `` `${baseUrl}/ai/conversations/${id}/tool_results` `` (raw fetch)
//   - `"/tool_results"` string concatenation
// See features/agents/docs/CLIENT_TOOL_SUSPEND_RESUME.md.
const toolResultsChokepointSyntaxRestrictions = [
    {
        selector: "Literal[value=/\\/tool_results$/]",
        message:
            "Direct POST to /tool_results is banned. Tool results MUST go through submitToolResult() in @/features/agents/api/submit-tool-results, which is the single funnel that fires the continuation_needed → resumeInstance handoff. Bypassing it reintroduces the 'stream never resumes after ask-user' bug. See features/agents/docs/CLIENT_TOOL_SUSPEND_RESUME.md.",
    },
    {
        selector: "TemplateElement[value.raw=/\\/tool_results/]",
        message:
            "Direct POST to /tool_results is banned. Tool results MUST go through submitToolResult() in @/features/agents/api/submit-tool-results. See features/agents/docs/CLIENT_TOOL_SUSPEND_RESUME.md.",
    },
];

// All file flows must funnel through @/features/files. ESLint cannot
// fully prevent direct supabase.storage member access (no AST rule for that
// without a custom plugin), but `no-restricted-syntax` catches the canonical
// `supabase.storage.from(...)` shape and the `getPublicUrl` / `createSignedUrl`
// member calls. Combined with the runtime guardrail in
// utils/supabase/client.ts, new violations are caught immediately.
const fileHandlerSyntaxRestrictions = [
    {
        selector:
            "MemberExpression[object.name=/^(supabase|client|createClient)$/][property.name='storage']",
        message:
            'Direct supabase.storage usage is banned. Use the universal file handler (@/features/files) instead.',
    },
    {
        selector:
            "CallExpression[callee.property.name='getPublicUrl'][callee.object.callee.property.name='from']",
        message:
            'Direct supabase Storage getPublicUrl is banned. Use the universal file handler — it picks the right URL automatically.',
    },
];

// Legacy Supabase API key names are BANNED. The new keys are
// `sb_publishable_*` (browser) and `sb_secret_*` (server). The JWT-based
// `anon` / `service_role` keys are deprecated by Supabase.
// Docs: https://supabase.com/docs/guides/getting-started/api-keys
//
// Use ONLY these env var names in the codebase:
//   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
//   SUPABASE_SECRET_KEY
//   NEXT_PUBLIC_SUPABASE_HTML_PUBLISHABLE_KEY
//   SUPABASE_HTML_SECRET_KEY
//
// The selector matches `process.env.<bannedName>` as a MemberExpression with
// the env var name as the property. This catches `process.env.X` reads,
// destructured `const { X } = process.env`, and `if ('X' in process.env)`
// (the second and third forms via the Identifier/Literal selectors).
const legacySupabaseKeyBan = [
    {
        selector:
            "MemberExpression[object.object.name='process'][object.property.name='env'][property.name='NEXT_PUBLIC_SUPABASE_ANON_KEY']",
        message:
            'NEXT_PUBLIC_SUPABASE_ANON_KEY is DEPRECATED. Use NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (sb_publishable_*). https://supabase.com/docs/guides/getting-started/api-keys',
    },
    {
        selector:
            "MemberExpression[object.object.name='process'][object.property.name='env'][property.name='SUPABASE_SERVICE_ROLE_KEY']",
        message:
            'SUPABASE_SERVICE_ROLE_KEY is DEPRECATED. Use SUPABASE_SECRET_KEY (sb_secret_*). https://supabase.com/docs/guides/getting-started/api-keys',
    },
    {
        selector:
            "MemberExpression[object.object.name='process'][object.property.name='env'][property.name='NEXT_PUBLIC_SUPABASE_HTML_ANON_KEY']",
        message:
            'NEXT_PUBLIC_SUPABASE_HTML_ANON_KEY is DEPRECATED. Use NEXT_PUBLIC_SUPABASE_HTML_PUBLISHABLE_KEY (sb_publishable_*). https://supabase.com/docs/guides/getting-started/api-keys',
    },
    {
        selector:
            "MemberExpression[object.object.name='process'][object.property.name='env'][property.name='SUPABASE_HTML_SERVICE_ROLE_KEY']",
        message:
            'SUPABASE_HTML_SERVICE_ROLE_KEY is DEPRECATED. Use SUPABASE_HTML_SECRET_KEY (sb_secret_*). https://supabase.com/docs/guides/getting-started/api-keys',
    },
    // Catches the bracket-access form: process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY']
    {
        selector:
            "MemberExpression[object.object.name='process'][object.property.name='env'][computed=true][property.value=/^(NEXT_PUBLIC_SUPABASE_ANON_KEY|SUPABASE_SERVICE_ROLE_KEY|NEXT_PUBLIC_SUPABASE_HTML_ANON_KEY|SUPABASE_HTML_SERVICE_ROLE_KEY)$/]",
        message:
            'Legacy Supabase API key env vars are DEPRECATED and BANNED. Use sb_publishable_* / sb_secret_*. https://supabase.com/docs/guides/getting-started/api-keys',
    },
];

// Bundle-splitting fence for the canonical agent context menu. The menu
// (UnifiedAgentContextMenu) is heavy — MenuBody + the fetch hook + Radix +
// every icon — and by design its data fetch is deferred to menu-open. A
// STATIC value import drags the whole component into the importing route's
// server/client chunk, defeating that design: it ballooned the production
// build ~15 → 24 min when 5 surfaces regressed to static imports during the
// v2 rollout. Import it via `next/dynamic({ ssr: false })` (single-tier, never
// nested) instead. The selector matches ONLY a static value ImportSpecifier —
// `import type {...}` and dynamic `import()` are intentionally unaffected.
// See .cursor/skills/surface-pro-rollout/SKILL.md.
const canonicalMenuStaticImportBan = [
    {
        selector:
            "ImportDeclaration[importKind!='type'][source.value='@/features/context-menu-v2/UnifiedAgentContextMenu'] > ImportSpecifier[importKind!='type'][imported.name='UnifiedAgentContextMenu']",
        message:
            "Do not statically import UnifiedAgentContextMenu — it balloons the route chunk (a static import ballooned the prod build 15→24min). Use next/dynamic({ ssr: false }): const UnifiedAgentContextMenu = dynamic(() => import('@/features/context-menu-v2/UnifiedAgentContextMenu').then((m) => ({ default: m.UnifiedAgentContextMenu })), { ssr: false }). `import type {...}` is fine. See .cursor/skills/surface-pro-rollout/SKILL.md.",
    },
];

// Bundle-splitting fence for the v3 context menu. v3's public API is the
// LIGHTWEIGHT shell (EditableContextMenu / NonEditableContextMenu) — import
// those statically. The heavy layer is `MenuContent` (MenuBody-class tree +
// react-icons + data hooks + launchers); the shell reaches it ONLY via
// `dynamic(() => import('./components/MenuContent'))`. A static import drags the
// whole heavy graph into the importing chunk, defeating the T0/T1 split.
// Matches a static default import only; dynamic `import()` is unaffected.
const contextMenuV3StaticImportBan = [
    {
        selector:
            "ImportDeclaration[importKind!='type'][source.value='@/features/context-menu-v3/components/MenuContent'] > ImportDefaultSpecifier",
        message:
            "Do not statically import MenuContent — it's the heavy v3 layer and must stay behind the shell's next/dynamic({ ssr: false }) boundary. Render a surface menu via EditableContextMenu / NonEditableContextMenu from @/features/context-menu-v3 instead.",
    },
    {
        selector:
            "ImportDeclaration[importKind!='type'][source.value='@/features/context-menu-v3/components/MobileMenuContent'] > ImportDefaultSpecifier",
        message:
            "Do not statically import MobileMenuContent — it's the heavy mobile v3 layer and must stay behind the shell's next/dynamic({ ssr: false }) boundary. Render a surface menu via EditableContextMenu / NonEditableContextMenu from @/features/context-menu-v3 instead.",
    },
];

// Heavy-core "*Impl" components are split behind a thin dynamic wrapper (the
// "*Impl + wrapper" pattern — see the code-splitting skill). The wrapper
// dynamic-imports the Impl via a RELATIVE path; importing an `@/…Impl` module
// statically from anywhere else bypasses the split and bundles the entire heavy
// core (e.g. the whole markdown/rich-document pipeline) into that chunk — a
// build-time leak of the exact class that ballooned the build. (Real instance:
// ScrapedContentPretty statically imported `@/components/MarkdownStreamImpl`,
// pulling the markdown engine — block registry, code highlighter, jspdf,
// html2canvas — into the scraper graph.) Import the dynamic wrapper (the sibling
// WITHOUT the `Impl` suffix) instead. `import type` and dynamic `import()` are
// unaffected; relative `./FooImpl` wrapper-internal imports are unaffected.
const heavyImplStaticImportBan = [
    {
        selector:
            "ImportDeclaration[importKind!='type'][source.value=/^@\\/.*Impl$/]",
        message:
            "Do not statically import a heavy `*Impl` core — it bundles the whole heavy component into this chunk (a build-time leak). Import its dynamic wrapper instead: the sibling module without the `Impl` suffix, which does next/dynamic({ ssr: false }). `import type {...}` and dynamic import() are fine. See the code-splitting skill.",
    },
];

export default [
    ...nextCoreWebVitals,
    {
        plugins: {
            'no-barrel-files': noBarrelFiles,
            matrx: matrxLintPlugin,
        },
        rules: {
            'no-barrel-files/no-barrel-files': 'warn',
            // Loud but non-blocking — keep at 'warn' so CI / Vercel builds
            // don't fail while we clean up existing usages.
            'matrx/no-banned-lucide-icons': 'warn',
            // Media durability — hardcoded storage URLs in raw media tags. Loud
            // but non-blocking; the DB-edge guard covers the dynamic-src case.
            'matrx/no-raw-storage-media': 'warn',
            'react-hooks/exhaustive-deps': 'off',
            '@next/next/no-img-element': 'off',
            'react/no-unescaped-entities': 'off',
            'import/no-anonymous-default-export': 'off',
            'no-restricted-imports': [
                'error',
                {
                    patterns: windowPanelsImportRestriction.patterns,
                    paths: [
                        ...deletedFileHooksRestriction.paths,
                        ...parallelSliceRestriction.paths,
                    ],
                },
            ],
            // Browser dialogs are banned — see CLAUDE.md "Browser dialogs are BANNED".
            // Use <ConfirmDialog /> from @/components/ui/confirm-dialog,
            // or toast.success/error from sonner, or a proper <Dialog />.
            // Set to 'warn' (not 'error') only because the codebase has a
            // long tail of legacy violations being cleaned up incrementally.
            // For new code, treat the warning as a hard stop.
            'no-alert': 'warn',
            'no-restricted-globals': [
                'warn',
                {
                    name: 'confirm',
                    message:
                        'Browser confirm() is banned. Use <ConfirmDialog /> from @/components/ui/confirm-dialog. See CLAUDE.md.',
                },
                {
                    name: 'alert',
                    message:
                        'Browser alert() is banned. Use toast.success/error from sonner. See CLAUDE.md.',
                },
                {
                    name: 'prompt',
                    message:
                        'Browser prompt() is banned. Use a <Dialog /> with an <Input />. See CLAUDE.md.',
                },
            ],
            'no-restricted-properties': [
                'warn',
                {
                    object: 'window',
                    property: 'confirm',
                    message:
                        'window.confirm is banned. Use <ConfirmDialog /> from @/components/ui/confirm-dialog. See CLAUDE.md.',
                },
                {
                    object: 'window',
                    property: 'alert',
                    message:
                        'window.alert is banned. Use toast.success/error from sonner. See CLAUDE.md.',
                },
                {
                    object: 'window',
                    property: 'prompt',
                    message:
                        'window.prompt is banned. Use a <Dialog /> with an <Input />. See CLAUDE.md.',
                },
            ],
            'no-restricted-syntax': [
                'error',
                // Legacy Supabase API key env vars are hard-banned — no exceptions.
                ...legacySupabaseKeyBan,
                // File-handler rules retain their original "warn-like" intent by
                // virtue of having actionable messages; eslint severity is shared
                // across the array, so we keep them in the same rule slot.
                ...fileHandlerSyntaxRestrictions,
                // features/scopes chokepoint — only scopesService.ts may touch ctx_* tables.
                ...scopesChokepointSyntaxRestrictions,
                // features/agents tool-results chokepoint — only submit-tool-results.ts may POST /tool_results.
                ...toolResultsChokepointSyntaxRestrictions,
                // Canonical context menu must be loaded via next/dynamic({ ssr: false }),
                // never a static value import (it balloons the route chunk).
                ...canonicalMenuStaticImportBan,
                // v3 menu: MenuContent (heavy) must stay behind the shell's dynamic boundary.
                ...contextMenuV3StaticImportBan,
                // Heavy "*Impl" cores must be reached via their dynamic wrapper, never imported statically.
                ...heavyImplStaticImportBan,
            ],
        },
    },
    {
        // ─── Model Settings: one place decides the standard list ───────────
        // The STANDARD settings list is selected in exactly ONE place —
        // buildSettingsRows() (lib/redux/slices/agent-settings/
        // settings-catalogue.ts), which returns the model's supported keys.
        // Set-but-unsupported keys are surfaced separately by the validation /
        // caution layer (the IssueTable). Components must NOT re-filter the
        // settings list by model inline (getControl()/controls[key]/
        // normalizedControls[key]) — that ad-hoc filtering is what drifted and
        // regressed across the three panels (settings vanishing per model, then
        // the inverse "all keys in the standard list" bug). Map over
        // buildSettingsRows() instead. This override re-includes the global
        // syntax bans (flat-config replaces, not merges, per rule).
        files: [
            'features/agents/components/settings-management/**/*.{ts,tsx}',
            'features/prompts/components/configuration/ModelSettings.tsx',
            'features/agent-settings/components/LLMParamsGrid.tsx',
        ],
        rules: {
            'no-restricted-syntax': [
                'error',
                ...legacySupabaseKeyBan,
                ...fileHandlerSyntaxRestrictions,
                ...scopesChokepointSyntaxRestrictions,
                ...toolResultsChokepointSyntaxRestrictions,
                {
                    selector:
                        "CallExpression[callee.property.name=/^(filter|some)$/]:has(CallExpression[callee.name=/^getControl/])",
                    message:
                        'Do not select the settings list by model support (getControl) in a component. buildSettingsRows() (settings-catalogue.ts) is the ONE place that picks the standard (supported) keys; set-but-unsupported keys go to the caution layer. Map over buildSettingsRows() instead. Ad-hoc filtering here is the class of bug that kept regressing.',
                },
                {
                    selector:
                        "CallExpression[callee.property.name=/^(filter|some)$/]:has(MemberExpression[object.name=/^(controls|normalizedControls)$/][computed=true])",
                    message:
                        'Do not select the settings list by controls[key]/normalizedControls[key] in a component. buildSettingsRows() (settings-catalogue.ts) is the ONE place that picks the standard (supported) keys; set-but-unsupported keys go to the caution layer. Map over buildSettingsRows() instead. Ad-hoc filtering here is the class of bug that kept regressing.',
                },
            ],
        },
    },
    {
        files: ['features/files/**/*'],
        rules: {
            // The files feature owns the supabase.storage / cloud-files
            // internals. It still must NOT use legacy Supabase API key
            // env vars.
            'no-restricted-syntax': ['error', ...legacySupabaseKeyBan],
        },
    },
    {
        // Media durability fence (see CLAUDE.md "Media durability" +
        // KNOWN_DEFECTS.md D1). Podcast surfaces render OUR OWN media (covers,
        // clip video, audio) which is persisted from a stream and can arrive as
        // an expiring signed S3 URL. A raw <img>/<video> can't re-mint and
        // silently rots when the signature expires — and an anonymous public
        // page (/podcast/[slug]) can't re-mint at all. Render through
        // <InlineMediaRef> from @/features/files, which serves the durable
        // CDN/public URL and re-mints from a file_id for authed owners.
        // The ONE justified raw element is PodcastAudioPlayer's headless
        // <audio> (a custom imperative transport InlineMediaRef doesn't model);
        // <audio> is intentionally NOT banned here. This override re-lists the
        // global syntax bans because flat-config replaces (not merges) the rule.
        files: ['features/podcasts/**/*.{ts,tsx}'],
        rules: {
            'no-restricted-syntax': [
                'error',
                ...legacySupabaseKeyBan,
                ...fileHandlerSyntaxRestrictions,
                ...scopesChokepointSyntaxRestrictions,
                ...toolResultsChokepointSyntaxRestrictions,
                {
                    selector: "JSXOpeningElement[name.name='img']",
                    message:
                        "Raw <img> is banned in features/podcasts — render via <InlineMediaRef> from @/features/files so the media URL stays durable and self-heals. A raw <img> silently rots when a signed S3 URL expires. See CLAUDE.md \"Media durability\" / KNOWN_DEFECTS.md D1.",
                },
                {
                    selector: "JSXOpeningElement[name.name='video']",
                    message:
                        "Raw <video> is banned in features/podcasts — render via <InlineMediaRef as=\"video\"> from @/features/files (it supports ambient autoPlay/loop/muted/playsInline/preload). A raw <video> silently rots when a signed S3 URL expires. See CLAUDE.md \"Media durability\" / KNOWN_DEFECTS.md D1.",
                },
            ],
        },
    },
    {
        files: ['features/window-panels/windows/**/*'],
        rules: {
            'no-restricted-imports': 'off',
        },
    },
    {
        // Overlay overhaul rule #1: no JSX prop spread inside the
        // OverlayController Impl. The whole reason the Impl exists is to
        // make prop wiring explicit so TypeScript catches dispatch /
        // component prop-shape drift at compile time — a single `{...spread}`
        // anywhere in here would defeat the point. See
        // docs/OVERLAY_WINDOW_OVERHAUL.md.
        files: ['features/overlays/OverlayController.tsx'],
        rules: {
            'no-restricted-syntax': [
                'warn',
                {
                    selector: 'JSXSpreadAttribute',
                    message:
                        'No JSX prop spread in OverlayController.tsx — wire every prop by name. Spread reintroduces the dispatch/component drift bug class this file exists to eliminate. See docs/OVERLAY_WINDOW_OVERHAUL.md.',
                },
            ],
        },
    },
    {
        files: [
            // The explicit overlay controller — by design, this file directly
            // imports every window/overlay component (one `dynamic()` per
            // entry). The "no direct windows/* import" rule exists to keep
            // those imports out of route bundles; the controller IS the one
            // sanctioned place that loads them (lazily). The legacy
            // UnifiedOverlayController / OverlaySurface / windowRegistry.ts
            // files that used to share this exemption are deleted.
            'features/overlays/OverlayController.tsx',
        ],
        rules: {
            'no-restricted-imports': 'off',
        },
    },
    {
        // The /files route shells legitimately co-locate with the Files
        // feature: they own the PageShell composition for `/files/*` and
        // need the server-only utils (server-cookies, server-search-params)
        // for SSR cookie + URL state parsing. The Tier-3 ring-fence does
        // not apply to them. Every other path swap (`@/features/files/**`
        // → `@/features/files`) is still in force for the rest of the
        // codebase. See docs/SWEEP_INTERNAL_IMPORTS.md.
        files: ['app/(a)/files/**/*', 'app/(core)/files/**/*'],
        rules: {
            'no-restricted-imports': 'off',
        },
    },
    // ─── features/scopes chokepoint allowlist ─────────────────────────
    //
    // The `scopesChokepointSyntaxRestrictions` rule bans `.from('ctx_*')`
    // calls globally. This override re-enables them for:
    //   1. The single permanent chokepoint:
    //        features/scopes/service/scopesService.ts
    //   2. Legacy modules slated for deletion in Phase 5
    //      (features/scopes/FEATURE.md §"Retirement inventory").
    //
    // Adding a new path here is a Doctrine violation. Adding a new ctx_*
    // table access in a feature consumer is the bug — route through the
    // service instead. Remove paths from this list as Phase 5 consumes
    // them; the ban must shrink toward the single permanent chokepoint
    // by the end of the rebuild.
    {
        files: [
            // Permanent chokepoint.
            'features/scopes/service/scopesService.ts',
            // Phase-5 retirement queue — these files will be deleted or
            // rewritten to go through scopesService.
            'features/agent-context/service/contextService.ts',
            'features/agent-context/service/contextVariableService.ts',
            'features/agent-context/service/hierarchyService.ts',
            'features/agent-context/hooks/useContextItems.ts',
            'features/agent-context/redux/organizationsSlice.ts',
            'features/agent-context/redux/projectsSlice.ts',
            'features/agent-context/redux/tasksSlice.ts',
            'features/scope-system/components/AddScopeModal.tsx',
            'features/scope-system/components/EditScopeTypeSheet.tsx',
            'features/scope-system/redux/contextItemsSlice.ts',
            // Consumer-feature ctx_* writes that need their own thunk
            // re-routing (already documented in §Retirement inventory).
            'features/notes/redux/thunks.ts',
            'features/projects/service.ts',
            'features/tasks/services/taskService.ts',
            'features/tasks/services/projectService.ts',
            'lib/redux/prompt-execution/thunks/fetchScopedVariablesThunk.ts',
            // Admin/route surfaces that read ctx_* until their migration ships.
            'app/(a)/organizations/[orgId]/page.tsx',
            'app/(a)/organizations/[orgId]/tasks/page.tsx',
            'app/(a)/invitations/project/accept/[token]/page.tsx',
            'app/api/projects/invitations/resend/route.ts',
            'app/api/projects/invite/route.ts',
            'app/api/cron/due-date-reminders/route.ts',
            'app/api/sandbox/route.ts',
        ],
        rules: {
            'no-restricted-syntax': [
                'error',
                ...legacySupabaseKeyBan,
                ...fileHandlerSyntaxRestrictions,
                // scopesChokepointSyntaxRestrictions intentionally omitted.
                ...toolResultsChokepointSyntaxRestrictions,
            ],
        },
    },
    // ─── features/agents tool-results chokepoint allowlist ────────────
    //
    // submit-tool-results.ts IS the funnel that owns the
    // continuation_needed → resumeInstance handoff. It's the only file
    // allowed to construct the /tool_results endpoint string. This override
    // re-lists the OTHER global bans (flat-config replaces the array per
    // file rather than merging — see eslint.config.mjs gotcha comments
    // throughout this file) so all other chokepoints remain enforced here.
    //
    // Adding any other file to this list is a Doctrine violation —
    // bypassing the funnel forfeits the resume handoff. See
    // features/agents/docs/CLIENT_TOOL_SUSPEND_RESUME.md.
    {
        files: ['features/agents/api/submit-tool-results.ts'],
        rules: {
            'no-restricted-syntax': [
                'error',
                ...legacySupabaseKeyBan,
                ...fileHandlerSyntaxRestrictions,
                ...scopesChokepointSyntaxRestrictions,
                // toolResultsChokepointSyntaxRestrictions intentionally omitted.
            ],
        },
    },
    // Tier-4 ring-fence — these files still import from
    // @/features/files/redux/* because their migrations need new public-
    // surface primitives that aren't shipped yet:
    //
    //   - image-cloud read surfaces (CloudFilesTab, CloudImagesTab,
    //     CloudUploadTab, FilesResourcePicker) consume `selectAllFilesMap`
    //     / `selectAllFilesArray` or dispatch `loadUserFileTree` /
    //     `ensureFolderPath` thunks. The mutation surfaces
    //     (CloudFilesBrowserTable) moved off this override in `phase 1.x`
    //     once `useFileMutation` / `useFolderMutation` shipped.
    //   - useImageStudio dispatches the bulk `uploadFiles` thunk with
    //     concurrency + per-file metadata — needs a public bulk-upload
    //     primitive.
    //   - RagSearchHits / CldFilePicker / useWhatsAppMedia consume
    //     `selectAllFilesMap` / `selectAllFilesArray` to iterate every
    //     cached file — each is a legitimate architectural smell (each
    //     re-renders on every files-map change) and needs a paginated
    //     all-files / mime-filtered view hook rather than a bulk-read
    //     escape hatch on the public index.
    //
    // The override is scoped exactly to these files so any NEW external
    // import from features/files/redux fails the build.
    {
        files: [
            'components/image/cloud/CloudFilesTab.tsx',
            'components/image/cloud/CloudImagesTab.tsx',
            'components/image/cloud/CloudUploadTab.tsx',
            'features/image-studio/hooks/useImageStudio.ts',
            'features/rag/components/data-stores/CldFilePicker.tsx',
            'features/rag/components/search/RagSearchHits.tsx',
            'features/resource-manager/resource-picker/FilesResourcePicker.tsx',
            'features/whatsapp-clone/hooks/useWhatsAppMedia.ts',
        ],
        rules: {
            'no-restricted-imports': 'off',
        },
    },
    // Doctrine anti-pattern #3 (Parallel Redux slices) — the parallelSliceRestriction
    // bans `createSlice` / `createReducer` everywhere by default. The override below
    // re-enables them for the canonical slice locations and for test fixtures.
    // The override turns off `no-restricted-imports` entirely for these paths since
    // those files have no business importing window-panel internals or deleted file
    // hooks either.
    //
    // If you find yourself adding a new path to this allowlist for non-test code,
    // stop and re-read PRINCIPLES.md anti-pattern #3 — the answer is almost always
    // "extend an existing slice", not "add a new slice location".
    {
        files: [
            'lib/redux/**',
            'lib/sync/**',
            'features/*/redux/**',
            'features/*/state/**',
            'styles/themes/**',
            '**/__tests__/**',
            '**/*.test.ts',
            '**/*.test.tsx',
        ],
        rules: {
            'no-restricted-imports': 'off',
        },
    },
];
