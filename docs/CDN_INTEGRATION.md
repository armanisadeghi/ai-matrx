# CDN + durable file URLs (frontend contract)

> **Rewritten 2026-08-26 for the platform-wide durable-URL cutover** ("Nothing
> should ever return signed URLs"). The previous version of this document
> described a `useSignedUrl` hook and 1-hour AWS-signed URLs — both are gone.
> Canonical cross-repo doctrine:
> `/Users/armanisadeghi/code/common-docs/systems/media/media-durability/FEATURE.md`.

## The URL contract

Every `FileRecord` / file envelope carries a DURABLE URL set. None of them
expire; each contains only the file id:

| Field          | What it is                                                            |
| -------------- | --------------------------------------------------------------------- |
| `url`          | Canonical renderable URL. CDN when public, else `{base}/files/{id}/download?inline=1`. |
| `cdn_url`      | Permanent CDN URL — public files only, no auth.                       |
| `download_url` | `{base}/files/{id}/download` — attachment disposition.                |

`GET /files/{id}/url` is deleted. There is no mint step, no TTL, no refresh.

## How private URLs authenticate

- `fetch()` through `lib/python-client.ts` attaches `Authorization: Bearer`.
- Plain `<img>` / `<video>` / `<audio>` bindings and top-level navigations ride
  the HttpOnly `mx_files_session` cookie, established by
  `ensureFilesSession()` (`features/files/handler/session.ts`) via
  `POST /files/session` at auth bootstrap. The backend accepts the cookie ONLY
  on GET byte routes.
- A bare `fetch(durableUrl)` outside the python-client sends neither — use
  `Files.downloadFile` / `useFileBlob` for byte reads.

## How to render a file

- With a `file_id` / `MediaRef`: `<InlineMediaRef>` or
  `useFileSrc({ kind: "file_id", fileId })` — resolves CDN for public files,
  the durable inline URL otherwise.
- With only a URL string baked into content: `useDurableSrc(url)` — on load
  failure it refreshes the file session once and retries the SAME URL.
- Building a URL from an id: `fileUrls(fileId)` in
  `features/files/handler/utils/python-base.ts` — THE single durable URL
  builder. Prefer binding the server-provided `url` / `download_url` when an
  envelope is in hand.

## CDN specifics

- Public files get a permanent Cloudflare-fronted `cdn_url` with a
  `?v=<checksum>` cache-buster — do not strip the query string.
- A visibility flip to/from public changes what the server emits on the next
  read; the file id remains the identity throughout.

## Legacy signed URLs

Old rows can still carry AWS-signed URLs (SigV2/SigV4). `isSignedUrl` /
`SIGNED_URL_RE` in `lib/media/signed-url.ts` classify them so they are never
treated as permanent, never persisted, and never cached (the blob-cache
service worker mirrors the regex). Nothing mints new ones.
