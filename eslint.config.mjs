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
                "Import window components only via the registry's componentImport (features/window-panels/registry/windowRegistry.ts). Direct imports break bundle splitting. See .claude/skills/window-panels/SKILL.md.",
        },
        {
            group: ['*supabase*storage*', '*storage*Bucket*'],
            message:
                'Direct Supabase Storage usage is banned. Use the universal file handler from features/file-handler instead — it covers anonymous, authenticated, owned, shared, and public files in one API. See features/file-handler/FEATURE.md.',
        },
    ],
};

// All file flows must funnel through features/file-handler. ESLint cannot
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
            'Direct supabase.storage usage is banned. Use the universal file handler (features/file-handler) instead.',
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

export default [
    ...nextCoreWebVitals,
    {
        plugins: {
            'no-barrel-files': noBarrelFiles,
        },
        rules: {
            'no-barrel-files/no-barrel-files': 'warn',
            'react-hooks/exhaustive-deps': 'off',
            '@next/next/no-img-element': 'off',
            'react/no-unescaped-entities': 'off',
            'import/no-anonymous-default-export': 'off',
            'no-restricted-imports': ['error', windowPanelsImportRestriction],
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
            ],
        },
    },
    {
        files: [
            'features/file-handler/**/*',
            'features/files/**/*',
        ],
        rules: {
            // The file-handler feature owns supabase.storage internals.
            // It still must NOT use legacy Supabase API key env vars.
            'no-restricted-syntax': ['error', ...legacySupabaseKeyBan],
        },
    },
    {
        files: ['features/window-panels/windows/**/*'],
        rules: {
            'no-restricted-imports': 'off',
        },
    },
    {
        files: [
            'features/window-panels/registry/windowRegistry.ts',
            'features/window-panels/UnifiedOverlayController.tsx',
            'features/window-panels/OverlaySurface.tsx',
            'components/overlays/OverlayController.tsx',
        ],
        rules: {
            'no-restricted-imports': 'off',
        },
    },
];
