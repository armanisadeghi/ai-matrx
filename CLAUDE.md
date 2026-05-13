---
description: 
alwaysApply: true
---

# CLAUDE.md — AI Matrx Admin

Large-scale Next.js no-code AI app builder and admin dashboard. Desktop-first, mobile-responsive. Redux for state management, Supabase for database.

> **Official Next.js/React/TypeScript best practices:** `~/.arman/rules/nextjs-best-practices/nextjs-guide.md`
> That guide is the single source of truth for rendering, caching, performance, mobile, Tailwind, component contracts, API patterns, and more. This file covers project-specific conventions only.

---

## ⚡ Active Migration: Prompts → Agents

The app is mid-migration from the legacy prompt system (`/ai/prompts`, `features/prompts*`, `features/context-menu`, `features/quick-actions`) to the new agent system (`/agents`, `features/agents`, `features/agent-shortcuts`).

**Before editing anything under prompts, context-menu, prompt-apps, shortcuts, code-editor, quick-actions, applets, or chat — read:**

1. [`features/agents/migration/README.md`](./features/agents/migration/README.md) — rules of the road
2. [`features/agents/migration/MASTER-PLAN.md`](./features/agents/migration/MASTER-PLAN.md) — phase-ordered plan
3. [`features/agents/migration/INVENTORY.md`](./features/agents/migration/INVENTORY.md) — legacy ↔ agent mapping

**Non-negotiable rules for every turn:**
- Keep the migration docs live. After any in-scope change, update the phase doc's status and Change Log. Add any newly discovered prompt-adjacent surface to `INVENTORY.md`. Stale docs will cascade across parallel agents.
- RTK only for all new state. Extend existing slices under `features/agents/redux/**` — never create parallel/local state.
- Shortcuts, categories, and content blocks are multi-scope from day one (admin / user / org). Build CRUD components once in `features/agent-shortcuts/` and reuse across admin/user/org routes.
- No destructive action until replacement ships and its phase is `complete`. Phases 16–19 are the deletion phases and run last.
- Recipes are dead; all active prompts have already been converted to agents. No conversion utilities needed.

---

# Web Access For Testing
- user: admin@admin.com
- Password: Password1234#

## Dev Auto-Login (localhost only)

Skip the login flow — hit this URL and you'll land on the target route already signed in:

```
http://localhost:3000/api/dev-login?token=${DEV_LOGIN_TOKEN}&next=/tasks
```

- `token` — value of `DEV_LOGIN_TOKEN` in `.env.local`
- `next` — any relative path (e.g. `/tasks`, `/tasks/abc-123`, `/admin/official-components`). Defaults to `/dashboard`.
- If a session already exists, it just redirects (no re-login).
- Hard-disabled outside `NODE_ENV !== 'production'` and non-localhost hosts.

---

## File Organization

- **General dirs:** `/components`, `/hooks`, `/utils`, `/constants`, `/types`, `/providers`
- **Feature dirs:** `/features/[feature-name]/` containing: `types.ts`, `components/`, `hooks/`, `service.ts`, `utils.ts`, `constants.ts`, `state/`
- **Route example:** `app/(authenticated)/notes/page.tsx` → Feature: `features/notes/`
- One README.md per feature, created **only after code is tested** — never multiple .md files
- Never save files to project root

> **⚠️ Barrel imports (`index.ts` re-export files) are being eliminated.** Do not create new `index.ts` barrel files. Import directly from source files (e.g. `import { Foo } from '@/features/foo/components/Foo'` not `@/features/foo'`). Gradually replace existing barrel imports when touching a file. ESLint rule `no-barrel-files/no-barrel-files` is active and will warn on violations.

---

## Tech Stack & Architecture

Always use the latest stable release of every package — no deprecated APIs. All output is production-grade.

