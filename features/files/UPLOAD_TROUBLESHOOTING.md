# File Upload Troubleshooting

> If uploads fail in the app, this is the playbook.

---

## The single upload primitive

Every file flow goes through the **universal file handler** exposed by
`@/features/files`. There is one upload primitive — anything else is wrong.

```ts
import { useFileUpload } from "@/features/files/handler/hooks/useFileUpload";

const { upload, uploading, progress, error } = useFileUpload();

const normalized = await upload(
  { kind: "file", file },
  {
    folderPath: "Images",
    visibility: "private",
    createShareLink: true,                 // optional; sets shareToken on result
    shareLinkPermissionLevel: "read",      // optional; "read" by default
  },
);

// normalized.fileId       — cld_files UUID
// normalized.url          — best display URL (CDN > share link > signed)
// normalized.shareToken   — set when createShareLink was true
// normalized.meta.mime    — sniffed/derived MIME
```

For one-off uploads outside React (thunks, server code), call the handler
directly:

```ts
import { fileHandler } from "@/features/files/handler/handler";

const normalized = await fileHandler.upload(
  { kind: "blob", blob, fileName: "screenshot.png" },
  { folderPath: "Inbox/Pasted" },
);
```

For server-side routes (Next.js API handlers operating on cld_files), use
`Api.Server.uploadAndShare` with a server context built from the user's
session JWT — see `features/files/api/server-client.ts`.

---

## How to diagnose a failure

1. **Check the Error subclass.** The handler throws specific errors from
   `@/features/files/handler/errors`:
   - `FileUploadError` — generic upload failure (wraps backend message)
   - `FileAccessDeniedError` — auth/RLS denied the request
   - `FileExpiredError` — signed URL aged out (the resolver auto-refreshes,
     so this rarely surfaces; if it does, the file is fine, just retry)
   - `FileNotFoundError` — fileId missing from cld_files
   - `FileDeletedError` — file is in trash

2. **Read the message.** Common patterns:
   - `Failed to fetch` → backend unreachable (CORS, network, server down).
   - `HTTP 401` → JWT missing or expired; refresh the session.
   - `HTTP 413` → file too large (current cap 100 MB).
   - `HTTP 403` → RLS / permissions.
   - `cloud_sync_unavailable` → `NEXT_PUBLIC_BACKEND_URL_*` env not set.
   - `File uploaded but share link couldn't be created: ...` → upload
     succeeded; the post-upload share-link create failed.

3. **Confirm the backend is up.** Hit `{BACKEND}/health` from a curl. If
   the server is fine but uploads still fail, it's a JWT or CORS issue.

---

## What's forbidden

- **`supabase.storage.from(...).upload(...)`** — banned. ESLint catches the
  call shape; the handler is the only valid path.
- **`fetch("/api/files/...")`, `fetch("/api/share/...")`, etc.** — Next.js
  has no file routes. Files go directly browser ↔ Python.
- **Direct `Files.uploadFile` (the typed Python client)** outside
  `features/files/handler/` and `features/files/upload/`. Always go through
  `fileHandler.upload(...)`.
- **Custom retry/queue layers around uploads.** The handler already
  handles progress, dispatches optimistic Redux updates, and emits typed
  errors.

If you find code using any of these, fix it or open a ticket.

---

## Backend-side things this doc CAN'T fix

These need the Python team or admin involvement:

- **CORS** must permit `Origin: http://localhost:3000` (dev) and your
  prod origins on every `/files/*` endpoint plus `/health`. Headers:
  `Authorization`, `Content-Type`, `X-Request-Id`. Methods: GET / POST /
  PATCH / DELETE / OPTIONS.
- **`NEXT_PUBLIC_BACKEND_URL_PROD` / `_LOCAL`** must be set in the
  appropriate `.env` files / Vercel env config.
- **Realtime publication** must include `cld_share_links` (see
  `HANDOFF.md` for the SQL).

The cloud-files diagnostic page (`/ssr/demos/cloud-files-debug`) shows
the active URL + JWT and fires raw fetches against the backend — use
that to confirm the server is up and reachable BEFORE blaming the
upload code.
