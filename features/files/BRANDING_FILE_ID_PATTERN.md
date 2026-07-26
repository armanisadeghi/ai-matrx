# Branding images: store `file_id`, render via `file_id`

> **Never persist a resolved upload URL as the source of truth for an image.**
> Store the durable cld_files `file_id` and re-resolve the URL at render time.

## Why

A resolved URL (`Asset.primary_url`, `variant.url`, a `cdn.matrxserver.com/...`
string) is a **snapshot**. It encodes the server's storage key scheme *at the
moment of upload*. The instant the server changes how it mints URLs — a CDN host
swap, a bucket move, a path-key → file-id-key migration, a visibility change —
every previously-captured URL string silently rots. The image either 404s,
redirects to an S3 error page, or downloads instead of rendering.

This actually happened: three organizations uploaded logos at three different
times and ended up with three incompatible URL formats, the newest of which was
the most broken. Root cause: `organizations.logo_url` stored a frozen string
instead of a `file_id`.

A `file_id` is **stable**. `GET /files/{id}/asset` always returns a fresh,
correctly-routed URL (public CDN vs. signed-inline), no matter how the storage
layer evolves underneath it.

## The pattern (5 steps)

For any feature that lets a user upload a branding image (logo, avatar, app/applet
image, favicon, cover, …):

1. **Type** — add a `<thing>FileId?: string | null` next to the existing
   `<thing>Url`. Keep the URL field as a back-compat fallback (and for external
   URLs that have no `file_id`).

2. **Capture** — the uploader result already carries `file_id`. Capture BOTH:
   ```tsx
   onComplete={(result) => {
     setLogoUrl(result?.primary_url ?? "");
     setLogoFileId(result?.file_id ?? "");   // "" for pasted external URLs
   }}
   ```

3. **Persist** — write `<thing>_file_id` alongside `<thing>_url`. Only persist
   the id when it's truthy (external/library URLs surface `file_id === ""`).

4. **Read** — map the DB `<thing>_file_id` back into your app shape.

5. **Render** — prefer the id; fall back to the url:
   ```tsx
   import { InlineMediaRef, useFileAsset } from "@/features/files";

   // inline <img>:
   <InlineMediaRef ref={logoFileId ? { file_id: logoFileId } : logoUrl} />

   // a "view"/href that needs a URL string:
   const { primaryUrl } = useFileAsset(logoFileId || undefined); // null-safe no-op
   const effectiveUrl = primaryUrl ?? (logoUrl || "");
   ```

## Reference implementation

`features/organizations/` — the org logo, end to end:
- `types.ts` (`logoFileId`), `service.ts` (write `logo_file_id`, read it back),
  `components/GeneralSettings.tsx` + `CreateOrgModal.tsx` (capture + render).

The same pattern is applied to user avatar (`features/user-profile/`),
app/applet image (`lib/redux/app-builder/`), and prompt-app favicon
(`features/prompt-apps/`).

## The guardrail

`scripts/check-doctrine.ts` flags any new `.primary_url` capture in a diff and
points back here. Run `pnpm check:doctrine` (advisory) — it asks "did you also
store the `file_id`?" whenever a resolved upload URL is captured outside the
`features/files` infrastructure.

## What's NOT in scope

External image URLs that aren't ours (Unsplash, Filestack, a user-pasted
`https://…`) have no cld_files `file_id`. They keep using the URL field — that's
the fallback's whole job. Don't try to manufacture a `file_id` for them.