**Web:** Next.js 16.1 (App Router) + React 19.2 + TypeScript 5.9 + Tailwind CSS 4.1 (CSS-first config, `@theme` directives)
**Mobile:** Expo 54 (React Native 0.81) + React 19.1 + TypeScript 5.9 — iOS 26+ (Liquid Glass) | Android 16+ (Material 3 Expressive)
**Backend:** Supabase (PostgreSQL + Auth + Storage + Realtime) — Next.js API routes are the single source of truth for all business logic
**Realtime:** Supabase Broadcast for ephemeral messaging/presence; Postgres Changes only when RLS authorization is needed
**Video/Audio:** LiveKit (requires `npx expo prebuild`, not Expo Go compatible)
**Payments:** Stripe
**Infrastructure:** Vercel (web), App Store / Play Store (mobile), Turbopack (default bundler), pnpm 10.28

**Python microservices** only when TypeScript hits a capability wall (heavy PDF/OCR, bulk statistical analysis, local NLP at scale, advanced image/video processing). Deploy as isolated services behind Next.js API routes.

**Core principles:**
- Dynamic rendering by default — opt into caching with `'use cache'`, invalidate with `cacheTag()` / `revalidateTag()`
- Server Components by default; Client Components only for interactivity
- React Compiler enabled (`reactCompiler: true`) — no manual `useMemo`/`useCallback`/`React.memo`
- `proxy.ts` replaces `middleware.ts` — auth checks, route guards, redirects only
- Supabase-generated types as source of truth — end-to-end type safety, strict mode, no `any`
- Every async operation has structured error handling — never swallow errors

**Supabase project:** `txzxabzwovsujtloxrus` (**Matrx Main**, region `us-west-1`, Postgres 17). This is the only project the matrx-frontend codebase talks to — `NEXT_PUBLIC_SUPABASE_URL` points at the `db.matrxserver.com` custom domain in front of it. When using the Supabase MCP (`list_tables`, `execute_sql`, `apply_migration`, etc.) always pass `project_id: "txzxabzwovsujtloxrus"`. Do NOT guess between Matrx Main / My Matrx / Matrx Flow / Matrx DM / Matrx Games — they're separate databases for separate products and `db.matrxserver.com` only routes to Matrx Main.

**Supabase clients:**
- Client-side: `import { supabase } from "@/utils/supabase/client"`
- Server-side: `import { createClient } from '@/utils/supabase/server'`

---

## Agent Feedback API

MCP server and REST endpoint for cross-project issue tracking. Agents submit bugs, features, and suggestions.

- **MCP:** `app/api/mcp/[transport]/route.ts` — 10 tools (submit, triage, comment, resolve, etc.)
- **REST:** `app/api/agent/feedback/route.ts` — POST with `{ action, ...params }`, same auth
- **Auth:** Bearer token against `AGENT_API_KEY` env var (`lib/services/agent-auth.ts`)
- **Service layer:** `lib/services/agent-feedback.service.ts` — uses `createAdminClient()` to bypass RLS

---

## Redux Architecture

- **Store:** `@/lib/redux/store.ts`
- **Typed hooks:** `useAppDispatch`, `useAppSelector`, `useAppStore` from `@/lib/redux/hooks.ts` — never use untyped versions
- All selectors memoized via `createSelector`
- Small, individual state updates — never large object replacements
- Every property gets a dedicated selector
- If an action/selector doesn't exist, ask before creating one

### Admin levels (highest bar by default)

The `admins` table has a `level` enum: `developer | senior_admin | super_admin`. New admin rows default to `super_admin`.

