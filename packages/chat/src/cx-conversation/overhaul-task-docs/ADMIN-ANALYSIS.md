# Admin preferences & debug — related code (Socket.IO excluded)

## `adminPreferencesSlice` (`lib/redux/slices/adminPreferencesSlice.ts`)

| Piece | Role |
|-------|------|
| `serverOverride` | `null` → treat as **production**; `'localhost'` → local FastAPI |
| `selectEffectiveServer` | `override \|\| 'production'` |
| `selectIsUsingLocalhost` | `override === 'localhost'` |
| `clearAdminPreferences` | **Never dispatched** anywhere (dead action) |

### Where `production` / `localhost` is **set** (Redux)

1. **`hooks/useAdminOverride.ts`** — only code path that should drive prefs for most UIs: `setServer('localhost' \| null)`, `resetToProduction` (`null`), `recheckLocalhost` (sets localhost if healthy, else null). Localhost switch runs health check first.
2. **`components/matrx/AdminMenu.tsx`** — calls `useAdminOverride().setServer`: **Production** = `setServer(null)` (“default” radio); **localhost** = `setServer('localhost')` after health check.
3. **`components/api-test-config/useApiTestConfig.ts`** — same Redux via `useAdminOverride` (API test pages).
4. **`app/(public)/demos/api-tests/tool-testing/ToolTestingClient.tsx`** — `useAdminOverride`.
5. **`components/admin/controls/MediumIndicator.tsx`** — dispatches `setServerOverride` directly when picking a server URL / reset (keeps FastAPI URL in sync with that UI). *Socket wiring lives here too; ignored for behavior mapping except this Redux write.*

**Not persisted** — session memory only; refresh resets to production unless something sets it again.

**URL constants:** `BACKEND_URLS.production` / `BACKEND_URLS.localhost` in `lib/api/endpoints.ts` (`ENDPOINTS.health.check` used for health checks).

### Consumers of `selectIsUsingLocalhost` (HTTP / client paths only)

- `hooks/useBackendApi.ts` — **Note:** uses localhost only if `selectIsAdmin` **and** `selectIsUsingLocalhost` (stricter than `useAdminOverride`, which always maps Redux localhost → local URL for `backendUrl`).
- `hooks/useBackendClient.ts` — uses `useAdminOverride().backendUrl` (no extra admin gate on URL).
- `features/cx-conversation/redux/thunks/sendMessage.ts`
- `lib/redux/prompt-execution/thunks/executeMessageFastAPIThunk.ts`
- `features/prompt-apps/components/PromptAppRenderer.tsx`, `PromptAppPublicRendererFastAPI.tsx`
- `features/public-chat/components/ChatContainer.tsx`
- `app/(dev)/demos/chat/_components/ChatWorkspace.tsx`
- `features/scraper/hooks/usePublicScraperStream.ts`
- `features/prompts/hooks/usePromptCategorizer.ts`
- `components/admin/hooks/useToolComponentAgent.ts`
- `features/applet/runner/response/AppletFollowUpInput.tsx`

**Store registration:** `lib/redux/rootReducer.ts` (`adminPreferences`).

### Overlapping / separate “server choice” (not this slice)

| Area | Behavior |
|------|----------|
| `app/(public)/demos/api-tests/matrx-ai/_shared/servers.ts` | localStorage, **no Redux** |
| `app/(public)/demos/api-tests/matrx-ai/_shared/useServerConfig.ts` | localStorage |
| `useApiTestConfig` | Documented as unified with **AdminMenu** + Redux |

---

## `adminDebugSlice` (`lib/redux/slices/adminDebugSlice.ts`)

| Piece | Role |
|-------|------|
| `isDebugMode` | Global debug toggle |
| `debugData` | Arbitrary key/value bag |
| `indicators.*` | Prompt / resource / execution-state debug panels (open + payload/runId) |

**Writers / readers (high signal):**

- **Toggle UI:** `UnifiedContextMenu`, `NoteContextMenuContent`, `CreatorOptionsModal`, `demo/.../ai-prog/direct/page`, `MediumIndicator` (Debug button).
- **Indicators:** `SmartPromptInput`, `DynamicContextMenu`, `DebugIndicatorManager`, `LargeIndicator`, `PromptBuilder` (`updateDebugData`).
- **Display gated on debug:** `AutoCreatePromptAppForm`, `ResponseColumn` (see overlap below).

**Store:** `rootReducer` key `adminDebug`.

### Overlap — second “debug mode” on **chat / conversation** entity

- **`lib/redux/entity/custom-selectors/chatSelectors.ts`** — `isDebugMode` from `conversation` customData (`customData.isDebugMode`).
- **`lib/redux/entity/custom-actions/chatActions.ts`** — `setChatDebugMode` writes that flag.
- **`components/admin/controls/MediumIndicator.tsx`** — toggling **global** debug also dispatches `setChatDebugMode` so both stay aligned from that control only; other entry points may not sync both.

So: **admin debug** vs **per-conversation chat debug** can diverge unless everything goes through the same toggle.

---

## Quick reference — files that import the slices

**Preferences:** slices file, `useAdminOverride`, `AdminMenu`, `useApiTestConfig`, `ToolTestingClient`, `MediumIndicator`, plus consumers listed above (and socket/prompt thunks if you include them later).

**Debug:** slices file, `DebugIndicatorManager`, `LargeIndicator`, `MediumIndicator`, `UnifiedContextMenu`, `NoteContextMenuContent`, `PromptBuilder`, `SmartPromptInput`, `DynamicContextMenu`, `CreatorOptionsModal`, `AutoCreatePromptAppForm`, demo page, `components/admin/debug/USAGE.md`.
