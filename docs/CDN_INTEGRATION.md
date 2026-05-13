# CDN Integration — Frontend

**Status:** Cloudflare provisioning is **LIVE in production**. Two-bucket architecture is up.
Backend is **deployed and verified** end-to-end. Most FE plumbing has already been wired by
the backend team (see [§ What's already done in this repo](#whats-already-done-in-this-repo))
— the remaining FE work is small UX polish.

This doc covers: **what changed on the wire**, **what's already wired**,
**what's still left for you**, and **a code cookbook** with copy-pasteable snippets.

---

## TL;DR

- The server now decides per-file whether the URL it returns is a long-lived
  **CDN URL** (for `visibility="public"` files) or a 1-hour **AWS-signed URL**
  (for `visibility="private"` and `"shared"`).
- **You always render the URL the server gave you.** Don't construct URLs
  from `file_id`. Don't strip query strings. Don't guess based on filename.
- New canonical field on `CloudFile`: **`publicUrl: string | null`**. CDN URL
  when public, `null` otherwise.
- Existing code keeps working — `useSignedUrl(file.id)` returns a CDN URL
  automatically for public files. The new `publicUrl` field exists so you
  can render directly without a round-trip when the data is already in
  Redux state.

---

## Production architecture (one paragraph)

Two S3 buckets in `us-east-2`:
- `matrx-user-files` — fully private, Block Public Access ON. Holds
  everything `visibility="private"` or `"shared"`.
- `cdn.matrxserver.com` — public-read, fronted by Cloudflare at
  `https://cdn.matrxserver.com`. Holds everything `visibility="public"`.

Cloudflare CDN: 1y edge / 1y browser cache, full query string included
in the cache key (so `?v=<checksum>` works perfectly for content invalidation).
Manual purge fires server-side on delete + visibility-flip-to-private.

URL shape that goes to the FE: `https://cdn.matrxserver.com/<owner_id>/<file_path>?v=<checksum[:8]>`.

---

## What changed on the wire

### 1. Upload response (`POST /files/upload`, `POST /files/finalize-upload`)

Two new fields, both optional. Existing `url` is still authoritative:

```jsonc
// Public upload — CDN URL
{
  "file_id": "...",
  "file_path": "uploads/foo.png",
  "storage_uri": "s3://cdn.matrxserver.com/<owner>/uploads/foo.png",
  "checksum": "abc123...",
  "url":     "https://cdn.matrxserver.com/<owner>/uploads/foo.png?v=abc12345",
  "cdn_url": "https://cdn.matrxserver.com/<owner>/uploads/foo.png?v=abc12345",
  "is_new": true
}

// Private upload — AWS-signed URL
{
  "file_id": "...",
  "file_path": "uploads/foo.png",
  "storage_uri": "s3://matrx-user-files/<owner>/uploads/foo.png",
  "checksum": "abc123...",
  "url":     "https://matrx-user-files.s3.amazonaws.com/...?X-Amz-Signature=...",
  "cdn_url": null,
  "is_new": true
}
```

### 2. `FileRecord` (`GET /files/{id}`, `GET /files`, listings, etc.)

One new field: `public_url: string | null` (snake_case on wire; the
converter maps it to `publicUrl` on `CloudFile`).

### 3. `GET /files/{id}/url`

- Public + CDN configured → returns CDN URL (no real expiry; `expires_in`
  is still echoed back but is meaningless for the CDN URL).
- Private/shared → returns AWS-signed URL valid for the requested window.

### 4. `GET /files/{id}/download`

- Public → 302 redirect to the CDN URL. `<img src="/files/{id}/download">`
  still works; the browser follows transparently.
- Private/shared → unchanged, streams bytes directly.

### 5. `GET /share/{token}` and `GET /share/{token}/download`

- File is public → CDN URL (no expiry) / 302 to CDN.
- File is private/shared → AWS-signed URL (1h) / streams bytes.

### 6. Cache-busting query string

All public CDN URLs carry `?v=<8-char-hex>` derived from the file's
SHA-256 checksum. **Do not strip this.** Content change → new
checksum → new URL → cache miss → fresh bytes. This is how immediate
global invalidation works without an explicit purge call.

---

## What's already done in this repo

The CDN integration was wired alongside the backend rollout. As of
this doc:

| File | Change |
|---|---|
| `types/python-generated/api-types.ts` | OpenAPI types regenerated — `FileRecord.public_url`, `FileUploadResponse.cdn_url` are present. |
| `features/files/types.ts` | `CloudFile.publicUrl: string \| null` added with a doc-comment explaining the contract. |
| `features/files/redux/converters.ts` | `apiFileRecordToCloudFile` maps `row.public_url` → `publicUrl`. `dbRowToCloudFile` defaults to `null` (DB has no public_url column — it's server-computed). |
| `features/files/redux/slice.ts` | `emptyFileRecord` initialises `publicUrl: null`. |
| `features/files/redux/thunks.ts` | Tree-spine reconstruction defaults `publicUrl: null` for synthesised entries. |
| `features/files/components/core/MediaThumbnail/MediaThumbnail.tsx` | Prefers `file.publicUrl` when present and renders directly; falls back to `useSignedUrl(file.id)` when `null`. **Saves one API round-trip per public-image thumbnail.** |

`pnpm type-check` is clean for these files.

---

## What's still left for you (UX polish)

### A. Share-modal — surface CDN URL directly for public files

When the user clicks "Get share link" on a file that is already public,
the CDN URL is its share link — no `/share/{token}` round-trip needed.

```ts
import type { CloudFileRecord } from "@/features/files/types";

function getShareUrl(file: CloudFileRecord): string | Promise<string> {
  // Public file with CDN configured → permanent URL, no token needed.
  if (file.visibility === "public" && file.publicUrl) {
    return file.publicUrl;
  }
  // Private/shared → existing /share/{token} flow.
  return createShareLink(file.id).then(link => link.share_url);
}
```

In the share-modal UI:
- Hide the "expires in 1h" badge when `file.publicUrl` is present.
- Hide the "create share link" button when `file.publicUrl` is present
  (the URL is the share — no token to create).
- Keep both flows for private/shared files.

### B. Visibility-toggle — refresh after PATCH

When the user flips a file from private → public (or back) via
visibility settings:

```ts
const result = await dispatch(
  patchFile({ fileId, body: { visibility: "public" } }),
).unwrap();
// `result` is the updated CloudFileRecord with the new publicUrl,
// updated storageUri (different bucket now), and updated visibility.
// The thunk already calls upsertFile() so Redux state is fresh.
// Just make sure your component re-reads from the store — don't hold
// the OLD URL in local component state across the toggle.
```

**Failure mode if you skip this**: an `<img src="…">` whose `src` was
captured BEFORE the toggle keeps the old URL in the DOM. After
public→private, the server purges Cloudflare for that URL and the
`<img>` 404s. Solution: render off the latest record from the store.

### C. Delete UX

When a file is deleted, the server purges its CDN URL automatically.
Re-fetch your file list (or rely on the existing `removeFile` action)
to drop it from the UI. Any `<img>` still pointing at the deleted
URL will start 404'ing within seconds.

### D. Things you should NOT do

- ❌ Don't construct CDN URLs from `file_id` or `filePath`. The server
  is the only thing that knows `<owner>/<path>?v=<checksum>` correctly.
- ❌ Don't strip `?v=<checksum>` query strings. They're cache-busters,
  not tracking params.
- ❌ Don't cache `useSignedUrl()` results in IndexedDB / localStorage.
  Signed URLs expire. Always read the latest from Redux.
- ❌ Don't infer "is this CDN" by string-matching the URL. Read
  `file.publicUrl` (presence = CDN-eligible, null = use signed URL).
- ❌ Don't block on visibility-toggle UI feedback. The PATCH does an
  S3 cross-bucket copy + DB update; ~100–300ms typical. Show a
  loading state, await the response, then re-render.

---

## Default-visibility policy

**Pick visibility based on render context, not user role.** A logo is
public because pages render it for unauthenticated visitors — not
because the user uploading it is special. A chat attachment is private
because only the conversation participants need it.

The source of truth lives in
[`features/files/utils/folder-conventions.ts`](../features/files/utils/folder-conventions.ts)
(`resolveDefaultVisibility(folderPath)`). Use it whenever a caller
hasn't picked visibility explicitly:

| Folder prefix | Default | Why |
|---|---|---|
| `App Assets/` | `public` | Static app assets (sounds, hero images, demo data) — rendered globally, want CDN URLs. |
| `Images/Avatars/` | `public` | Profile pictures rendered on public profile pages. |
| `Audio/Podcasts/` | `public` | Podcast covers and audio render publicly. |
| `Agent Apps/` | `public` | App icons render in public app catalog. |
| `Shared Assets/` (incl. `feedback-images/`) | `public` | Cross-user shared content; admin-team review surfaces. |
| `Images/Generated/` | `private` | AI-generated images — user opts in to public via Image Studio toggle. |
| `Chat Attachments/` | `private` | Per-conversation context. |
| `Task Attachments/` | `private` | Task-scoped. |
| `Slack Imports/`, `Scraped Content/` | `private` | User-owned, may contain sensitive data. |
| `Private Assets/` | `private` | Explicit user choice. |
| `.matrx-tmp/` | `private` | Ephemeral; deleted after use. |
| anything else | `private` | Safe default — make it explicit if you mean public. |

### Two upload-helper conventions

- **`useFileUpload({ visibility })`** (cloud-files thunk) — pass
  `visibility` directly when you have the choice. No default beyond
  `"private"`.
- **`useFileUploadWithStorage(bucket, path)`** (legacy compat) — the
  bucket name resolves to a default visibility:
  `user-public-assets` → `"public"`, anything else → `"private"`.
  `uploadToPublicUserAssets` / `uploadToPrivateUserAssets` are
  explicit and ignore the bucket-derived default.

### Preset-variant image uploads — `POST /assets` (Python)

The canonical asset endpoint on the Python backend. Called from the FE
via `features/files/api/assets.ts` (`uploadAsset()`) and the
`useFileAsset` hook; this is what `<ImageAssetUploader>` POSTs to.

Defaults to `visibility=public` because every preset (avatar, logo,
og, cover, social, favicon, square) is meant for a public surface.
Pass `visibility=private` (or `shared`) on the request to override.
For public uploads the response carries direct CDN URLs (no
`/share/{token}` redirect hop); for private/shared, stable share-link
URLs.

> The legacy Next.js+Sharp route at `/api/images/upload` (which used
> to fan out variants in Node before forwarding to Python) was deleted
> on 2026-05-12 — the FE now goes straight to `POST /assets`.

### Image Studio save

Defaults to `private` — generated images are user-scoped by default.
The Save panel exposes a "Make publicly viewable" checkbox; checking
it threads `visibility: "public"` through `studio.saveAll` so each
variant gets a permanent CDN URL safe to share.

---

## Code cookbook

### Render an image thumbnail (already done in `MediaThumbnail`)

```tsx
import { useSignedUrl } from "@/features/files/hooks/useSignedUrl";
import type { CloudFile } from "@/features/files/types";

function ImageThumbnail({ file }: { file: CloudFile }) {
  // Permanent CDN URL when public — no API call needed.
  // Fall back to a 1h signed URL otherwise.
  const cdnUrl = file.publicUrl ?? null;
  const { url: signedUrl } = useSignedUrl(cdnUrl ? null : file.id, {
    expiresIn: 3600,
  });
  const url = cdnUrl ?? signedUrl;
  if (!url) return <Skeleton />;
  return <img src={url} alt={file.fileName} />;
}
```

### Render a download link

```tsx
function DownloadLink({ file }: { file: CloudFile }) {
  // Server handles routing: /files/{id}/download 302s to CDN for public,
  // streams bytes directly for private/shared. Just hit the same endpoint.
  return (
    <a href={`/api/files/${file.id}/download`} download={file.fileName}>
      Download
    </a>
  );
}
```

### Show a "copy share link" button

```tsx
async function copyShareUrl(file: CloudFileRecord) {
  let url: string;
  if (file.visibility === "public" && file.publicUrl) {
    url = file.publicUrl;            // Permanent CDN URL.
  } else {
    // Private/shared: create a share-link token via existing flow.
    const link = await createShareLink(file.id);
    url = link.share_url;
  }
  await navigator.clipboard.writeText(url);
  toast.success("Link copied");
}
```

### Send a chat attachment with a media reference

The boundary normaliser at AI Dream resolves either form to bytes:

```jsonc
{
  "role": "user",
  "content": [
    { "type": "text", "text": "Describe this" },
    { "type": "image", "file_id": "abc-..." }                      // canonical (preferred)
    // OR
    { "type": "image", "url": "https://cdn.matrxserver.com/..." }  // also fine
  ]
}
```

**FE rule**: prefer `file_id`. If you only have a URL, send `url`.
Don't send both — the server's `MediaRef` validator rejects payloads
with multiple identifiers (422).

---

## Reference: server-side architecture

(For the curious — this doesn't affect FE code.)

- **Cloudflare** sits in front of the dedicated public S3 bucket
  `cdn.matrxserver.com`. CNAME points at the regional path-style S3
  endpoint with the original Host header preserved (Free-tier setup —
  no Origin Rules / Workers / Enterprise plan needed).
- **SSL/TLS mode is "Full"** between CF and S3 (not Strict, due to a
  cert-mismatch with dotted bucket names — known + accepted trade-off).
- **Bucket policy** allows `s3:GetObject` to `Principal: "*"` on the
  ENTIRE public bucket. The default bucket stays 100% private.
- **Cache-busting** via `?v=<checksum[:8]>`. CF cache key includes the
  full query string — content change = new URL = cache miss.
- **Explicit purge** fires server-side on delete and on
  visibility-flip-to-private (the only two cases where the same URL
  should stop serving the same bytes).
- **Boundary normaliser** at AI Dream recognises CDN URLs as ours and
  resolves them via DB lookup → bytes from S3 (or in-memory cache).
  Never re-fetches via HTTP.

---

## Backend reference (where this lives in aidream)

- `aidream/api/routers/files.py` — routes
- `aidream/api/utils/cdn_purge.py` — Cloudflare purge client
- `aidream/api/config.py` — settings (`cdn_public_base_url`,
  `aws_s3_public_bucket`, `cloudflare_api_token`, `cloudflare_zone_id`)
- `packages/matrx-utils/.../cloud_sync/cdn.py` — `public_url_for(record)`
  is the single source of truth for "should this file get a CDN URL?"
- `packages/matrx-utils/.../cloud_sync/sync_engine.py` —
  `change_visibility_async` (cross-bucket S3 copy) for the
  visibility-flip flow
- `scripts/migrate_public_files_to_cdn_prefix.py` — one-shot backfill
  for any pre-existing `visibility=public` files