- **Default gate everywhere:** `selectIsSuperAdmin` (client) / `checkIsSuperAdmin` / `requireSuperAdmin` (server). Use these unless a specific surface has been deliberately lowered.
- **Selective lowering:** read `selectAdminLevel` directly and gate on the tier you actually want — e.g. `level === 'developer' || level === 'super_admin'`.
- **Any-admin (legacy):** `selectIsAdmin` / `checkIsUserAdmin` are kept for the rare "allow all admin levels" case.
- **State:** `state.userAuth.adminLevel: 'developer' | 'senior_admin' | 'super_admin' | null`. Hydrated once per session boot from the SSR layout chain (`getAdminStatus` → `mapUserData` → `splitUserData`). Don't refetch.
- **Permissions/metadata JSONB columns** on `admins` are reserved for future per-feature use. They are NOT loaded into Redux at boot — features that need them load on demand.

---

## Protected resources — single path of resistance (MANDATORY for agents)

Some tables can only be modified by Super Admins, and the codebase is hostile territory — any contributor with commit access can edit a TS check or curl the API with their own JWT. The defense is **at the database**, not in TypeScript: RLS deny-writes + `SECURITY DEFINER` RPCs gated by `is_super_admin()` + audit-log trigger. Every protected resource exposes ONE choke point (a single RPC family) and ONE thing to monitor (the audit log).

**Currently protected:** `public.admins`, `public.admin_audit_log`. Worked example lives at [`migrations/admin_management_rls_and_rpcs.sql`](./migrations/admin_management_rls_and_rpcs.sql), [`app/api/admin/admins/`](./app/api/admin/admins/), and [`app/(authenticated)/(admin-auth)/administration/admins/`](./app/(authenticated)/(admin-auth)/administration/admins/).

**Before you do any of these, read [`.claude/skills/protected-resources/SKILL.md`](./.claude/skills/protected-resources/SKILL.md) (or invoke the `protected-resources` skill):**
- Add a new RLS policy or `SECURITY DEFINER` RPC.
- Touch any of the admin RPCs (`admin_promote`, `admin_update`, `admin_revoke`, `admin_list`, `admin_list_audit`, `admin_find_user_by_email`, `is_super_admin`, `get_admin_status`).
- Write `.from('admins')` or `.from('admin_audit_log')` (don't — there's a reason RLS will block it).
- Use `createAdminClient()` for a user-initiated write to a sensitive table.
- Lock down a new table the user has flagged as sensitive (billing, feature flags, secrets, etc.).

**Two non-negotiable rules:**
1. **One mutation path per protected table.** A new "convenient" `.from()` write or admin-client shortcut breaks the whole monitoring story. Wrap it in an RPC instead.
2. **Don't disable RLS or skip the `is_super_admin()` check inside the RPC** "temporarily." There is no temporarily.

If you find yourself writing a new admin gate primitive (a new boolean selector, a new server helper), stop — `selectIsSuperAdmin` / `requireSuperAdmin` / `is_super_admin()` / `selectAdminLevel` cover everything. Compose, don't duplicate.

---

## File handling — single entry point (MANDATORY)

Every file flow in the app — `<img>` rendering, AI media blocks, downloads, uploads, share links, mid-stream agent file references, RAG ingest, OG previews — funnels through `@/features/files` (the public surface index). Read [`features/files/handler/FEATURE.md`](./features/files/handler/FEATURE.md) before touching anything that loads, displays, uploads, or attaches a file.

**Non-negotiable rules:**

1. **Use `fileHandler` for all file work.** `import { fileHandler } from "@/features/files/handler/handler"` and pass it a `FileSource`. Never construct `ImageBlock | AudioBlock | VideoBlock | DocumentBlock` literals by hand. Never call `Files.uploadFile` from outside the handler. For `<img>`/`<video>`/`<audio>` `src` values, use `useFileSrc` from `@/features/files`.
2. **No `supabase.storage` anywhere outside `features/files/handler/**` and `features/files/**`.** Anonymous users get an anonymous Supabase auth UUID and use the same `cld_files` system as everyone else. ESLint enforces this; the `no-restricted-syntax` rule catches `supabase.storage.from(...)` and `getPublicUrl`.
3. **No Next.js server-side file routes.** Files travel directly between the browser and Python — never via `/app/api/*`. The handler emits Python URLs (`{BACKEND_URL}/files/{id}/download`, `{BACKEND_URL}/share/{token}`); no proxy hops.
4. **Single internal representation.** Every codepath past `normalize()` sees only `NormalizedFile`. Adding a second internal shape defeats the point of this feature.
5. **The handler self-resolves.** It reads `userAuth`, `cloudFiles`, and `appContext` from Redux on its own. Callsites pass the file; they don't pass the user, the org, or the active project.

