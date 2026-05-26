# Agents route — current implementation (as of 2026-04-10)

This document describes the **actual** filesystem, imports, and component tree under `app/(a)/agents` today. It is separate from the vision docs (`agents-route-architecture.md`, `analysis.md`), which were not modified.

For auto-generated partial indexes, see `MODULE_README.md` (note: its signature block does not yet list `[id]/build/page.tsx`; run `generate_module_readme.py` to refresh).

---

## URL map (authenticated segment `(a)`)

| User-facing path | App Router file | Primary feature component |
|------------------|-----------------|---------------------------|
| `/agents` | `app/(a)/agents/page.tsx` | `AgentListHydrator` + `AgentsGrid` |
| `/agents/[id]` | `[id]/page.tsx` | `AgentViewContent` |
| `/agents/[id]/build` | `[id]/build/page.tsx` | **`AgentBuilderPage`** |
| `/agents/[id]/run` | `[id]/run/page.tsx` | **`AgentRunnerPage`** |
| `/agents/[id]/latest` | `[id]/latest/page.tsx` | `AgentVersionsWorkspace` |
| `/agents/[id]/[version]` | `[id]/[version]/page.tsx` | `AgentVersionsWorkspace` (`initialVersion`) |

Header mode switcher (`AgentModeController`) maps **“Build”** in the UI to internal mode `edit` and path **`/agents/${id}/build`**. There is no separate `/edit` segment; **build and edit are the same route.**

---

## Layout and shared shell

### `app/(a)/agents/layout.tsx`

- Sets static metadata via `createRouteMetadata("/agents", …)`.
- Passthrough `{children}` only (no visual wrapper).

### `app/(a)/agents/[id]/layout.tsx`

- `generateMetadata`: `getAgent(id)` → dynamic title/description.
- Renders:
  - `AgentHydratorServer` (Redux hydration for the agent).
  - `PageHeader` → **`AgentHeader`** with SSR `agentName` (no name flash).
- Wraps route children: `<div className="h-full overflow-hidden">{children}</div>`.

All nested pages under `[id]` (view, build, run, versions) share this header and hydrator.

---

## Core route: Build (`/agents/[id]/build`)

### Route module

**File:** `app/(a)/agents/[id]/build/page.tsx`

- **Exports:** `metadata.title = "Agent Builder | AI Matrx"`.
- **Default export:** async `AgentEditPage` (component name in code; URL is still `/build`).
- **Implementation:** `await params` → `{ id }` → `<AgentBuilderPage agentId={id} />`.

**Loading:** `[id]/build/loading.tsx` → `AgentBuildLoading` → full-height `DesktopBuilderSkeleton`.

### `AgentBuilderPage` (feature entry)

**File:** `features/agents/components/builder/AgentBuilderPage.tsx`

- **Type:** Server Component (no `"use client"`).
- **Props:** `{ agentId: string }`.
- **Structure:** Outer `<div className="h-full overflow-hidden">` wrapping **`AgentBuilderClient`** with:
  - `desktopContent={<AgentBuilderDesktop agentId={agentId} />}`
  - `fallback={<DesktopBuilderSkeleton />}`

### Downstream builder tree

1. **`AgentBuilderClient`** (`AgentBuilderClient.tsx`, client)
   - Waits for `mounted` + Redux `selectAgentReadyForBuilder(state, agentId)`.
   - Runs **`useAgentAutoSave(agentId)`**.
   - **Mobile:** dynamic import `AgentBuilderMobile` (`ssr: false`), loading `MobileBuilderSkeleton`.
   - **Desktop:** renders the `desktopContent` prop (i.e. `AgentBuilderDesktop`).

2. **`AgentBuilderDesktop`** (`AgentBuilderDesktop.tsx`, server)
   - Two columns, full height; left column top padding `var(--shell-header-h)`.
   - **Left:** `AgentBuilderLeftPanel`.
   - **Right:** `Suspense` + `AgentBuilderRightPanel` with `RightPanelSkeleton` fallback; inner `max-w-3xl` column with `pt-12`.

---

## Core route: Run (`/agents/[id]/run`)

### Route module

**File:** `app/(a)/agents/[id]/run/page.tsx`

- **Exports:** `metadata.title = "Agent Runner | AI Matrx"`.
- **Default export:** async `AgentRunRoute` → `<AgentRunnerPage agentId={id} />`.

