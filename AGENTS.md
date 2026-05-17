---
description: 
alwaysApply: true
---

# AGENTS.md — AI Matrx Admin

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

---

## Prompt Apps System [LEGACY]

Being replaced by **agent-apps**. See `features/agents/migration/phases/phase-08-agent-apps-public.md` and `features/agent-apps/FEATURE.md`. Do not extend — build in agent-apps.

---

## Scopes and Context — Canonical Model

Two words, two distinct concepts. Confusing them produced the worst code rot in the repo.

- **Scope** = the user-authored dimensions inside an org (`Client`, `Department`, `Repo`, `Case`, `Patient`). Each scope holds context items (the columns) and values (the cells). The only piece of context users actually edit by hand.
- **Context** = everything the LLM receives at invocation time. Assembled by the system from scopes + org + project + task + user + ambient. Users never edit "context" as a thing.

Scope is the most important *part* of context, not its synonym. Read [`features/scopes/FEATURE.md`](./features/scopes/FEATURE.md) before touching any scope/context code.

**Global vs Local context — the load-bearing invariant:**

- **Global context** lives in `lib/redux/slices/appContextSlice.ts` — what the user is working on right now (active org, scope selections, project, task).
- **Local context** lives on the entity being acted on — a note's tags, a task's tags, an agent's tags via `ctx_scope_assignments`.
- **Global context is ONLY written by Surface A components** (`ActiveScopePicker` and friends, under `features/scopes/components/active-context/`). Every other picker — every "tag this with…" UI — writes to `ctx_scope_assignments`, never `appContextSlice`. ESLint enforces this at the import path.
- **Resolution rule:** locally-triggered actions read local-first with global as fallback. Globally-triggered actions read global only. Contradictions (global vs local disagreeing on the same scope type) surface as a warning, never a block.

If a picker is silently changing the sidebar's active context, **it's a bug — even if it "feels helpful."** That pattern is the #1 thing this module exists to kill.

`features/agent-context/` is the thin consumer that fills declared variable and context slots at invocation time. It reads scopes from `features/scopes/`; it does not own scope data. See [`features/agent-context/FEATURE.md`](./features/agent-context/FEATURE.md) for the resolution mechanics.

---

## Feature Documentation

Every Tier 1 / Tier 2 feature has a `FEATURE.md` inside its feature directory. These are the **single source of truth** for how a feature works today. AGENTS.md is just the index.

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
| Scopes | `features/scopes/FEATURE.md` |
| Agent context + Brokers | `features/agent-context/FEATURE.md` (narrowed: broker resolution + slot fill; scope CRUD lives in `features/scopes/`) |
| Tool call visualization | `features/tool-call-visualization/FEATURE.md` |
| Streaming system | `features/agents/docs/STREAMING_SYSTEM.md` |
| Artifacts + Canvas | `features/artifacts/FEATURE.md` |
| Chat + Conversation | `features/conversation/FEATURE.md` |
| Notes | `features/notes/FEATURE.md` |
| Permissions & Sharing | `features/sharing/FEATURE.md` |
| Code editor | `features/code-editor/FEATURE.md` |
| Window Panels (all overlays) | `features/window-panels/FEATURE.md` |
| Settings system (preferences shell, primitives, `useSetting`) | `features/settings/FEATURE.md` + `.cursor/skills/settings-system/SKILL.md` |
| RAG (library, data stores, document viewer, search, repositories, ingest/search clients, hooks) | `features/rag/FEATURE.md` |

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
| Confirm a destructive or irreversible action (replaces `window.confirm`) | `<ConfirmDialog />` from `@/components/ui/confirm-dialog` |
| Show success / error / info to the user (replaces `window.alert`) | `toast.success(...)` / `toast.error(...)` from `sonner` |
| Capture a single string from the user (replaces `window.prompt`) | An inline form, or a `<Dialog />` from `@/components/ui/dialog` with an `<Input />`, or an `EmailInputDialog`-style modal |
| Unsaved-changes guard on close/leave | `<ConfirmDialog />` driven by a `beforeunload`/`router.events` blocker — **never** `confirm("Discard changes?")` |

**`<ConfirmDialog />` canonical usage:**

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

Run `/command-name` for specialized workflows. See `.Codex/commands/` for: `/web-design`, `/nextjs-patterns`