If a file shape isn't in the existing `FileSource` union, add it to `features/files/handler/types.ts` and write the input adapter — don't fork a parallel handler.

---

## Prompt Apps System [LEGACY]

Being replaced by **agent-apps**. See `features/agents/migration/phases/phase-08-agent-apps-public.md` and `features/agent-apps/FEATURE.md`. Do not extend — build in agent-apps.

---

## Feature Documentation

Every Tier 1 / Tier 2 feature has a `FEATURE.md` inside its feature directory. These are the **single source of truth** for how a feature works today. CLAUDE.md is just the index.

**Convention:**
- Filename is `FEATURE.md` (agent-facing architecture notes). User-facing `README.md` files are separate and may coexist.
- The template lives at `features/_FEATURE_TEMPLATE.md`.

### Tier 1 — core features (read before modifying)

| Feature | Doc |
|---|---|
| Agents system (umbrella) | `features/agents/FEATURE.md` + `features/agents/docs/` |
| Agent shortcuts | `features/agent-shortcuts/FEATURE.md` |
| Agent apps | `features/agent-apps/FEATURE.md` |
| Agent connections | `features/agent-connections/FEATURE.md` |
| Agent context + Brokers | `features/agent-context/FEATURE.md` |
| Tool call visualization | `features/tool-call-visualization/FEATURE.md` |
| Streaming system | `features/agents/docs/STREAMING_SYSTEM.md` |
| Artifacts + Canvas | `features/artifacts/FEATURE.md` |
| Chat + Conversation | `features/conversation/FEATURE.md` |
| Notes | `features/notes/FEATURE.md` |
| Permissions & Sharing | `features/sharing/FEATURE.md` |
| Scope system | `features/scope-system/FEATURE.md` |
| Code editor | `features/code-editor/FEATURE.md` |
| Window Panels (all overlays) | `features/window-panels/FEATURE.md` |
| Settings system (preferences shell, primitives, `useSetting`) | `features/settings/FEATURE.md` + `.cursor/skills/settings-system/SKILL.md` |
| RAG (library, data stores, document viewer, search, repositories, ingest/search clients, hooks) | `features/rag/FEATURE.md` |
| Universal file handler (single entry point for every file flow) | `features/files/handler/FEATURE.md` |
| Scheduling (sch_* spine, `/schedules` user UI, `/administration/scheduling` admin, matrx-scheduler Python package on aidream) | `features/scheduling/FEATURE.md` |

### Tier 2 — secondary features

| Feature | Doc |
|---|---|
| API integrations (incl. MCP) | `features/api-integrations/FEATURE.md` |
| Tasks + Projects | `features/tasks/FEATURE.md` |
| Organizations + Invitations | `features/organizations/FEATURE.md` |
| AI Models registry | `features/ai-models/FEATURE.md` |
| Data ingestion (scraper, PDF, research, transcripts) | `features/scraper/FEATURE.md` |
| Agent feedback API / MCP server | `app/api/mcp/FEATURE.md` |
| Audio pipeline (TTS, audio, podcasts) | `features/audio/FEATURE.md` |
| Image Manager hub (route + modal, single registry) | `features/image-manager/FEATURE.md` |

### Non-negotiable: keep feature docs live

After any substantive change to a feature:
1. Update the matching `FEATURE.md` — status, flows that changed, new entry points, invariants broken/added.
2. Append to its **Change Log** (date + one-line summary).
3. If the change crosses features, update **every** doc affected.