**Loading:** `[id]/run/loading.tsx` → `AgentRunLoading` (sidebar + main skeletons aligned with desktop layout).

### `AgentRunnerPage` (feature entry)

**File:** `features/agents/components/run/AgentRunnerPage.tsx`

- **Type:** Client Component (`"use client"`).
- **Note:** File-level comment block still titles the page **“AgentRunPage”**; the exported symbol is **`AgentRunnerPage`** (harmless doc drift).

**Initialization**

- Reads `useSearchParams()`: `runId`, `conversationId` (optional).
- On mount (effect keyed by `agentId`): if `selectAgentExecutionPayload` not ready, dispatches **`fetchAgentExecutionMinimal(agentId)`**; tracks `isInitializing`.
- **`useAgentLauncher(agentId, { surfaceKey: \`agent-runner:${agentId}\`, sourceFeature: "agent-runner", ready: !isInitializing })`** → yields `conversationId` for the active instance.
- Secondary effect: when `?conversationId=` appears in the URL, ensures a manual instance exists (`createManualInstance` with `mode: "conversation"`), loads history (`fetchConversationHistory`), and **`setFocus`** for the runner surface.

**Loading gate:** Until `!isInitializing && conversationId`, shows centered `Loader2` + “Loading agent…”.

**Layout — desktop**

- Optional left sidebar (`w-64`): **`AgentRunsSidebar`** + border-top section with **`AgentLauncherSidebarTester`**.
- `sidebarOpen` default `true` on desktop, `false` on mobile; floating **`PanelLeft`** button when sidebar collapsed.
- Main: **`AgentConversationColumn`** with `constrainWidth`, `smartInputProps` (`sendButtonVariant: "blue"`, `showSubmitOnEnterToggle: true`).

**Layout — mobile**

- Top toolbar: buttons open **Drawers** (not Dialog) for History and Test Modes (matches project mobile rules).
- **`AgentRunsSidebar`** and **`AgentLauncherSidebarTester`** render inside those drawers with `pb-safe` scroll areas.

**Key child imports**

- `./AgentRunsSidebar`
- `../run-controls/AgentLauncherSidebarTester`
- `../shared/AgentConversationColumn`

---

## Other `[id]` pages (context)

| File | Role |
|------|------|
| `[id]/page.tsx` | View mode → `AgentViewContent` |
| `[id]/latest/page.tsx` | Versions workspace (latest) |
| `[id]/[version]/page.tsx` | Versions workspace pinned to numeric version; invalid version → `notFound()` |
| `[id]/error.tsx`, `[id]/not-found.tsx` | Segment error / not-found |
| `[id]/loading.tsx` | Agent detail loading |

List page: `app/(a)/agents/page.tsx` uses `getAgentListSeed`, `AgentListHydrator`, `AgentsGrid`.

---

## Cross-cutting: header navigation

**`AgentHeader`** (`features/agents/components/shared/AgentHeader.tsx`) is rendered only from `[id]/layout.tsx`. Center control **`AgentModeController`** resolves mode from `pathname`:

- `…/run` → `run`
- `…/build` → `edit` (labeled “Build” in the UI)
- numeric version path → `versions`
- else → `view`

Target paths: `view` → `/agents/[id]`, `edit` → `/agents/[id]/build`, `run` → `/agents/[id]/run`, `versions` → `/agents/[id]/latest`.

---

## Imports / symbols (quick reference)

| Symbol | Defined in | Imported by |
|--------|------------|-------------|
| `AgentBuilderPage` | `features/agents/components/builder/AgentBuilderPage.tsx` | `[id]/build/page.tsx` |
| `AgentRunnerPage` | `features/agents/components/run/AgentRunnerPage.tsx` | `[id]/run/page.tsx` |

No barrel `features/agents/index.ts` re-exports these; routes import the feature paths directly.

---

## Gaps and naming notes (for maintainers)

1. **`MODULE_README.md` auto-signatures** omit `build/page.tsx`; regenerate if you rely on that index.
2. **Build route** default export name is `AgentEditPage` while the URL segment is `build` — intentional dual naming (“edit” in mode, “build” in path).
3. **`AgentRunnerPage.tsx`** top comment still says `AgentRunPage`; update when touching the file if you want comments to match exports.
4. Vision documents **`agents-route-architecture.md`** and **`analysis.md`** were explicitly excluded from edits in this pass; reconcile them manually if they diverge from this file.
