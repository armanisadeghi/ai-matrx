---
name: cloud-files
description: Use when modifying anything under features/files/, app/(a)/files/, app/(public)/share/, or any caller that uploads, downloads, lists, moves, renames, shares, or previews user files. Also use when a legacy supabase.storage.* call is being touched (deletion is the only allowed change).
---

# Cloud Files — Skill

This skill enforces the architecture established in [features/files/FEATURE.md](FEATURE.md). Read it first. This skill is the checklist version.

---

## Non-negotiables

- **Reads**: supabase-js (RLS) + RPC `cloud_get_user_file_tree`. No REST calls for reads unless the endpoint returns bytes.
- **Writes**: REST at `${AIDREAM_API_URL}/files/*`. Always send `Authorization: Bearer ${jwt}` and `X-Request-Id: ${requestId}`.
- **Never `supabase.storage.*` in new code.** Only legacy. Use [features/files/api/client.ts](api/client.ts).
- **All file state in the `cloudFiles` Redux slice.** No local `useState` for file data. No new Redux slices for files — extend the existing one.
- **All types in [features/files/types.ts](types.ts).** Do not declare inline types or per-file type files. Import via [features/files/index.ts](index.ts).
- **Identity is `fileId`.** Never cache by `file_path` — paths move with renames.
- **Mutations are optimistic + rollback** (pattern from [features/agents/redux/agent-shortcuts/thunks.ts](../agents/redux/agent-shortcuts/thunks.ts)). No spinner-then-refetch.
- **Realtime is the source of truth for cross-session sync.** The middleware dedups echoes of local writes via the request ledger — always register a `requestId` on every mutation.
- **Mobile rules:** `Drawer` not `Dialog`; push-nav not tabs; `dvh` not `vh`; `pb-safe` on fixed bottoms; 16px inputs.
- **`FieldFlags<K>` not `Set<K>`** in Redux state (JSON-serializability).
- **`app/(a)/files/`** routes follow [app/(a)/_read_first_route_rules/RULES.md](../../app/(a)/_read_first_route_rules/RULES.md). SSR-first, zero layout shift, Cache Components.

---

## Before writing code

Read, in this order:

1. [features/files/from_python/UPDATES.md](from_python/UPDATES.md) — backend contract + release notes from the Python team. Read-only.
2. [features/files/FEATURE.md](FEATURE.md) — current FE architecture.
3. [features/agents/redux/agent-shortcuts/slice.ts](../agents/redux/agent-shortcuts/slice.ts) — the record + dirty-tracking pattern you're copying.

For route work under `app/(a)/files/`, additionally run these skills before writing code:
- `Skill(vercel-plugin:next-cache-components)`
- `.cursor/skills/nextjs-ssr-architecture/SKILL.md`
- `.cursor/skills/ssr-zero-layout-shift/SKILL.md`
- `.cursor/skills/ios-mobile-first/SKILL.md` (for any mobile branch)

---

## Common tasks

### Upload files

```ts
import { useAppDispatch } from '@/lib/redux/hooks';
import { uploadFiles } from '@/features/files/redux/thunks';

const dispatch = useAppDispatch();
await dispatch(
  uploadFiles({ files: [file], parentFolderId, visibility: 'private' })
).unwrap();
```

### Render a file as `<img>` / `<video>`

```ts
import { useFileSrc } from '@/features/files';

const { url } = useFileSrc({ kind: 'file_id', fileId });
return <img src={url ?? undefined} />;
```

### Pick a file for "attach"

```ts
import { openFilePicker } from '@/features/files/components/pickers/FilePicker';

const [file] = await openFilePicker({ multi: false });
```

### List contents of a folder

```ts
import { useFolderContents } from '@/features/files/hooks/useFolderContents';

const { files, folders, loading } = useFolderContents(folderId);
```

### Create a share link

```ts
import { useSharing } from '@/features/files/hooks/useSharing';

const { createShareLink } = useSharing();
const link = await createShareLink(fileId, {
  permission_level: 'read',
  expires_at: '2026-12-31T23:59:59Z',
  max_uses: 50,
});
// link.share_token → https://app.aidream.com/share/${link.share_token}
```

---

## Forbidden

- `supabase.storage.from(...)` in new code.
- New Redux slices for files. Extend `cloudFiles`.
- Local types declarations for `CloudFile`, `CloudFolder`, etc. Import from [features/files/index.ts](index.ts).
- `window.alert / confirm / prompt`. Use [components/ui/alert-dialog](../../components/ui/alert-dialog.tsx).
- `Dialog` on mobile. Branch via `useIsMobile()` to `Drawer`.
- `h-screen` / `vh` under `app/(a)/files/` — use `dvh`, `--header-height`, `pb-safe`.
- Hardcoded paths. Use [features/files/utils/path.ts](utils/path.ts).
- `Set` in Redux state. Use `FieldFlags<K>` from [features/agents/redux/shared/field-flags.ts](../agents/redux/shared/field-flags.ts).
- Directly importing core components from `components/core/FileTree/internal/*`. Consume from the barrel.
- Calling the REST API without a `requestId`. The realtime middleware will not be able to dedup, and you will see visual flicker.

---

## When something breaks

| Symptom | Likely cause |
|---|---|
| Optimistic update flickers/reverts after a second | Missing `requestId` on the REST write. Realtime echo is overwriting state. |
| Uploads succeed but don't appear in tree | Realtime middleware not attached. Check `<CloudFilesRealtimeProvider>` is mounted under the user-scoped layout. |
| Signed URL returns 403 | Expired. Use `useFileSrc` (the handler's expiry-wheel auto-refreshes). Never cache raw signed URLs across mounts. |
| Tree shows stale state after reconnect | `reconcileTree()` dispatch missing from the realtime middleware's `SUBSCRIBED`-after-error handler. |
| Type error on `CloudFile.metadata` | You're using an inline type somewhere. Delete it and import from [types.ts](types.ts). |
| 413 on upload | File >tier cap (or >100MB free). For >100MB uploads, use the TUS endpoint at `/files/upload/tus` (shipped 2026-05-05 — see [from_python/UPDATES.md](from_python/UPDATES.md) Bundle E2). |

---

## Change-log expectations

After any non-trivial change:

1. Update [FEATURE.md](FEATURE.md) — architecture sections, invariants, status.
2. Append to the bottom of [FEATURE.md](FEATURE.md) change log with date + one-line summary.
3. If you asked the Python team anything new, log it in [for_python/REQUESTS.md](for_python/REQUESTS.md). When the Python team ships something, the resolution lands in [from_python/UPDATES.md](from_python/UPDATES.md) and the matching entry in REQUESTS.md flips to 🟢 resolved.

Treat docs as weight-equal to code. Stale docs cascade across every future agent touching this system.