Stale docs cascade across parallel agents and corrupt the mental model of every future turn. Treat doc updates with the same weight as code changes in the same PR.

---

## Official Component Library

- **Components:** `components/official/`
- **Demos:** `app/(authenticated)/admin/official-components/component-displays/`
- **Registry:** `app/(authenticated)/admin/official-components/parts/component-list.tsx`
- Components must work immediately on import — no local styling modifications
- NEVER delete existing components — ALWAYS preserve functionality

---

## UI/UX Standards

- **Icons:** Lucide React only — no emojis
- **Backgrounds:** `bg-textured` for main backgrounds
- **Loading:** Use component library loading states — no plain text "Loading..."
- **Layout:** Space-efficient, minimal padding/gaps
- **Page wrapper:** `<div className="h-[calc(100vh-2.5rem)] flex flex-col overflow-hidden">`

### 🚫 Browser dialogs are BANNED — zero tolerance

**Never call `window.confirm`, `window.alert`, `window.prompt`, or their bare forms (`confirm(...)`, `alert(...)`, `prompt(...)`) in any user-facing code.** They render with default OS chrome (no theming, no dark mode, ugly), block the entire main thread, are unstyleable, and ship a "this site is asking…" Chrome banner that screams "amateur hour." Treat them as if they don't exist in the language. This rule applies to demos, admin tools, test pages, internal panels, and prototypes — *every single thing* a real human will ever see.

If you're tempted to write `confirm("Delete this?")`, stop. Use the components below.

| Use case | Component |
|---|---|
| Confirm a destructive or irreversible action — **inline, with busy state** | `<ConfirmDialog />` from `@/components/ui/confirm-dialog` |
| Confirm — **imperative one-liner from anywhere** (Promise<boolean>) | `confirm({title, ...})` from `@/components/dialogs/confirm/ConfirmDialogHost` |
| Show success / error / info to the user (replaces `window.alert`) | `toast.success(...)` / `toast.error(...)` from `sonner` |
| Capture a single string from the user (replaces `window.prompt`) | `<TextInputDialog />` from `@/components/dialogs/text-input/TextInputDialog` (Drawer on mobile, Dialog on desktop) |
| Show a URL for manual copy when the clipboard API fails | `<ClipboardFallbackDialog />` from `@/components/dialogs/clipboard-fallback/ClipboardFallbackDialog` |
| Unsaved-changes guard on close/leave | `<ConfirmDialog />` driven by a `beforeunload`/`router.events` blocker — **never** `confirm("Discard changes?")` |

#### When to pick which confirm

- **Inline `<ConfirmDialog>`** — when you want busy state inside the dialog (e.g. dialog stays open with a spinner during a network delete) or fine-grained control over open/close. Most cases.
- **Imperative `confirm()`** — when you want a one-liner: `if (!(await confirm({title: "Delete?", variant: "destructive"}))) return;`. Backed by a global host mounted in `app/Providers.tsx`, `app/EntityProviders.tsx`, and `app/(public)/PublicProviders.tsx`. The dialog closes immediately on click; show your own busy state outside.

**`<ConfirmDialog />` canonical usage (inline):**

```tsx
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

const [target, setTarget] = useState<Item | null>(null);
const [busy, setBusy] = useState(false);

// Trigger:
<button onClick={() => setTarget(item)}>Delete</button>

// Render once at the bottom of the component:
<ConfirmDialog
  open={!!target}
  onOpenChange={(open) => { if (!open && !busy) setTarget(null); }}
  title="Delete item"
  description={<>Permanently delete <b>{target?.name}</b>. This cannot be undone.</>}
  confirmLabel="Delete"
  variant="destructive"
  busy={busy}
  onConfirm={async () => {
    setBusy(true);
    try { await deleteItem(target!.id); setTarget(null); }
    finally { setBusy(false); }
  }}
/>
```

