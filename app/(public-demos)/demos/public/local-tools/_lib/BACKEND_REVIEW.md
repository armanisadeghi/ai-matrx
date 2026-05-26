# Backend Review Notes for React Team

> From: backend team · Date: 2026-03-02

---

## ✅ `useMatrxLocal.ts` — Looks Good

The hook is well-structured. Auth, discovery, REST, WebSocket, health polling, and generic CRUD helpers all look correct. A few minor notes below.

---

## REST vs WebSocket — We Support Both (By Design)

Both transports are intentional and serve different purposes:

| | REST (`POST /tools/invoke`) | WebSocket (`ws://host/ws`) |
|---|---|---|
| **Session** | Stateless — fresh session per request | Stateful — persists working directory, background processes |
| **Concurrency** | One tool at a time per HTTP call | Multiple tools run in parallel, each tracked by `id` |
| **Cancellation** | Not possible (abort the HTTP request) | Send `{"id":"...", "action":"cancel"}` mid-flight |
| **Best for** | One-shot calls (SystemInfo, Screenshot) | Long workflows (Research, Bash sessions, multi-step scraping) |

**Your `invokeTool` fallback logic is exactly right:** prefer WebSocket when connected, fall back to REST otherwise.

---

## Issues to Fix

### 1. `ALL_TOOLS` list is way too long

Your `constants.ts` lists ~80 tools. The backend currently implements **23 tools**. The extra ones (`ListProcesses`, `LaunchApp`, `BrowserNavigate`, `RecordAudio`, etc.) will return errors if called since they don't exist yet.

**Fix:** Call `GET /tools/list` at startup and use the response as your source of truth. You already call this in `discoverMatrxLocal()` — use the response to populate the available tool list instead of hardcoding `ALL_TOOLS`.

```typescript
// In discoverMatrxLocal or after discovery:
const res = await fetch(`${url}/tools/list`);
const { tools } = await res.json(); // string[] of actually available tools
```

Keep `ALL_TOOLS` and `TOOL_CATEGORIES` as a UI reference for display names and grouping, but **grey out / disable tools not in the server's list**.

### 2. `pollHealth` sends auth headers unnecessarily

`/health`, `/version`, `/ports` are now public endpoints. Sending a Bearer token is harmless but unnecessary overhead for every 15-second poll. Consider removing `buildAuthHeaders()` from `pollHealth`.

### 3. Discovery should try `/health` instead of `/tools/list`

`/health` is lighter weight (no tool registry lookup). Update `discoverMatrxLocal()` to probe `/health` instead:

```typescript
const res = await fetch(`${url}/health`, {
    signal: AbortSignal.timeout(DISCOVERY_TIMEOUT),
});
```

### 4. Handle 401 errors on protected endpoints

When a protected endpoint returns 401, the hook should:
1. Try refreshing the Supabase session (`supabase.auth.refreshSession()`)
2. Retry the request once with the fresh token
3. Only then surface the error to the UI

Currently, a 401 from `invokeViaRest` would just throw a generic error. Consider a wrapper:

```typescript
async function authenticatedFetch(url: string, opts: RequestInit): Promise<Response> {
    const res = await fetch(url, opts);
    if (res.status === 401) {
        // Token may have expired — refresh and retry once
        const { data } = await supabase.auth.refreshSession();
        if (data.session) {
            const retryOpts = {
                ...opts,
                headers: {
                    ...opts.headers,
                    Authorization: `Bearer ${data.session.access_token}`,
                },
            };
            return fetch(url, retryOpts);
        }
    }
    return res;
}
```

### 5. Add error context to `ToolResult` for REST failures

When `invokeViaRest` gets a non-OK response, you return the JSON body but don't check the status code. If the server returns a 401, 404, or 500, the error message would be unclear:

```typescript
// Currently:
const data = (await res.json()) as ToolResult;
// If res.status === 401, data is: {"detail": "Authorization header required"}
// But this gets returned as a ToolResult, which expects type/output fields

// Fix — check status first:
if (!res.ok) {
    const errText = await res.text().catch(() => '');
    return { type: 'error', output: `HTTP ${res.status}: ${errText || res.statusText}` };
}
const data = (await res.json()) as ToolResult;
```

---

## Optional Enhancements

### WebSocket auto-reconnect

If the engine restarts (e.g., after an update), the WebSocket drops silently. Consider auto-reconnecting with exponential backoff:

```typescript
ws.onclose = () => {
    // Auto-reconnect after 2s, 4s, 8s, ...
    setTimeout(() => connectWs(), Math.min(2000 * 2 ** retryCount, 30000));
};
```

### Engine version display

You're polling `/version` every 15s. Consider fetching it once on discovery and caching it, since the version doesn't change while the engine is running.
