# Branding images — store the `file_id`, not the URL

> **Never persist a resolved upload URL as the durable reference for an image.** Store the durable `files.files` `file_id` and re-resolve the URL at render time. Rationale and the incident behind it: `/Users/armanisadeghi/code/common-docs/systems/media/file-service/DECISIONS.md` § Identity and URLs.

Applies to every user-uploaded branding image: org logo, user avatar, app image, favicon, cover.

1. **Type** — add `<thing>FileId?: string | null` next to the existing `<thing>Url`. Keep the URL
   field: it is the back-compat fallback and the home for external URLs that have no `file_id`.
2. **Capture** — the uploader result carries both: `setLogoUrl(result?.primary_url ?? "")` and
   `setLogoFileId(result?.file_id ?? "")`. A pasted external URL yields `""`.
3. **Persist** — write `<thing>_file_id` alongside `<thing>_url`, **only when truthy**. Do not try to
   manufacture a `file_id` for an external URL.
4. **Read** — map the DB `<thing>_file_id` back into the app shape.
5. **Render** — prefer the id, fall back to the url:
   `<InlineMediaRef ref={logoFileId ? { file_id: logoFileId } : logoUrl} />`
   (`@/features/files/components/inline/InlineMediaRef`). For href/"view" cases use
   `useFileAsset` (`@/features/files/hooks/useFileAsset`), which is a null-safe no-op:
   `const { primaryUrl } = useFileAsset(logoFileId || undefined);`
   `const effectiveUrl = primaryUrl ?? (logoUrl || "");`

Reference implementation end-to-end: `features/organizations/` (`types.ts`, `service.ts`,
`components/GeneralSettings.tsx`, `components/CreateOrgModal.tsx`). Same pattern in
`features/user-profile/` and `features/prompt-apps/`.

Guardrail: `pnpm check:doctrine` (`scripts/check-doctrine.ts`) flags any new `.primary_url` capture
outside `features/files` and points back here.