**`confirm()` canonical usage (imperative):**

```tsx
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";

async function handleDelete(item: Item) {
  const ok = await confirm({
    title: "Delete item",
    description: `Permanently delete "${item.name}". This cannot be undone.`,
    confirmLabel: "Delete",
    variant: "destructive",
  });
  if (!ok) return;
  await deleteItem(item.id);
}
```

**`<TextInputDialog />` canonical usage:**

```tsx
import { TextInputDialog } from "@/components/dialogs/text-input/TextInputDialog";

const [open, setOpen] = useState(false);
const [busy, setBusy] = useState(false);

<TextInputDialog
  open={open}
  onOpenChange={(o) => { if (!busy) setOpen(o); }}
  title="New folder"
  placeholder="Folder name"
  confirmLabel="Create"
  busy={busy}
  onConfirm={async (name) => {
    setBusy(true);
    try { await createFolder(name); setOpen(false); }
    finally { setBusy(false); }
  }}
/>
```

**Boy-scout rule:** if you encounter an existing `window.confirm`/`window.alert`/`window.prompt`/bare `confirm(...)`/`alert(...)`/`prompt(...)` while working in a file, fix it in the same change. Every leftover is a customer-visible enterprise-grade-fail.

---

## Mobile Layout (Responsive Web)

- `h-dvh` / `min-h-dvh` — **never** `h-screen` or `vh`
- `pb-safe` on all fixed bottom elements
- `--header-height` (2.5rem) — never hardcode
- Input font-size ≥ 16px — prevents iOS zoom
- **NEVER Dialog on mobile** — use Drawer (bottom sheet) via `useIsMobile()`
- **NEVER tabs on mobile** — stack sections vertically
- **NEVER nested scrolling** — single scroll area per view

**Single source of truth:** `.cursor/skills/ios-mobile-first/SKILL.md` — all patterns, examples, and checklist

---

## Navigation Feedback

- `useTransition` + `startTransition` for all route navigation
- Loading overlay with spinner on active element
- Disable all interactive elements during transitions
- Prevent duplicate clicks via state check

---

## Design Tokens

- **Semantic classes:** `bg-card`, `bg-muted`, `bg-accent`, `text-foreground`, `text-muted-foreground`, `text-primary`, `border-border`
- **Colors:** primary (blue), secondary (purple), destructive, success, warning, info
- **Elevations:** `--elevation-1/2/3`
- **Gradients:** `--gradient-1/2/3`
- Full variable definitions in `app/globals.css`
- CSS migration guide: `.cursor/rules/css-updates.mdc`

---

## Available Commands

Run `/command-name` for specialized workflows. See `.claude/commands/` for: `/web-design`, `/nextjs-patterns`

---

## Cross-Repo Integration with matrx-extend

The matrx-extend Chrome extension will coordinate with this app for cross-surface workflows (channel under construction). Integration map:
- Connection details: [docs/MATRX_EXTEND_CONNECTION.md](./docs/MATRX_EXTEND_CONNECTION.md)
- Skill for working on this connection: `.claude/skills/connect-matrx-extend/SKILL.md`
- Master cross-repo doc (in matrx-extend): `/Users/armanisadeghi/code/matrx-extend/.claude/worktrees/exciting-moser-4b984f/docs/CROSS_REPO_INTEGRATION.md`
- Task pipeline for cross-repo work: `.matrx/` (TASKS_FROM_USER → AGENT_TASKS → AGENT_INSTRUCTIONS).

Pre-existing dead-references that look like extension scaffolding but ARE NOT real bridges (do not touch in unrelated PRs; the real bridge ships in Phase 2):
- `features/tool-registry/surfaces/data/surface-candidates.ts:24` — `chrome-extension` in `client_name` type union, no surface declared
- `utils/errorContext.ts:10` — defensive stack-frame filter
