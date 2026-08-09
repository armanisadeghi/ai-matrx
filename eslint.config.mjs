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
        // File-handling: the public index barrel was deleted (2026-07-26).
        // Import directly from the owning module. Internal subdirs below
        // stay banned. See features/files/FEATURE.md.
        {
            group: ['@/features/files/api', '@/features/files/api/*'],
            message:
                'Do not import from features/files/api — use direct module paths or @/lib/python-client for HTTP helpers (getJson/postJson/del/patchJson/etc.).',
        },
        {
            group: [
                '@/features/files/cache',
                '@/features/files/cache/*',
            ],
            message:
                'features/files/cache is internal infrastructure (in-memory LRU, IndexedDB store, Service Worker registration). Use @/features/files/hooks/useFileBlob.',
        },
        {
            group: [
                '@/features/files/virtual-sources',
                '@/features/files/virtual-sources/*',
            ],
            message:
                'features/files/virtual-sources is internal — the adapters are registered at module load. Compose against @/features/files/handler/handler or the public hooks.',
        },
        {
            group: [
                '@/features/files/upload',
                '@/features/files/upload/*',
            ],
            message:
                'features/files/upload is internal. Use useFileUpload from @/features/files/handler/hooks/useFileUpload (or requestUpload from @/features/files/upload/requestUpload for imperative call sites).',
        },
        {
            group: [
                '@/features/files/providers',
                '@/features/files/providers/*',
            ],
            message:
                'features/files/providers is internal. The CloudFilesRealtimeProvider mount lives in app/Providers.tsx.',
        },
        {
            group: [
                '@/features/files/services',
                '@/features/files/services/*',
            ],
            message:
                'features/files/services is internal. Use the public hooks under @/features/files/hooks/**.',
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
            name: '@/features/files',
            message:
                'The features/files barrel (index.ts) was deleted. Import directly from the owning module — e.g. @/features/files/handler/handler, @/features/files/components/inline/InlineMediaRef, @/features/files/types. See features/files/FEATURE.md.',
        },
        {
            name: '@/features/files/hooks/useSignedUrl',
            message:
                'useSignedUrl was deleted. Use useFileSrc({kind:"file_id",fileId}) from @/features/files/handler/hooks/useFileSrc.',
        },
        {
            name: '@/features/files/hooks/useGuardedFileUpload',
            message:
                'useGuardedFileUpload was deleted. Use useFileUpload().uploadMany from @/features/files/handler/hooks/useFileUpload.',
        },
        {
            name: '@/features/agents/hooks/useAiImageUrl',
            message:
                'useAiImageUrl was deleted. Extract the cld_files UUID from the URL and use useFileSrc({kind:"file_id",fileId}) from @/features/files/handler/hooks/useFileSrc.',
        },
        {
            name: '@/components/ui/file-upload/useFileUploadWithStorage',
            message:
                'useFileUploadWithStorage was deleted. Use useFileUpload from @/features/files/handler/hooks/useFileUpload.',
        },
        {
            name: '@/components/ui/file-upload/usePasteImageUpload',
            message:
                'usePasteImageUpload was deleted. Attach a paste listener and call useFileUpload().upload({kind:"file"}) from @/features/files/handler/hooks/useFileUpload.',
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
                'cloudUpload is internal to features/files/upload. Use useFileUpload from @/features/files/handler/hooks/useFileUpload.',
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
// URL in a raw tag is an unambiguous, catchable regression. See FOUND_DEFECTS D1.
const OUR_STORAGE_HOST_RE =
    /matrx-user-files\.s3|cdn\.matrxserver|\/podcast-assets\//i;

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
                    raw: "Raw <{{tag}}> with a hardcoded AI-Matrx storage URL. Our media must render through <InlineMediaRef> (@/features/files) so it re-mints / serves a durable URL — a raw tag can't self-heal and a signed S3 link rots. See CLAUDE.md 'Media durability' / FOUND_DEFECTS D1.",
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
        'no-parallel-stream-json-scan': {
            meta: {
                type: 'problem',
                docs: {
                    description:
                        'Disallow importing the streaming JSON scanner (StreamingJsonTracker) outside the canonical extraction path. Feeding it the raw chunk stream re-scans undifferentiated text (thinking included) — the exact class of bug where a JSON sample inside <thinking> shadows the real answer. JSON extraction must derive from the ANSWER-only render-block text (see process-stream.ts runJsonExtraction + deriveAnswerText).',
                },
                schema: [],
                messages: {
                    banned:
                        "Do not import StreamingJsonTracker here. It is the streaming raw-text JSON scanner and belongs ONLY to the canonical extraction path (features/agents/redux/execution-system/thunks/process-stream.ts), which feeds it the ANSWER-only text via deriveAnswerText — never raw chunks. For a one-shot parse of a string you already have, use extractFirstJson/extractAllJson from @/utils/json/extract-json. Spinning up a parallel scanner reintroduces the thinking-pollution bug this ban exists to kill.",
                },
            },
            create(context) {
                // The tracker's own home + siblings, the single canonical
                // wiring site, and the admin markdown test harness.
                const ALLOWED = [
                    '/utils/json/',
                    '/execution-system/thunks/process-stream.ts',
                    '/components/admin/MarkdownTester.tsx',
                ];
                const filename = context.filename || context.getFilename?.() || '';
                const isAllowed = ALLOWED.some((p) => filename.includes(p));
                return {
                    ImportDeclaration(node) {
                        if (isAllowed) return;
                        const src = node.source.value;
                        if (
                            typeof src === 'string' &&
                            src.includes('utils/json/streaming-json-tracker')
                        ) {
                            context.report({ node, messageId: 'banned' });
                        }
                    },
                };
            },
        },
        'no-parallel-kind-parser': {
            meta: {
                type: 'problem',
                docs: {
                    description:
                        'Disallow instantiating the content-ir kind parser / JSON tokenizer outside the canonical hosts. The parser must be reached through a ParseSession (one writer per stream identity) or normalizeJsonRegion (idempotent one-shot) — a parallel instance re-parses content another layer already parsed, which is exactly the duplicated-detector bug class content-ir exists to kill.',
                },
                schema: [],
                messages: {
                    banned:
                        'Do not import the kind parser / JSON tokenizer directly. Open a ContentRegion via @/features/content-ir/session/session-manager (streaming) or call normalizeJsonRegion from @/features/content-ir/core/normalize (one-shot, idempotent). The only hosts allowed to touch the parser are content-ir itself, stream-block-accumulator, content-splitter-v2, and normalize-content-blocks. See features/content-ir/FEATURE.md.',
                },
            },
            create(context) {
                const ALLOWED = [
                    '/features/content-ir/',
                    '/execution-system/utils/stream-block-accumulator.ts',
                    '/execution-system/utils/normalize-content-blocks.ts',
                    '/processors/utils/content-splitter-v2.ts',
                    '/components/admin/markdown-tester/',
                ];
                const filename = context.filename || context.getFilename?.() || '';
                const isAllowed = ALLOWED.some((p) => filename.includes(p));
                return {
                    ImportDeclaration(node) {
                        if (isAllowed) return;
                        // Type-only imports (KindStreamEvent etc.) are contract
                        // consumption, not a parallel parser — allowed.
                        if (node.importKind === 'type') return;
                        if (
                            node.specifiers.length > 0 &&
                            node.specifiers.every(
                                (s) => s.importKind === 'type',
                            )
                        ) {
                            return;
                        }
                        const src = node.source.value;
                        if (
                            typeof src === 'string' &&
                            (src.includes('content-ir/core/kind-parser') ||
                                src.includes('content-ir/core/json-tokenizer'))
                        ) {
                            context.report({ node, messageId: 'banned' });
                        }
                    },
                };
            },
        },
        'no-bespoke-stream-renderer': {
            meta: {
                type: 'problem',
                docs: {
                    description:
                        'Disallow consuming content-ir parse sessions (useLiveJsonRegion / openParseSession) outside content-ir itself. A surface that opens its own parse session has become a second renderer for streamed model output — the exact failure Arman banned on 2026-07-28: one bespoke renderer becomes ten thousand and the single canonical system dies. Streamed content renders through MarkdownStream -> EnhancedChatMarkdown -> BlockRenderer -> the kind registry, reached from Redux by requestId.',
                },
                schema: [],
                messages: {
                    banned:
                        "Bespoke stream rendering is banned. `useLiveJsonRegion` / `openParseSession` are INTERNAL to content-ir — not consumable primitives. Render streamed content through the canonical pipeline: give the run a requestId (launch via the execution system, or adopt a server-orchestrated stream with `adoptForeignStream` from @/features/agents/redux/execution-system/thunks/adopt-foreign-stream), then read it from Redux (`selectKindEnvelope`, `selectRenderBlocksInOrder`). See features/content-ir/FEATURE.md § No bespoke stream renderers.",
                },
            },
            create(context) {
                // content-ir owns the parser. The stream accumulator IS the
                // canonical pipeline this rule points people at, and the
                // json-block-detector demo is content-ir's own harness — both
                // are hosts, not violations.
                const ALLOWED = [
                    '/features/content-ir/',
                    '/execution-system/utils/stream-block-accumulator.ts',
                    '/demos/json-block-detector/',
                ];
                const filename = context.filename || context.getFilename?.() || '';
                if (ALLOWED.some((p) => filename.includes(p))) return {};
                const BANNED_NAMES = new Set([
                    'useLiveJsonRegion',
                    'openParseSession',
                ]);
                // Reaching the session manager AT ALL from outside the hosts is
                // the violation — a namespace import, a re-export, or an
                // `await import()` bypasses a name-only check entirely.
                const isSessionModule = (src) =>
                    typeof src === 'string' &&
                    (src.includes('content-ir/react/useLiveJsonRegion') ||
                        src.includes('content-ir/session'));
                return {
                    ImportDeclaration(node) {
                        if (node.importKind === 'type') return;
                        if (isSessionModule(node.source.value)) {
                            context.report({ node, messageId: 'banned' });
                            return;
                        }
                        for (const spec of node.specifiers) {
                            if (spec.importKind === 'type') continue;
                            const imported = spec.imported?.name;
                            if (imported && BANNED_NAMES.has(imported)) {
                                context.report({ node: spec, messageId: 'banned' });
                            }
                        }
                    },
                    ExportNamedDeclaration(node) {
                        if (node.source && isSessionModule(node.source.value)) {
                            context.report({ node, messageId: 'banned' });
                        }
                    },
                    ImportExpression(node) {
                        if (node.source && isSessionModule(node.source.value)) {
                            context.report({ node, messageId: 'banned' });
                        }
                    },
                };
            },
        },
        'no-raw-agent-list-query': {
            meta: {
                type: 'problem',
                docs: {
                    description:
                        'Disallow raw multi-row agent.definition queries outside the canonical agent listing services. A raw list query blends mine/shared/org/public/system into one meaningless alphabetical dump and ignores the scope model — the recurring disease Arman banned on 2026-08-08 (THE CANONICAL-SELECTION LAW, common-docs/systems/agent-slots/FEATURE.md). By-id fetches (.eq/.in on "id", .single(), .maybeSingle()) and writes are allowed.',
                },
                schema: [],
                messages: {
                    banned:
                        'Raw agent.definition LIST query. Any UI listing agents for selection must use the canonical agent listing system: the Redux agent-definition slice (fetchAgentsListFull / fetchAgentsList + purpose-fit selectors — selectBuiltinAgents for admin/system surfaces, selectActiveAgents for user pickers) or the scoped agx_list_scoped RPC family (features/agents/browse/service.ts). By-id lookups are fine — filter with .eq("id", …) / .in("id", […]) or end with .single()/.maybeSingle(). See common-docs/systems/agent-slots/FEATURE.md § The two selection laws.',
                },
            },
            create(context) {
                // The canonical listing services themselves (they wrap the
                // agx_* RPCs; their remaining raw reads are by-id or writes,
                // but keep them hosts so refactors inside them don't fight
                // the guard).
                const ALLOWED = [
                    '/features/agents/redux/agent-definition/',
                    '/features/agents/browse/service.ts',
                    // Admin model-maintenance sweeps (usage report + bulk
                    // reference replacement) — list-shaped reads scoped by a
                    // model reference, not agent pickers.
                    '/features/ai-models/service.ts',
                    '/features/ai-models/server/replace-model-references.ts',
                ];
                const filename = context.filename || context.getFilename?.() || '';
                if (ALLOWED.some((p) => filename.includes(p))) return {};
                // A chain is exempt when it is id-scoped (incl. the derived-
                // builtins by-source container), row-scoped, a count-only
                // head query, or a write.
                const EXEMPT_RE =
                    /\.(?:eq|in)\(\s*["'](?:id|source_agent_id)["']|\.single\(|\.maybeSingle\(|\.insert\(|\.update\(|\.upsert\(|\.delete\(|head:\s*true/;
                const AGENT_SCHEMA_RE = /\.schema\(\s*["']agent["']\s*\)/;
                return {
                    CallExpression(node) {
                        const callee = node.callee;
                        if (
                            callee.type !== 'MemberExpression' ||
                            callee.property.type !== 'Identifier' ||
                            callee.property.name !== 'from'
                        ) {
                            return;
                        }
                        const arg = node.arguments[0];
                        if (
                            !arg ||
                            arg.type !== 'Literal' ||
                            arg.value !== 'definition'
                        ) {
                            return;
                        }
                        // Walk to the top of the fluent chain so the text
                        // includes .schema("agent") below and .eq/.single
                        // above this .from call.
                        let top = node;
                        while (
                            top.parent &&
                            (top.parent.type === 'MemberExpression' ||
                                top.parent.type === 'CallExpression' ||
                                top.parent.type === 'AwaitExpression')
                        ) {
                            top = top.parent;
                        }
                        const text = context.sourceCode.getText(top);
                        if (!AGENT_SCHEMA_RE.test(text)) return;
                        if (EXEMPT_RE.test(text)) return;
                        context.report({ node, messageId: 'banned' });
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
        // THE DOOR LAW, narrowest slice (common-docs/policies/no-dead-ends.md,
        // CLAUDE.md § NO DEAD ENDS). The full detector is `pnpm check:dead-ends`
        // — it carries the fuzzy cases (unlinked names, unreachable counts,
        // surfaces with no door primitive at all) because those need whole-file
        // context this rule cannot see. What lives HERE is only the subset with
        // near-zero false positives: a raw identifier rendered as JSX TEXT with
        // no link/handler anywhere above it. A UUID in a cell is a dead end with
        // extra steps; the user cannot read it and cannot open it.
        'no-bare-id-text': {
            meta: {
                type: 'problem',
                docs: {
                    description:
                        'Disallow rendering a raw record identifier as JSX text with no way to open it. THE DOOR LAW: never show an id you cannot open — resolve it to a name plus a door (<EntityRef token=… id=… name=… />), or do not show it. Scoped tightly: only `{x.id}` / `{x.foo_id}` / `{fooId}` in TEXT position, with no Link/anchor/href/onClick ancestor; attributes, keys, pickers and headings are untouched.',
                },
                schema: [],
                messages: {
                    banned:
                        "Bare id rendered as text — a dead end with extra steps. Render <EntityRef token=\"<entity>\" id={…} name={…} /> from @/components/official/entity-ref/EntityRef (Open + new tab + peek, resolved from the registries), or use the table's cellKind: \"uuid\". Missing route? Add an hrefFor to the token in features/scopes/registry/entityRegistry.ts. See common-docs/policies/no-dead-ends.md and `pnpm check:dead-ends`.",
                },
            },
            create(context) {
                // Hosts: the door primitive itself renders the id fallback, and
                // the uuid cell IS the sanctioned way to show one.
                const ALLOWED = [
                    '/components/official/entity-ref/',
                    '/components/official/matrx-data-table/',
                    '/__tests__/',
                ];
                const filename = context.filename || context.getFilename?.() || '';
                if (ALLOWED.some((p) => filename.includes(p))) return {};

                const ID_NAME_RE = /^(id|uuid|.+_id|.+Id|.+Uuid|.+UUID)$/;
                const DOOR_TAGS = new Set([
                    'a',
                    'Link',
                    'NextLink',
                    'EntityRef',
                    'NavLink',
                ]);
                const DOOR_ATTRS = new Set([
                    'href',
                    'onClick',
                    'onDoubleClick',
                    'onSelect',
                    'onRowClick',
                    'to',
                ]);
                // Choosing, labelling and debugging are not referencing.
                const SKIP_TAGS = new Set([
                    'SelectItem',
                    'CommandItem',
                    'DropdownMenuItem',
                    'ContextMenuItem',
                    'MenuItem',
                    'option',
                    'Option',
                    'label',
                    'Label',
                    'TooltipContent',
                    'pre',
                    'code',
                ]);

                const tagOf = (el) => {
                    const n = el.name;
                    if (!n) return null;
                    if (n.type === 'JSXIdentifier') return n.name;
                    if (n.type === 'JSXMemberExpression') return n.property?.name ?? null;
                    return null;
                };

                /**
                 * The record's OWN surface printing its own id is not a dead
                 * end — you are already on it. Detected the way the file can
                 * see it: the enclosing function binds the id (or `<x>Id`) as a
                 * parameter, and is not a `.map()` row callback. Keeps the
                 * checker and this rule from disagreeing on a detail page.
                 */
                const isSelfSubject = (node, name) => {
                    const wanted = new Set([name, `${name}Id`, `${name}_id`]);
                    const binds = (pattern) => {
                        if (!pattern) return false;
                        if (pattern.type === 'Identifier') return wanted.has(pattern.name);
                        if (pattern.type === 'ObjectPattern') {
                            return pattern.properties.some((p) =>
                                binds(p.value ?? p.argument),
                            );
                        }
                        if (pattern.type === 'AssignmentPattern') return binds(pattern.left);
                        return false;
                    };
                    for (let cur = node; cur; cur = cur.parent) {
                        const isFn =
                            cur.type === 'ArrowFunctionExpression' ||
                            cur.type === 'FunctionExpression' ||
                            cur.type === 'FunctionDeclaration';
                        if (!isFn) continue;
                        const call = cur.parent;
                        const iterating =
                            call?.type === 'CallExpression' &&
                            call.callee?.type === 'MemberExpression' &&
                            /^(map|flatMap|forEach|filter)$/.test(
                                call.callee.property?.name ?? '',
                            );
                        if (iterating) return false;
                        return (cur.params ?? []).some(binds);
                    }
                    return false;
                };

                /** `row.agent.id` → `row`; `{agentId}` → null (no object). */
                const rootName = (expr) => {
                    let cur = expr;
                    for (let guard = 0; guard < 12 && cur; guard++) {
                        if (cur.type === 'MemberExpression') {
                            cur = cur.object;
                            continue;
                        }
                        if (cur.type === 'ChainExpression') {
                            cur = cur.expression;
                            continue;
                        }
                        break;
                    }
                    return cur && cur.type === 'Identifier' && cur !== expr ? cur.name : null;
                };

                /** `row.agent.id` → `id`; `{agentId}` → `agentId`. Anything
                 *  else (calls, templates, ternaries) is out of scope — this
                 *  rule only claims the unambiguous shapes. */
                const terminalName = (expr) => {
                    if (!expr) return null;
                    if (expr.type === 'Identifier') return expr.name;
                    if (expr.type === 'MemberExpression' && !expr.computed) {
                        return expr.property?.type === 'Identifier'
                            ? expr.property.name
                            : null;
                    }
                    if (expr.type === 'ChainExpression') return terminalName(expr.expression);
                    return null;
                };

                return {
                    JSXExpressionContainer(node) {
                        // Text position only. An attribute value's parent is a
                        // JSXAttribute, so `key={x.id}` never reaches here.
                        const parent = node.parent;
                        if (
                            !parent ||
                            (parent.type !== 'JSXElement' && parent.type !== 'JSXFragment')
                        ) {
                            return;
                        }
                        const name = terminalName(node.expression);
                        if (!name || !ID_NAME_RE.test(name)) return;
                        // The subject's OWN id only. A foreign key on the
                        // subject (`instance.agentId`) points at a DIFFERENT
                        // record and must still be reported — same rule the
                        // checker applies, minus the token registry.
                        const root = rootName(node.expression);
                        const subject = root ?? name.replace(/(_id|Id)$/, '');
                        const points = name.replace(/(_id|Id)$/, '').toLowerCase();
                        const ownIdentity =
                            name === 'id' ||
                            name === 'uuid' ||
                            root === null ||
                            points === '' ||
                            (root ?? '').toLowerCase().includes(points);
                        if (ownIdentity && isSelfSubject(node, subject)) return;

                        for (let cur = node.parent; cur; cur = cur.parent) {
                            if (cur.type !== 'JSXElement') continue;
                            const opening = cur.openingElement;
                            if (!opening) continue;
                            const tag = tagOf(opening);
                            if (tag && SKIP_TAGS.has(tag)) return;
                            if (tag && DOOR_TAGS.has(tag)) return;
                            for (const attr of opening.attributes || []) {
                                if (attr.type === 'JSXSpreadAttribute') return;
                                if (
                                    attr.type === 'JSXAttribute' &&
                                    attr.name?.type === 'JSXIdentifier' &&
                                    DOOR_ATTRS.has(attr.name.name)
                                ) {
                                    return;
                                }
                            }
                        }
                        context.report({ node, messageId: 'banned' });
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

// ─── Single audio system — lockdown (CLAUDE.md "File Handling"-style fence) ──
// Audio OUT must flow through the canonical path so the app-wide Audio panel
// can see/control/replay it: the unified `playbackQueue` (via
// `useAudioPlayback` / `useTtsSpeak`) or the registered streaming speaker
// (`<StreamingSpeakerButton>`). The streaming hook registers itself into the
// `audioSessionRegistry`; importing it directly elsewhere re-creates the
// invisible-audio bug this wave fixed. The bottom-of-file allowlist re-enables
// it for the canonical TTS surfaces + the app-root auto-voice singleton.
//
// NOTE (next wave): once cx-chat MessageOptionsMenu, the Scribe
// WorkingDocumentHeader, and AudioPlayerButton are migrated onto the queue,
// add `useCartesiaSpeaker` + `useTextToSpeech` here too.
const ttsHookDirectImportRestriction = {
    paths: [
        {
            name: '@/features/tts/hooks/useCartesiaStreamingSpeaker',
            message:
                'Do not import useCartesiaStreamingSpeaker directly — audio started this way is invisible to the app-wide Audio panel. Speak via <StreamingSpeakerButton> (registers a session) or enqueue through useAudioPlayback / useTtsSpeak. See features/audio/FEATURE.md "The one and only way in".',
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

// appContextSlice IS the global "active working context" (active org / scope
// selections / project / task / conversation). The load-bearing invariant
// (CLAUDE.md "Scopes and Context"; features/scopes/FEATURE.md "Global vs local
// context") is: ONLY Surface A components — under
// features/scopes/components/active-context/** — may WRITE it. Every other
// surface that wants to "tag X with a scope" persists a DURABLE association
// (platform.associations via the association primitive, or ctx_scope_assignments);
// it must never dispatch setOrganization / setScopeSelections / addActiveScope /
// removeActiveScope / setProject / setTask / setConversation / setFullContext /
// clearContext. A picker that
// silently changes the sidebar's active context is the #1 bug this kills.
//
// Modeled on the scopesService chokepoint above: the selector bans IMPORTING the
// write action creators from the slice; the active-context allowlist override at
// the bottom of the file re-enables them for Surface A. A legitimate Surface-A
// writer that lives OUTSIDE active-context/** (e.g. the canonical
// useHierarchyReduxBridge, the logout-reset watcher) must carry an explicit
// `// eslint-disable-next-line no-restricted-syntax` WITH a one-line justification,
// so every exception is visible and reviewed. The selector reports on the whole
// ImportDeclaration, so the disable comment goes directly above the `import` line.
const appContextWriteSyntaxRestrictions = [
    {
        selector:
            "ImportDeclaration[source.value='@/lib/redux/slices/appContextSlice']:has(ImportSpecifier[imported.name=/^(setOrganization|setScopeSelections|addActiveScope|removeActiveScope|setActiveScopeTypes|setProject|setTask|setConversation|setFullContext|clearContext)$/])",
        message:
            "appContextSlice write actions (setOrganization / setScopeSelections / addActiveScope / removeActiveScope / setActiveScopeTypes / setProject / setTask / setConversation / setFullContext / clearContext) may be imported ONLY by Surface A components under features/scopes/components/active-context/**. Global active context is written by Surface A alone; every other surface must persist a DURABLE association (platform.associations via the association primitive, or ctx_scope_assignments) instead of mutating the sidebar's working context. If this IS a legitimate Surface-A active-context write, add `// eslint-disable-next-line no-restricted-syntax` directly above this import with a one-line justification. See CLAUDE.md 'Scopes and Context' + features/scopes/FEATURE.md 'Global vs local context'.",
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
// content-ir chokepoints — the __kind discriminator and the kind-schema
// storage category ids belong to features/content-ir alone. A hand-rolled
// "__kind" literal outside the library is a parallel discriminator reader
// (use KIND_KEY / the library APIs); the category-id literals outside
// registry/schema-source-flexible-data.ts are a parallel schema store.
// features/content-ir/** re-declares the rule WITHOUT these (see override).
const contentIrChokepointSyntaxRestrictions = [
    {
        selector: "Literal[value='__kind']",
        message:
            'The "__kind" discriminator literal is banned outside features/content-ir. Import KIND_KEY from @/features/content-ir/core/kind-schema.types — or better, consume the parsed envelope (metadata.__ir via readEnvelope) instead of re-reading the discriminator by hand. See features/content-ir/FEATURE.md.',
    },
    {
        selector: "Literal[value='671a423f-d350-4457-83e5-389eac70f287']",
        message:
            'The Block Schemas category id belongs ONLY to features/content-ir/registry/schema-source-flexible-data.ts (import BLOCK_SCHEMAS_CATEGORY_ID from there). Reading kind schemas anywhere else creates a parallel schema store.',
    },
    {
        selector: "Literal[value='6f46917c-be9a-4763-b4dd-107546a3d282']",
        message:
            'The Sample Block Data category id belongs ONLY to features/content-ir/registry/schema-source-flexible-data.ts (import SAMPLE_BLOCK_DATA_CATEGORY_ID from there).',
    },
];

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

// File bytes must flow through @/features/files. Reject the characteristic
// direct object-store call shapes without naming or depending on a retired
// provider-specific API.
const directObjectStoreSyntaxRestrictions = [
    {
        selector:
            "CallExpression[callee.object.object.property.name='storage'][callee.object.property.name='from']",
        message:
            'Direct object-store clients are banned. Use the universal file handler (@/features/files).',
    },
    {
        selector:
            "CallExpression[callee.property.name=/^(getPublicUrl|createSignedUrl)$/]",
        message:
            'Direct object-store URL creation is banned. Use the universal file handler (@/features/files).',
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

// ─── storage_uri eradication (2026-07-06) ────────────────────────────────────
// The native S3 location (`storage_uri` = s3://bucket/owner/key, historically
// also `file_uri` / `fileUri` / `storageUri` / `canonicalFileUri`) is
// SERVER-ONLY. The backend returns it on NO response, and the DB REVOKEs the
// column grant on files.files — `select("*")` on that table ERRORS for
// `authenticated`. This identifier family re-infected the codebase twice via
// leftover references that coding agents copied; this ban makes reintroduction
// structurally impossible. Identify files by `id`/`file_id`; render/download
// via the URL contract (url / cdn_url / signed_url / download_url /
// thumbnail_url). Read files.files ONLY through FILES_TABLE_COLUMNS
// (features/files/filesDb.ts). The SOLE sanctioned exceptions are the
// `Omit<..., "storage_uri">` read-row types in features/files/types.ts, which
// carry inline eslint-disables with justification. See
// features/files/FEATURE.md "storage_uri is BANNED".
const storageUriEradicationBan = [
    {
        selector:
            'Identifier[name=/^(storageUri|storage_uri|fileUri|file_uri|canonicalFileUri|canonical_file_uri)$/]',
        message:
            'storage_uri / file_uri (the native S3 location) is SERVER-ONLY and has been ERADICATED from the FE (2026-07-06). It exists on no backend response and its files.files column grant is REVOKEd. Identify by id/file_id; use the URL contract (url/cdn_url/signed_url/download_url). See features/files/FEATURE.md.',
    },
    {
        selector:
            'Literal[value=/\\b(storage_uri|file_uri|canonical_file_uri)\\b/]',
        message:
            'String contains storage_uri/file_uri — the server-only S3 location, ERADICATED from the FE (2026-07-06). Never select it (use FILES_TABLE_COLUMNS from features/files/filesDb.ts), never read/write it as a key. See features/files/FEATURE.md.',
    },
    {
        // Template literals are neither Identifier nor Literal, so the two selectors
        // above missed every backtick SQL string — lib/integrity/checks.ts carried three
        // live `storage_uri` references that reported ZERO violations (found 2026-07-18,
        // D63). Same shape as toolResultsChokepointSyntaxRestrictions.
        selector:
            'TemplateElement[value.raw=/\\b(storage_uri|file_uri|canonical_file_uri)\\b/]',
        message:
            'Template literal contains storage_uri/file_uri — the server-only S3 location, ERADICATED from the FE (2026-07-06). Never select it (use FILES_TABLE_COLUMNS from features/files/filesDb.ts), never read/write it as a key. See features/files/FEATURE.md.',
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

// React Flow (@xyflow/react / reactflow) is a heavy, browser-only graph-canvas
// engine. Every consumer surface has exactly ONE next/dynamic({ ssr: false })
// front-door gate; React Flow is imported statically ONLY inside a gated graph
// (each such file carries a justified one-line eslint-disable). The gated
// surfaces (D70 sweep, 2026-07-28):
//   - Agent Set builder: SetBuilderCanvas wrapper → agent-sets/components/SetBuilderCanvasImpl.tsx
//   - RAG visualization: features/rag/components/visualization/{RagFlowVisualization,IngestFlowAnimation}.tsx
//     wrappers → *Impl + nodes/ + edges/
//   - Schema visualizer: features/administration/schema-visualizer/index.tsx wrapper
//     → SchemaVisualizerImpl.tsx + SchemaNode.tsx + utils.ts
//   - Diagram block: components/mardown-display/blocks/diagram/{InteractiveDiagramBlock,layout-utils}
//     (every consumer loads it via React.lazy/next/dynamic)
//   - Pillar map: features/marketing/content-plan/components/PillarMap.tsx
//     (gated by ContentPlanWorkbench's next/dynamic)
// A static value import anywhere else drags the whole flow runtime into that
// route/server chunk: the exact build-time-leak class that ballooned the build
// 15→24min for the context menu. `import type {...}` and dynamic `import()`
// are unaffected.
const reactFlowStaticImportBan = [
    {
        selector:
            "ImportDeclaration[importKind!='type'][source.value=/^(@xyflow\\/react|reactflow)$/]",
        message:
            "Do not statically import React Flow (@xyflow/react / reactflow) — it's a heavy browser-only canvas. Keep it inside one of the gated surfaces (SetBuilderCanvasImpl, rag visualization Impls, schema-visualizer Impl, InteractiveDiagramBlock, PillarMap — see the comment above reactFlowStaticImportBan), each behind ONE next/dynamic({ ssr: false }) front door. If this file is inside such a gate, add `// eslint-disable-next-line no-restricted-syntax` directly above the import with a one-line justification. `import type {...}` and dynamic import() are fine. See the code-splitting skill.",
    },
];

// Audio system entry modules (2026-07 audio consolidation): the ENTIRE audio
// system mounts lazily via providers/AudioSystemHost.tsx → AudioSystemHostImpl
// on first user engagement. That only holds if the heavy entry modules never
// re-enter an always-loaded graph via a static value import. Each has exactly
// ONE legal importer, which carries a justified inline disable:
//   - useChunkedRecordAndTranscribe (971L recorder → micStream, speechApi,
//     audioSafetyStore, chunk journal, file handler) → GlobalRecordingEngine
//   - useCartesiaStreamingSpeaker (843L + @cartesia/cartesia-js SDK) →
//     useAutoVoiceResponse
//   - useAutoVoiceResponse (drags the speaker + agents execution selectors) →
//     providers/AudioOutputHostImpl
// Everything else uses useGlobalRecording()/useVoiceCapture (recording),
// voicePlaybackBus (read-aloud), or enqueuePlayback (TTS queue) — all light,
// all activation-latch-wired. `import type` and dynamic import() are fine.
const audioSystemStaticImportBan = [
    {
        selector:
            "ImportDeclaration[importKind!='type'][source.value=/^@\\/features\\/audio\\/hooks\\/useChunkedRecordAndTranscribe$/]",
        message:
            "Do not statically import useChunkedRecordAndTranscribe — it drags the whole recording graph (micStream, speechApi, audioSafetyStore, chunk journal, file handler) into this chunk and creates a second recorder outside the global engine. Record via useGlobalRecording()/useVoiceCapture (state from recordingsSlice, verbs from recordingCommands — the engine mounts on demand). Only providers/GlobalRecordingEngine.tsx may import this, with a justified inline disable. `import type {...}` is fine. See the code-splitting skill + providers/AudioSystemHost.tsx.",
    },
    {
        selector:
            "ImportDeclaration[importKind!='type'][source.value=/^@\\/features\\/tts\\/hooks\\/useCartesiaStreamingSpeaker$/]",
        message:
            "Do not statically import useCartesiaStreamingSpeaker — it drags the @cartesia/cartesia-js SDK into this chunk. Read-aloud goes through voicePlaybackBus (requestVoicePlayback / stopVoicePlayback); queued TTS goes through enqueuePlayback. Only features/transcript-studio/hooks/useAutoVoiceResponse.ts may import it, with a justified inline disable. `import type {...}` is fine. See providers/AudioSystemHost.tsx.",
    },
    {
        selector:
            "ImportDeclaration[importKind!='type'][source.value=/^@\\/features\\/transcript-studio\\/hooks\\/useAutoVoiceResponse$/]",
        message:
            "Do not statically import useAutoVoiceResponse — it owns the Cartesia streaming speaker and must live ONLY inside the lazy audio system. Drive read-aloud via voicePlaybackBus instead. Only providers/AudioOutputHostImpl.tsx may import it, with a justified inline disable. `import type {...}` is fine. See providers/AudioSystemHost.tsx.",
    },
];

// Camera getUserMedia chokepoint (docs/media-capture-plan.md §5 invariant 1,
// the camera twin of the micStream rule): the ONE legal `getUserMedia({video})`
// call site is features/media-capture/runtime/camera-stream-manager.ts —
// ref-counted leases, compatibility/pinning policy, immediate last-release
// shutdown, permission reporting to the device manager. A second call site
// recreates every prompt/leak/wrong-spec bug the manager exists to kill.
// Audio-only `getUserMedia({audio})` is unaffected (micStream owns that).
// Matches a `video` property in the direct constraints argument.
const cameraGetUserMediaChokepointBan = [
    {
        selector:
            "CallExpression[callee.property.name='getUserMedia'] > ObjectExpression > Property[key.name='video']",
        message:
            'getUserMedia({video}) is banned outside the camera stream manager — acquire the camera via acquireCameraLease() from features/media-capture/runtime/camera-stream-manager.ts (the ONE legal call site: leases, compatibility policy, recording pin, last-release shutdown). If this IS the manager (or a legacy file slated for Phase 5 deletion), add `// eslint-disable-next-line no-restricted-syntax` with a one-line justification. See features/media-capture/FEATURE.md.',
    },
    {
        // Same ban for destructured/aliased calls: `const { getUserMedia } =
        // navigator.mediaDevices; getUserMedia({ video })` would dodge the
        // member-expression selector above.
        selector:
            "CallExpression[callee.name='getUserMedia'] > ObjectExpression > Property[key.name='video']",
        message:
            'getUserMedia({video}) is banned outside the camera stream manager (destructured form) — acquire the camera via acquireCameraLease() from features/media-capture/runtime/camera-stream-manager.ts. See features/media-capture/FEATURE.md.',
    },
];

// THE NAMING LAW (surfaces): a surface has ONE canonical display label — the
// manifest's `label`, derived everywhere via getSurfaceDisplayLabel(). The old
// free-text `surfaceLabel` prop let every page invent its own name ("Page" vs
// "Marketing Page Workspace") and was deleted 2026-07-24. This ban keeps it dead.
const surfaceLabelOverrideBan = [
    {
        selector: "JSXAttribute[name.name='surfaceLabel']",
        message:
            'The surfaceLabel prop is prohibited — surface display names are canonical. Derive the label with getSurfaceDisplayLabel(surfaceName) from @/features/surfaces/utils/surface-display (manifest-owned). See features/surfaces/FEATURE.md "THE NAMING LAW".',
    },
];

export default [
    // Generated Next build output — NEVER lint it. `.next`, plus every
    // `NEXT_DISTDIR` variant a parallel dev server invents (`.next-preview`,
    // `.next-preview-cutoverqa`, …). These dirs hold machine-written type
    // validators that are routinely half-written by a killed dev server, and a
    // parse error in one of them derails the whole run. Flat config does NOT
    // read .gitignore, so this glob is the only thing keeping them out.
    // The twin of the `.next*` excludes in tsconfig.json / tsconfig.typecheck.json.
    { ignores: ['.next*/**'] },
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
            // Single-path JSON extraction — no parallel raw-stream scanners.
            // Loud but non-blocking, matching the other doctrine bans here.
            'matrx/no-parallel-stream-json-scan': 'warn',
            // Single canonical structured-content parser — no parallel instances.
            'matrx/no-parallel-kind-parser': 'warn',
            // ONE renderer for streamed model output. Error, not warn: this is
            // the ban Arman issued in anger, and the gap that forced the one
            // violation is now closed by `adoptForeignStream`.
            'matrx/no-bespoke-stream-renderer': 'error',
            // THE CANONICAL-SELECTION LAW (Arman, 2026-08-08): agent lists for
            // selection come from the agent-definition slice or agx_list_scoped
            // — never a raw agent.definition list query. Error, not warn.
            'matrx/no-raw-agent-list-query': 'error',
            // THE DOOR LAW (Arman, 2026-08-08): never render an id you can't
            // open. 'warn' because the tree still carries a long tail — the
            // scoreboard at /administration/reporting/dead-ends tracks it down
            // to zero, and this ratchets to 'error' when it gets there.
            'matrx/no-bare-id-text': 'warn',
            'react-hooks/exhaustive-deps': 'off',
            '@next/next/no-img-element': 'off',
            'react/no-unescaped-entities': 'off',
            'import/no-anonymous-default-export': 'off',
            'no-restricted-imports': [
                'error',
                {
                    patterns: [
                        ...windowPanelsImportRestriction.patterns,
                        // The json-block-detector demo is a CONSUMER of
                        // @/features/content-ir, never a source — importing
                        // from the demo resurrects the pre-extraction world.
                        {
                            group: ['**/json-block-detector/*'],
                            message:
                                'The json-block-detector demo is a consumer of @/features/content-ir, not a source. Import the library, not the demo.',
                        },
                    ],
                    paths: [
                        ...deletedFileHooksRestriction.paths,
                        ...parallelSliceRestriction.paths,
                        ...ttsHookDirectImportRestriction.paths,
                        // Error-capture chokepoint: `toast` from bare "sonner" is
                        // INVISIBLE to the admin Error Inspector. The captured
                        // wrapper at @/lib/toast is a drop-in replacement (only
                        // lib/toast.ts itself may import sonner's toast; the
                        // <Toaster> mount import stays legal). Swept 2026-07-20.
                        {
                            name: 'sonner',
                            importNames: ['toast'],
                            message:
                                'Import { toast } from "@/lib/toast", not "sonner" — bare sonner toasts bypass Error Inspector capture. See lib/toast.ts.',
                        },
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
                // Twin of the sonner `paths` ban above — several override blocks
                // below turn `no-restricted-imports` fully off (redux dirs, tests,
                // tts, window-panels windows, …); this selector keeps the
                // error-capture chokepoint enforced there too.
                {
                    selector:
                        "ImportDeclaration[source.value='sonner'] ImportSpecifier[imported.name='toast']",
                    message:
                        'Import { toast } from "@/lib/toast", not "sonner" — bare sonner toasts bypass Error Inspector capture. See lib/toast.ts.',
                },
                // …and the dynamic-import escape hatch (`await import("sonner")`),
                // which the static import rules cannot see. 13 such call sites
                // were swept 2026-07-20.
                {
                    selector: "ImportExpression[source.value='sonner']",
                    message:
                        'Dynamic import("sonner") bypasses Error Inspector capture — use import("@/lib/toast") instead. See lib/toast.ts.',
                },
                // Legacy Supabase API key env vars are hard-banned — no exceptions.
                ...legacySupabaseKeyBan,
                ...storageUriEradicationBan,
                ...directObjectStoreSyntaxRestrictions,
                // File-handler rules retain their original "warn-like" intent by
                // virtue of having actionable messages; eslint severity is shared
                // across the array, so we keep them in the same rule slot.
                // features/scopes chokepoint — only scopesService.ts may touch ctx_* tables.
                ...scopesChokepointSyntaxRestrictions,
                // appContextSlice writes — only Surface A (active-context/**) may import the write actions.
                ...appContextWriteSyntaxRestrictions,
                // features/agents tool-results chokepoint — only submit-tool-results.ts may POST /tool_results.
                ...toolResultsChokepointSyntaxRestrictions,
                // content-ir chokepoints — __kind literal + kind-schema category ids.
                ...contentIrChokepointSyntaxRestrictions,
                // Canonical context menu must be loaded via next/dynamic({ ssr: false }),
                // never a static value import (it balloons the route chunk).
                // v3 menu: MenuContent (heavy) must stay behind the shell's dynamic boundary.
                ...contextMenuV3StaticImportBan,
                // Heavy "*Impl" cores must be reached via their dynamic wrapper, never imported statically.
                ...heavyImplStaticImportBan,
                // React Flow is a heavy browser-only canvas — only the Agent Set builder Impl may import it.
                ...reactFlowStaticImportBan,
                ...audioSystemStaticImportBan,
                // getUserMedia({video}) only inside the camera stream manager.
                ...cameraGetUserMediaChokepointBan,
                ...surfaceLabelOverrideBan,
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
                ...storageUriEradicationBan,
                ...directObjectStoreSyntaxRestrictions,
                ...scopesChokepointSyntaxRestrictions,
                ...appContextWriteSyntaxRestrictions,
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
            // The files feature owns cloud-files internals — the global
            // `no-restricted-imports` bans (deleted file hooks, internal
            // subdirs, the barrel) are all about OUTSIDE consumers reaching
            // into features/files; inside the feature they'd flag the
            // canonical modules themselves (e.g. the index.ts barrel
            // re-exporting its own internals). Turn the import bans off here,
            // matching the redux/tts allowlists below.
            'no-restricted-imports': 'off',
            // It still must NOT use legacy Supabase API key
            // env vars, nor write the global active context (Surface A only).
            'no-restricted-syntax': [
                'error',
                ...legacySupabaseKeyBan,
                ...storageUriEradicationBan,
                ...directObjectStoreSyntaxRestrictions,
                ...appContextWriteSyntaxRestrictions,
                ...cameraGetUserMediaChokepointBan,
                ...surfaceLabelOverrideBan,
            ],
        },
    },
    {
        // Media durability fence (see CLAUDE.md "Media durability" +
        // FOUND_DEFECTS.md D1). Podcast surfaces render OUR OWN media (covers,
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
                ...storageUriEradicationBan,
                ...directObjectStoreSyntaxRestrictions,
                ...scopesChokepointSyntaxRestrictions,
                ...appContextWriteSyntaxRestrictions,
                ...toolResultsChokepointSyntaxRestrictions,
                ...cameraGetUserMediaChokepointBan,
                ...surfaceLabelOverrideBan,
                {
                    selector: "JSXOpeningElement[name.name='img']",
                    message:
                        "Raw <img> is banned in features/podcasts — render via <InlineMediaRef> from @/features/files so the media URL stays durable and self-heals. A raw <img> silently rots when a signed S3 URL expires. See CLAUDE.md \"Media durability\" / FOUND_DEFECTS.md D1.",
                },
                {
                    selector: "JSXOpeningElement[name.name='video']",
                    message:
                        "Raw <video> is banned in features/podcasts — render via <InlineMediaRef as=\"video\"> from @/features/files (it supports ambient autoPlay/loop/muted/playsInline/preload). A raw <video> silently rots when a signed S3 URL expires. See CLAUDE.md \"Media durability\" / FOUND_DEFECTS.md D1.",
                },
            ],
        },
    },
    {
        // Media durability fence #2 — agent-app / applet display surfaces
        // (FOUND_DEFECTS.md D1 residual, closed 2026-07-07). These render OUR
        // OWN media columns (custom_app_configs.image_url / aga_apps
        // preview media) — all appImageUrl / applet.imageUrl renders were
        // migrated to <InlineMediaRef>, so a raw <img>/<video> here is a
        // regression. Re-lists the global syntax bans because flat-config
        // replaces (not merges) the rule per file.
        files: ['features/applet/home/**/*.{ts,tsx}'],
        rules: {
            'no-restricted-syntax': [
                'error',
                ...legacySupabaseKeyBan,
                ...storageUriEradicationBan,
                ...directObjectStoreSyntaxRestrictions,
                ...scopesChokepointSyntaxRestrictions,
                ...appContextWriteSyntaxRestrictions,
                ...toolResultsChokepointSyntaxRestrictions,
                ...contentIrChokepointSyntaxRestrictions,
                ...contextMenuV3StaticImportBan,
                ...heavyImplStaticImportBan,
                ...reactFlowStaticImportBan,
                ...audioSystemStaticImportBan,
                {
                    selector: "JSXOpeningElement[name.name='img']",
                    message:
                        "Raw <img> is banned in features/applet/home — render via <InlineMediaRef> from @/features/files so the media URL stays durable and self-heals. A raw <img> silently rots when a signed S3 URL expires. See CLAUDE.md \"Media durability\" / FOUND_DEFECTS.md D1.",
                },
                {
                    selector: "JSXOpeningElement[name.name='video']",
                    message:
                        "Raw <video> is banned in features/applet/home — render via <InlineMediaRef as=\"video\"> from @/features/files (it supports ambient autoPlay/loop/muted/playsInline/preload). A raw <video> silently rots when a signed S3 URL expires. See CLAUDE.md \"Media durability\" / FOUND_DEFECTS.md D1.",
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
        // The captured toast wrapper is the ONE sanctioned importer of
        // sonner's `toast` (it wraps error/warning with captureError).
        // Both halves of the sonner ban must stand down here.
        files: ['lib/toast.ts'],
        rules: {
            'no-restricted-imports': 'off',
            'no-restricted-syntax': 'off',
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
            // Flat config REPLACES (not merges) the rule per file, so this
            // override re-lists every global syntax ban alongside the
            // spread ban — at 'error', matching the global slot. A plain
            // ['warn', {JSXSpreadAttribute}] here silently stripped ALL the
            // global chokepoints from this file (D68).
            'no-restricted-syntax': [
                'error',
                ...legacySupabaseKeyBan,
                ...storageUriEradicationBan,
                ...directObjectStoreSyntaxRestrictions,
                ...scopesChokepointSyntaxRestrictions,
                ...appContextWriteSyntaxRestrictions,
                ...toolResultsChokepointSyntaxRestrictions,
                ...contentIrChokepointSyntaxRestrictions,
                ...contextMenuV3StaticImportBan,
                ...heavyImplStaticImportBan,
                ...reactFlowStaticImportBan,
                ...audioSystemStaticImportBan,
                ...cameraGetUserMediaChokepointBan,
                ...surfaceLabelOverrideBan,
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
        // The /files route shells co-locate with the Files feature and use
        // server-only utils (server-cookies, server-search-params). The
        // internal-subdir bans do not apply here. See docs/SWEEP_INTERNAL_IMPORTS.md.
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
            'features/agent-context/service/hierarchyService.ts',
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
                ...storageUriEradicationBan,
                ...directObjectStoreSyntaxRestrictions,
                // scopesChokepointSyntaxRestrictions intentionally omitted.
                ...toolResultsChokepointSyntaxRestrictions,
                ...appContextWriteSyntaxRestrictions,
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
                ...storageUriEradicationBan,
                ...directObjectStoreSyntaxRestrictions,
                ...scopesChokepointSyntaxRestrictions,
                ...appContextWriteSyntaxRestrictions,
                // toolResultsChokepointSyntaxRestrictions intentionally omitted.
            ],
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
    // ─── Single audio system — canonical TTS allowlist ────────────────────
    // ttsHookDirectImportRestriction bans importing the streaming speaker hook
    // everywhere. Re-enable it for the ONLY sanctioned importers: the TTS
    // components feature (the <StreamingSpeakerButton> live half) and the
    // app-root auto-voice singleton. Everything else must speak through
    // <StreamingSpeakerButton> or the playback queue. (Mirrors the file-handler
    // allowlist for features/files/**.)
    {
        files: [
            'features/tts/**/*.{ts,tsx}',
            'features/transcript-studio/hooks/useAutoVoiceResponse.ts',
        ],
        rules: {
            'no-restricted-imports': 'off',
        },
    },
    // ─── appContextSlice (Surface A) write-action allowlist ────────────
    //
    // appContextWriteSyntaxRestrictions bans IMPORTING the appContextSlice write
    // action creators everywhere. This override re-enables them for the ONLY
    // sanctioned writers: Surface A components under
    // features/scopes/components/active-context/**, plus the slice's own file.
    // It re-lists every OTHER global syntax ban (flat-config replaces, not
    // merges, the rule per file) and omits ONLY the appContext one — exactly the
    // shape of the scopes-chokepoint allowlist above.
    //
    // Adding any other path here is a Doctrine violation: a non-Surface-A writer
    // must instead carry a justified `// eslint-disable-next-line
    // no-restricted-syntax`, or (the correct fix) persist a durable association.
    // Placed LAST so no later config object can override its no-restricted-syntax.
    {
        files: [
            'features/scopes/components/active-context/**/*',
            'lib/redux/slices/appContextSlice.ts',
        ],
        rules: {
            'no-restricted-syntax': [
                'error',
                ...legacySupabaseKeyBan,
                ...storageUriEradicationBan,
                ...directObjectStoreSyntaxRestrictions,
                ...scopesChokepointSyntaxRestrictions,
                ...toolResultsChokepointSyntaxRestrictions,
                ...contextMenuV3StaticImportBan,
                ...heavyImplStaticImportBan,
                // appContextWriteSyntaxRestrictions intentionally omitted — these
                // ARE the Surface A writers permitted to set global active context.
            ],
        },
    },
    // ─── TypeScript anti-cheat / anti-laziness trio (TYPESCRIPT_STANDARDS.md §3) ──
    //
    // The three escape hatches agents reach for most to silence the compiler
    // without modeling the type. All at `warn` so they surface INLINE in-editor
    // (agents are highly responsive to a squiggle in front of them) without
    // failing builds — the codebase has a large legacy tail (≈1.5k `any`,
    // ts-comments, non-null assertions) being ground down in waves. New code
    // should treat each as a hard stop. GROWTH of these counts is gated
    // separately by the baseline ratchet (`pnpm check:hatches`).
    //
    // Scoped to TS files because the `@typescript-eslint` plugin (registered by
    // eslint-config-next) only applies under the TS parser — referencing these
    // rules on a plain .js file would throw "rule not found".
    //
    // `as`-casts (`consistent-type-assertions`) and the type-aware `no-unsafe-*`
    // family from the standards doc are deliberately NOT here yet: the former is
    // too noisy to land cold and the latter needs full type-info linting (slow).
    // `as any` / `as unknown as` legitimacy is contextual (the DB-guard pattern),
    // so those live in the count ratchet, not a blunt lint rule.
    {
        files: ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts'],
        rules: {
            '@typescript-eslint/no-explicit-any': 'warn',
            '@typescript-eslint/no-non-null-assertion': 'warn',
            '@typescript-eslint/ban-ts-comment': [
                'warn',
                {
                    'ts-expect-error': 'allow-with-description',
                    'ts-ignore': true,
                    'ts-nocheck': true,
                    'ts-check': false,
                    minimumDescriptionLength: 4,
                },
            ],
        },
    },
    // ─── content-ir doctrine (features/content-ir/FEATURE.md) ──────────────
    //
    // 1) The library itself is exempt from the __kind / category-id literal
    //    bans (it DEFINES them) — flat config replaces the rule wholesale, so
    //    the global list is re-included minus contentIrChokepointSyntaxRestrictions.
    // 2) core/ is a PURE parsing kernel: no React, no Redux, no Supabase, no
    //    app state. Everything impure lives in registry/session/react/redux
    //    layers. This fence is what keeps the parser testable everywhere and
    //    portable (the Python twin mirrors core/ only).
    {
        files: ['features/content-ir/**/*.{ts,tsx}'],
        rules: {
            'no-restricted-syntax': [
                'error',
                ...legacySupabaseKeyBan,
                ...storageUriEradicationBan,
                ...directObjectStoreSyntaxRestrictions,
                ...scopesChokepointSyntaxRestrictions,
                ...appContextWriteSyntaxRestrictions,
                ...toolResultsChokepointSyntaxRestrictions,
                ...contextMenuV3StaticImportBan,
                ...heavyImplStaticImportBan,
                ...reactFlowStaticImportBan,
                ...audioSystemStaticImportBan,
            ],
        },
    },
    {
        files: ['features/content-ir/core/**/*.ts'],
        rules: {
            'no-restricted-imports': [
                'error',
                {
                    patterns: [
                        {
                            group: [
                                'react',
                                'react-dom',
                                'react-dom/*',
                                '@reduxjs/toolkit',
                                '@reduxjs/toolkit/*',
                                'react-redux',
                                '@/lib/redux/*',
                                '@/utils/supabase/*',
                                '@supabase/*',
                            ],
                            message:
                                'features/content-ir/core is a PURE parsing kernel — no React, Redux, or Supabase. IO belongs in registry/, React bindings in react/, store glue in redux/. See features/content-ir/FEATURE.md.',
                        },
                    ],
                },
            ],
        },
    },
    {
        // Generated type files mirror the DB / OpenAPI verbatim — the live
        // files.files table still HAS a storage_uri column (server-only), so
        // the generated Database type legitimately declares it. The
        // storage_uri eradication ban applies to hand-written code only;
        // never edit these files by hand (regenerate via pnpm db-types /
        // sync-types).
        files: ['types/database.types.ts', 'types/python-generated/**/*'],
        rules: {
            'no-restricted-syntax': 'off',
        },
    },
    {
        // The data-integrity check registry FILTERS on storage_uri inside server-side
        // SQL (`where storage_uri like 'unrecoverable://%'`) — it never SELECTs the
        // column into a client payload. Those queries run through execute_admin_query
        // (SECURITY DEFINER), so the authenticated-role revoke does not apply. The
        // template-literal selector added 2026-07-18 (D63) newly sees these, so the
        // exemption is made explicit here rather than by weakening the selector.
        // Flat config replaces the rule wholesale — every other global ban is
        // re-listed so this file keeps them.
        files: ['lib/integrity/checks.ts'],
        rules: {
            'no-restricted-syntax': [
                'error',
                ...legacySupabaseKeyBan,
                ...scopesChokepointSyntaxRestrictions,
                ...appContextWriteSyntaxRestrictions,
                ...toolResultsChokepointSyntaxRestrictions,
                ...contentIrChokepointSyntaxRestrictions,
                ...contextMenuV3StaticImportBan,
                ...heavyImplStaticImportBan,
                ...reactFlowStaticImportBan,
                ...audioSystemStaticImportBan,
            ],
        },
    },
];
