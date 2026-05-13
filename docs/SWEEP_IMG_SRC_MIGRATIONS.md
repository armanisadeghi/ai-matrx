# `<img src>` → `<InlineMediaRef>` migration list

> Canonical component: `features/files/components/inline/InlineMediaRef.tsx`
> MediaRef shape + builders: `features/files/types.ts` (`MediaRef`) and
> `features/files/redux/converters.ts` (`cloudFileToMediaRef`, `fileIdToMediaRef`,
> `urlToMediaRef`, `fileUriToMediaRef`).
>
> `<InlineMediaRef>` accepts `MediaRef | string | null`. A plain URL string is
> treated as `kind: "external_url"`; a bare UUID string is treated as `kind:
> "file_id"`. Use `{ url }` literal as the `ref` prop is fine for migrations
> that currently pass a raw URL — but anywhere we know a `file_id`, prefer
> passing it as a UUID string or `{ file_id }` so the handler can route
> through the auto-refresh / CDN preference path.

## Summary

- Total candidates examined (live repo, worktrees excluded): **~140 files / ~200 `<img>` occurrences**
- **High-confidence migrations (just swap)**: **27** — single `<img>`, clean ref shape, no custom loader/error UI past the standard `(url ? <img/> : <Icon/>)` fork that `<InlineMediaRef>` already does internally.
- **Medium-confidence migrations (verify ref shape first)**: **12** — usually because the URL is an `image_url` field on a generic Resource shape that may sometimes be external/pasted and sometimes a cld_files-issued URL, or because the surrounding component still owns a hand-rolled loading state.
- **Skip (out of scope or already canonical)**: bulk of remaining occurrences — external search/scrape APIs (Brave, NewsAPI, Unsplash, scraper), markdown-image renderers, data: URLs, `URL.createObjectURL()` blobs, static `public/` assets, image-studio in-progress edits, the canonical FilePreview / MediaThumbnail / InlineMediaRef themselves, and screenshot-context demos.

The high-confidence batch is the sweep we should execute first. Everything below uses **repo-relative paths**.

---

## High-confidence migrations (just swap)

These are textbook `(url ? <img …/> : <Icon/>)` thumbnails / tile previews / avatar tiles. `<InlineMediaRef>` covers both the present-state (renders the image) and the fallback (renders an icon). Use `fallback="icon"` with an explicit `fallbackIcon={<X />}` where the current code uses a non-default icon (Mic, Music, Building2, etc.).

| File | Line | Current pattern | Proposed `<InlineMediaRef>` call |
| --- | --- | --- | --- |
| `features/podcasts/components/admin/PodcastsTable.tsx` | 199 | `<img src={show.image_url} alt="" className="w-7 h-7 rounded object-cover shrink-0" />` (inside `{show.image_url ? … : <Mic …/>}`) | `<InlineMediaRef ref={show.image_url ?? null} size={{width:28,height:28}} fit="cover" rounded="md" fallbackIcon={<Mic className="h-3.5 w-3.5 text-muted-foreground"/>} className="shrink-0" alt="" />` |
| `features/podcasts/components/admin/PodcastsTable.tsx` | 257 | `<img src={ep.image_url} alt="" className="w-7 h-7 rounded object-cover shrink-0" />` (inside `{ep.image_url ? … : <Music …/>}`) | `<InlineMediaRef ref={ep.image_url ?? null} size={{width:28,height:28}} fit="cover" rounded="md" fallbackIcon={<Music className="h-3.5 w-3.5 text-muted-foreground"/>} className="shrink-0" alt="" />` |
| `features/podcasts/components/admin/ShowDetailClient.tsx` | 154 | `<img src={show.image_url} alt="" className="w-8 h-8 rounded object-cover shrink-0" />` (inside `{show?.image_url && …}`) | `<InlineMediaRef ref={show?.image_url ?? null} size={{width:32,height:32}} fit="cover" rounded="md" fallback={null} className="shrink-0" alt="" />` |
| `features/podcasts/components/admin/ShowDetailClient.tsx` | 278 | `<img src={(ep.thumbnail_url ?? ep.image_url)!} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />` (inside `{(ep.thumbnail_url ?? ep.image_url) ? … : <Music …/>}`) | `<InlineMediaRef ref={(ep.thumbnail_url ?? ep.image_url) ?? null} size={{width:40,height:40}} fit="cover" rounded="lg" fallbackIcon={<Music className="h-4 w-4 text-muted-foreground"/>} className="shrink-0" alt="" />` |
| `features/podcasts/components/admin/ShowsClient.tsx` | 220 | `<img src={show.image_url} alt="" className="w-8 h-8 rounded object-cover shrink-0" />` (inside `{show.image_url ? … : <Mic …/>}`) | `<InlineMediaRef ref={show.image_url ?? null} size={{width:32,height:32}} fit="cover" rounded="md" fallbackIcon={<Mic className="h-4 w-4 text-muted-foreground"/>} className="shrink-0" alt="" />` |
| `features/podcasts/components/player/PodcastShowPage.tsx` | 140 | `<img src={(ep.thumbnail_url ?? ep.image_url ?? coverImage)!} alt={ep.title} className="w-14 h-14 rounded-xl object-cover shadow-sm" loading="lazy" decoding="async" onError={…hide} />` | `<InlineMediaRef ref={(ep.thumbnail_url ?? ep.image_url ?? coverImage) ?? null} size={{width:56,height:56}} fit="cover" rounded="lg" fallback={null} className="shadow-sm" alt={ep.title} />` |
| `features/podcasts/components/player/PodcastAudioPlayer.tsx` | 279 | `<img src={coverImageUrl} alt={title ?? "Podcast cover"} className="w-16 h-16 rounded-xl object-cover shrink-0 shadow-md" />` (inside `{coverImageUrl ? … : <Music …/>}`) | `<InlineMediaRef ref={coverImageUrl ?? null} size={{width:64,height:64}} fit="cover" rounded="lg" fallbackIcon={<Music className="h-8 w-8 text-primary"/>} className="shrink-0 shadow-md" alt={title ?? "Podcast cover"} />` |
| `app/(a)/podcast/PodcastGrid.tsx` | 36 | `<img src={show.thumbnail_url ?? show.image_url} alt={show.title} className="relative z-10 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" loading="lazy" decoding="async" onError={…hide} />` (foreground tile inside `{show.image_url ? <>blur+thumb</> : <Mic …/>}`) | `<InlineMediaRef ref={(show.thumbnail_url ?? show.image_url) ?? null} size={{width:0,height:0}} fit="cover" rounded="none" fallback={null} className="relative z-10 w-full h-full transition-transform duration-300 group-hover:scale-105" alt={show.title} />` — note: keep the existing blurred backdrop `<img>` (line 28) as-is since it intentionally bypasses any wrapper sizing. **Open Q**: does the component need to stretch to its parent? See "Open questions" §A. |
| `features/organizations/components/OrganizationCard.tsx` | 140 | `<img src={organization.logoUrl} alt={organization.name} className="w-full h-full object-cover rounded-lg" />` (inside `{organization.logoUrl ? … : <Building2 …/>}`) | `<InlineMediaRef ref={organization.logoUrl ?? null} size={{width:48,height:48}} fit="cover" rounded="lg" fallback={null} alt={organization.name} />` — already wrapped in a sized container; let parent control box. |
| `features/organizations/components/OrgSidebar.tsx` | 147 | `<img src={org.logoUrl} alt="" className="w-full h-full object-cover rounded" />` (inside `{org.logoUrl ? … : <Building2 …/>}`) | `<InlineMediaRef ref={org.logoUrl ?? null} size={{width:24,height:24}} fit="cover" rounded="sm" fallback={null} alt="" />` |
| `features/organizations/components/GeneralSettings.tsx` | 305 | `<img src={organization.logoUrl} alt={organization.name} className="w-16 h-16 rounded-lg object-cover border" />` (inside `{organization.logoUrl ? … : <placeholder/>}`) | `<InlineMediaRef ref={organization.logoUrl ?? null} size={{width:64,height:64}} fit="cover" rounded="lg" border="subtle" fallback={null} alt={organization.name} />` |
| `app/(authenticated)/org/[slug]/page.tsx` | 215 | `<img src={organization.logoUrl} alt={organization.name} className="w-20 h-20 md:w-24 md:h-24 rounded-xl object-cover border-2 border-border shadow-sm" />` (inside `{organization.logoUrl && …}`) | `<InlineMediaRef ref={organization.logoUrl ?? null} size={{width:96,height:96}} fit="cover" rounded="lg" border="subtle" fallback={null} className="md:w-24 md:h-24 border-2 shadow-sm" alt={organization.name} />` — note: md-breakpoint size jump can't be expressed in `size` numerically; either keep on the wrapper or drop the larger size. See "Open questions" §B. |
| `app/(authenticated)/invitations/accept/[token]/page.tsx` | 315 | `<img src={invitation.organization.logoUrl} alt={invitation.organization.name} className="w-16 h-16 rounded-lg object-cover border" />` (inside `{invitation.organization.logoUrl ? … : <Building2 …/>}`) | `<InlineMediaRef ref={invitation.organization.logoUrl ?? null} size={{width:64,height:64}} fit="cover" rounded="lg" border="subtle" fallback={null} alt={invitation.organization.name} />` |
| `features/applet/builder/previews/AppPreviewCard.tsx` | 76 | `<img src={imageUrl} alt={name || 'App Banner'} className="w-full h-full object-cover" />` (inside `{imageUrl ? <div w-full h-36>…</div> : <placeholder/>}`) | `<InlineMediaRef ref={imageUrl ?? null} size={{width:0,height:0}} fit="cover" rounded="none" fallback={null} className="w-full h-full" alt={name || 'App Banner'} />` — see "Open questions" §A re: zero-sized passthrough. |
| `features/applet/builder/previews/AppletPreviewCard.tsx` | 59 | `<img src={applet.imageUrl} alt={applet.name} className="w-full h-full object-cover" />` (inside `{applet.imageUrl ? <div w-full h-28>…</div> : <placeholder/>}`) | Same shape as above — `<InlineMediaRef ref={applet.imageUrl ?? null} fit="cover" fallback={null} className="w-full h-full" alt={applet.name} />`. |
| `features/applet/builder/modules/smart-parts/apps/SmartAppList.tsx` | 393 | `<img src={app.imageUrl} alt={app.name} className="w-full h-full object-cover" />` (banner image, inside `{viewMode === "grid" && app.imageUrl ? <>img+overlay</> : <placeholder/>}`) | `<InlineMediaRef ref={app.imageUrl ?? null} fit="cover" rounded="none" fallback={null} className="w-full h-full" alt={app.name} />` — keep the sibling gradient overlay div as-is. |
| `features/applet/builder/modules/smart-parts/applets/SmartAppletList.tsx` | 412 | `<img src={applet.imageUrl} alt={applet.name} className="w-full h-full object-cover" />` (identical pattern to row above) | `<InlineMediaRef ref={applet.imageUrl ?? null} fit="cover" rounded="none" fallback={null} className="w-full h-full" alt={applet.name} />` |
| `features/applet/home/main-layout/Grid.tsx` | 95 | `<img src={applet.imageUrl} alt={applet.name} className="w-full h-full object-cover" />` (inside `{applet.imageUrl ? … : <icon/>}`) | `<InlineMediaRef ref={applet.imageUrl ?? null} fit="cover" rounded="none" fallback={null} className="w-full h-full" alt={applet.name} />` |
| `features/applet/home/main-layout/Sidebar.tsx` | 134 | `<img src={appImageUrl} alt={\`${appName} banner\`} className="w-full h-full object-cover" />` (inside `{appImageUrl && <div banner>…</div>}`) | `<InlineMediaRef ref={appImageUrl ?? null} fit="cover" rounded="none" fallback={null} className="w-full h-full" alt={\`${appName} banner\`} />` |
| `components/applet/apps/AppletCard.tsx` | 40 | `<img src={imageUrl} alt={\`${name} thumbnail\`} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />` (default value `'/api/placeholder/400/200'`) | `<InlineMediaRef ref={imageUrl ?? null} fit="cover" rounded="none" fallback="icon" className="w-full h-full transition-transform duration-300 group-hover:scale-105" alt={\`${name} thumbnail\`} />` — if `'/api/placeholder/…'` is a real route, fine; if it's a sentinel, drop the default. |
| `features/cx-chat/components/messages/UserMessage.tsx` | 80 | `<img src={data.url} alt={data.filename \|\| "Attached image"} className="h-10 w-10 object-cover" />` (inside `{isImage && data.url ? … : <placeholder/>}`) | `<InlineMediaRef ref={data.url ?? null} size="sm" fit="cover" rounded="none" fallback={null} alt={data.filename \|\| "Attached image"} />` — `data` is the `resource.data` blob from chat input attachments; URL is normally cld_files-issued. |
| `features/cx-conversation/UserMessage.tsx` | 80 | `<img src={resource.data.url} alt={resource.data.filename \|\| "Attached image"} className="h-10 w-10 object-cover" />` (identical to row above) | `<InlineMediaRef ref={resource.data.url ?? null} size="sm" fit="cover" rounded="none" fallback={null} alt={resource.data.filename \|\| "Attached image"} />` |
| `features/public-chat/components/MessageDisplay.tsx` | 223 | `<img src={resource.data.url} alt={resource.data.filename \|\| "Attached image"} className="h-10 w-10 object-cover" />` (same shape) | `<InlineMediaRef ref={resource.data.url ?? null} size="sm" fit="cover" rounded="none" fallback={null} alt={resource.data.filename \|\| "Attached image"} />` |
| `features/public-chat/components/ChatInputWithControls.tsx` | 253 | `<img src={resource.data.url} alt={resource.data.filename \|\| "Uploaded image"} className="h-16 w-16 object-cover" />` (same shape, larger) | `<InlineMediaRef ref={resource.data.url ?? null} size={{width:64,height:64}} fit="cover" rounded="none" fallback={null} alt={resource.data.filename \|\| "Uploaded image"} />` |
| `features/whatsapp-clone/modals/media/MediaTab.tsx` | 187 | `<img src={renderUrl} loading="lazy" decoding="async" alt={item.caption ?? item.conversationName ?? "Media"} className="h-full w-full object-cover" />` — and the surrounding code already does the lookup: `const signedUrl = useFileSrc(needsSigned ? { kind: "file_id", fileId: item.cloudFileId! } : null); const renderUrl = inlineUrl \|\| signedUrl \|\| "";` | Replace the entire `useFileSrc` + `<img>` block with `<InlineMediaRef ref={item.thumbnailUrl ?? item.url ?? item.cloudFileId ?? null} fit="cover" rounded="none" fallback={null} className="h-full w-full" alt={item.caption ?? item.conversationName ?? "Media"} />` — the component already handles the file_id → URL hop internally. Lose the `inlineUrl \|\| signedUrl` ladder. |
| `features/whatsapp-clone/chat-view/bubbles/ImageBubble.tsx` | 34 | `<img src={src} alt={message.content \|\| "image"} className="block h-auto w-full" />` (inside `{src ? … : <Image unavailable/>}`) | `<InlineMediaRef ref={src ?? null} size={{width:0,height:0}} fit="contain" rounded="md" fallback={null} className="block h-auto w-full" alt={message.content \|\| "image"} />` — wrapper already controls width; keep the unavailable-state fork explicit. |
| `features/whatsapp-clone/modals/media/LinksTab.tsx` | 119 | `<img src={item.previewImageUrl} alt="" className="h-full w-full object-cover" />` (inside `{item.previewImageUrl ? … : <LinkIcon/>}`) | `<InlineMediaRef ref={item.previewImageUrl ?? null} fit="cover" rounded="none" fallback={null} className="h-full w-full" alt="" />` |
| `app/(authenticated)/(admin-auth)/administration/feedback/components/FeedbackTable.tsx` | 184 | `<img src={imageUrls[currentIndex]} alt={\`Screenshot ${currentIndex + 1}\`} className="max-w-full max-h-[80vh] object-contain" />` | `<InlineMediaRef ref={imageUrls[currentIndex] ?? null} size={{width:0,height:0}} fit="contain" rounded="none" fallback={null} className="max-w-full max-h-[80vh]" alt={\`Screenshot ${currentIndex + 1}\`} />` — feedback screenshots are cld_files share URLs. |
| `app/(authenticated)/settings/feedback/page.tsx` | 544 | `<img src={url} alt={\`Screenshot ${i + 1}\`} className="w-full h-full object-cover" />` (inside `<a href={url} …>`) | `<InlineMediaRef ref={url ?? null} fit="cover" rounded="none" fallback={null} className="w-full h-full" alt={\`Screenshot ${i + 1}\`} />` |
| `app/(authenticated)/(admin-auth)/administration/feedback/components/FeedbackDetailDialog.tsx` | 1143 | `<img src={url} alt={\`Screenshot ${index + 1}\`} className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform" />` (inside `<a href={viewHref}>`) | `<InlineMediaRef ref={url ?? null} fit="cover" rounded="none" fallback={null} className="absolute inset-0 w-full h-full group-hover:scale-105 transition-transform" alt={\`Screenshot ${index + 1}\`} />` |
| `app/(authenticated)/(admin-auth)/administration/feedback/components/FeedbackDetailDialog.tsx` | 2250 | `<img src={url} alt={\`Attachment ${idx + 1}\`} className="h-16 w-16 rounded border border-border object-cover" />` (compose-attachment thumbnail) | `<InlineMediaRef ref={url ?? null} size={{width:64,height:64}} fit="cover" rounded="sm" border="subtle" fallback={null} alt={\`Attachment ${idx + 1}\`} />` |
| `app/(authenticated)/(admin-auth)/administration/feedback/components/FeedbackDetailDialog.tsx` | 2453 | (same shape — compose preview row) | Same as above; verify in the file (line 2453 is the compose-history reuse). |
| `app/(authenticated)/(admin-auth)/administration/feedback/components/FeedbackDetailDialog.tsx` | 2478 | (same shape — comment-attachment grid) | Same as above. |
| `features/canvas/social/CanvasShareSheet.tsx` | 130 | `<img src={thumbnailUrl} alt="Social share cover" className="absolute inset-0 w-full h-full object-cover" />` (inside `{thumbnailUrl && …}`) | `<InlineMediaRef ref={thumbnailUrl ?? null} fit="cover" rounded="none" fallback={null} className="absolute inset-0 w-full h-full" alt="Social share cover" />` |
| `features/canvas/social/ShareCoverImagePicker.tsx` | 168 | `<img src={value} alt="Cover preview" className="absolute inset-0 w-full h-full object-cover" />` (inside `{value ? … : uploading/placeholder}`) | `<InlineMediaRef ref={value ?? null} fit="cover" rounded="none" fallback={null} className="absolute inset-0 w-full h-full" alt="Cover preview" />` |
| `features/canvas/social/ShareCoverImagePicker.tsx` | 252 | `<img src={cover.thumbUrl} alt={cover.label} loading="lazy" className="absolute inset-0 w-full h-full object-cover" />` (PRESET_COVERS gallery tiles) | `<InlineMediaRef ref={cover.thumbUrl ?? null} fit="cover" rounded="none" fallback={null} className="absolute inset-0 w-full h-full" alt={cover.label} />` — `thumbUrl` is a static asset path. If we want to skip these for being static, fine; otherwise migrating gives us free fallback handling. |
| `features/image-manager/components/PublicImagesSection.tsx` | 164 | `<img src={cover.thumbUrl} alt={cover.label} loading="lazy" className="absolute inset-0 h-full w-full object-cover" />` (identical PRESET_COVERS tile) | Same as above — `<InlineMediaRef ref={cover.thumbUrl ?? null} fit="cover" rounded="none" fallback={null} className="absolute inset-0 h-full w-full" alt={cover.label} />` |
| `features/window-panels/windows/FeedbackWindow.tsx` | 850 | `<img src={slot.url} alt="Attachment" className="w-full h-full object-cover group-hover:brightness-90 transition-[filter]" />` (inside `{isReady && …}`) | `<InlineMediaRef ref={slot.url ?? null} fit="cover" rounded="none" fallback={null} className="w-full h-full group-hover:brightness-90 transition-[filter]" alt="Attachment" />` — feedback attachment is a cld_files share URL. |
| `features/gallery/components/GalleryFloatingWorkspace.tsx` | 297 | `<img src={fav.thumbUrl} alt={fav.alt} draggable={false} className="w-full aspect-square object-cover" />` (favorites grid tile) | `<InlineMediaRef ref={fav.thumbUrl ?? null} fit="cover" rounded="none" fallback={null} className="w-full aspect-square" alt={fav.alt} />` |
| `features/gallery/components/GalleryFloatingWorkspace.tsx` | 531 | `<img src={thumbUrl} alt={alt} draggable={false} loading="lazy" className="w-full object-cover transition-transform group-hover:scale-[1.02] …" />` (main gallery cards) | `<InlineMediaRef ref={thumbUrl ?? null} fit="cover" rounded="none" fallback={null} className="w-full transition-transform group-hover:scale-[1.02] …" alt={alt} />` |
| `features/agent-apps/route/AgentAppOverviewContent.tsx` | 226 | `<img src={app.favicon_url} alt="" className="w-12 h-12 rounded-lg object-cover" />` (inside `{app.favicon_url ? … : <AppWindow/>}`) | `<InlineMediaRef ref={app.favicon_url ?? null} size={{width:48,height:48}} fit="cover" rounded="lg" fallbackIcon={<AppWindow className="w-7 h-7"/>} alt="" />` |
| `features/agent-apps/components/inputs/AgentAppImageField.tsx` | 127 | `<img src={value} alt="" className="w-full h-full object-cover" />` (inside `{value ? <overlay+img+actions> : <empty>}`) | `<InlineMediaRef ref={value ?? null} fit="cover" rounded="none" fallback={null} className="w-full h-full" alt="" />` — keep the surrounding hover overlay markup; only the inner `<img>` swaps. |
| `app/(a)/images/generate/GenerateShellClient.tsx` | 166 | `<img src={r.public_url} alt={r.cloud_file_id} className="w-full aspect-square object-cover" />` — note: `r.cloud_file_id` is also present in the object | `<InlineMediaRef ref={r.cloud_file_id ?? r.public_url ?? null} fit="cover" rounded="none" fallback="icon" className="w-full aspect-square" alt={r.cloud_file_id} />` — **prefer passing `cloud_file_id`** (UUID) so the handler routes through the auto-refresh path and picks the CDN URL. |
| `features/agents/components/notifications/ImageArrivalPeek.tsx` | 172 | `<img src={url} alt="AI image output" className="w-full h-full object-cover" />` — surrounding file already does `useFileAs` + `fileSourceFromS3Url(url)` to resolve a `file_id` from an S3 path | Replace local `useFileAs`/`fileSourceFromS3Url` plumbing with `<InlineMediaRef ref={initialUrl ?? null} fit="cover" rounded="none" fallback={null} className="w-full h-full" alt="AI image output" />`. The component does the file_id extraction *internally only if* the ref is a UUID; this file's URL is an S3 path, so we may still need the local `fileSourceFromS3Url` helper to derive the UUID and pass `{ file_id: uuid }`. **Medium-confidence** — re-classify if we don't want to keep that helper. |
| `features/whatsapp-clone/chat-view/bubbles/VideoBubble.tsx` | 32 | `<img src={src} alt={message.content \|\| "video"} className="block h-auto w-full" />` (note: this renders a **video thumbnail as an img**, not the video itself; the Play button is overlaid separately) | `<InlineMediaRef ref={src ?? null} as="img" fit="contain" rounded="md" fallback={null} className="block h-auto w-full" alt={message.content \|\| "video"} />` — **force `as="img"`** since the underlying media may be `video/*` but we want a thumbnail render. |

---

## Medium-confidence migrations (verify MediaRef construction)

These need a 60-second look at the URL/data shape before migrating. Notes call out the ambiguity in each row.

| File | Line | Current pattern | Notes |
| --- | --- | --- | --- |
| `features/agents/components/inputs/input-components/MediaVariableInput.tsx` | 214 | `<img src={previewSrc!} alt={variableName} className="h-10 w-10 object-cover rounded border border-border shrink-0" onError={…hide} />` — `previewSrc` is either a resolved `useFileSrc` URL or the raw stored value | This is the strongest candidate to consolidate — the file already manually does the `isFileId ? useFileSrc({kind:"file_id",fileId:stored}) : stored` ladder. `<InlineMediaRef ref={stored ?? null} size="sm" fit="cover" rounded="sm" border="subtle" fallbackIcon={<Icon/>} className="shrink-0" alt={variableName} />` would let the component do that lookup. **Medium** because the file also gates rendering on `meta.canThumbnail` and `/^https?:/.test(previewSrc)` — the latter rejects file_ids before the handler resolves them, which is what the local hand-rolling avoids. Need to confirm the `<InlineMediaRef>` "while resolving" state (returns `null` URL → renders fallback) is acceptable UX here. |
| `features/agents/components/builder/message-builders/AddBlockButton.tsx` | 596 | `<img src={imgUrl} alt="Attached image" className="h-16 w-auto max-w-[150px] rounded border border-border object-cover" onError={…hide} />` where `imgUrl = (block.url as string) \|\| ""` and `showThumbnail = isImage && imgUrl && (imgUrl.startsWith("http") \|\| imgUrl.startsWith("data:"))` | The `data:` URL case is explicitly allowed here. `<InlineMediaRef>` treats `data:` URLs as `external_url` and renders them via `<img>` since they don't match the CDN check — should work, but verify the data-URL path doesn't choke on `useFileSrc`. |
| `features/agents/components/messages-display/user/AgentUserMessage.tsx` | 338 | `<img src={url} alt={block.title} className="w-full rounded-lg object-contain max-h-64" />` where `url = (d?.["url"] as string \| undefined)` from `block.raw.data` | The block's `data.url` could be a cld_files share URL, an external URL, or a signed S3 URL — depends on the upstream block.builder. Migrate as `<InlineMediaRef ref={url ?? null} size={{width:0,height:0}} fit="contain" rounded="lg" fallback={null} className="w-full max-h-64" alt={block.title} />` and accept the handler doing nothing useful for raw external URLs. |
| `components/mardown-display/blocks/images/ImageOutputBlock.tsx` | 317, 452 | `<img src={url} alt="AI generated image" className="…" onLoad={…} />` — file already does `extractCloudFileId(initialUrl)` + `useFileSrc({kind:"file_id",fileId})` internally; `url = result ?? initialUrl` | This file is **the** poster child for consolidation but has substantial custom UX: image-load fade-in, refresh overlay, error retry button, expand modal, "Save to Files" button (lines 180-200). Don't migrate as a bare swap — would need a wrapper that exposes load callbacks. **Action**: leave alone unless we want to also build `onLoad`/`onError`/`isResolving` props onto `<InlineMediaRef>`. |
| `components/mardown-display/blocks/images/ImageBlock.tsx` | 147, 294 | `<img ref={imageRef} src={src} alt={alt} onDoubleClick={handleExpand} … />` — markdown image block with double-click-to-expand | The `imageRef` is consumed by zoom/pan logic; `<InlineMediaRef>` doesn't forward a ref. Skip unless we add `forwardRef` to `<InlineMediaRef>`. |
| `components/mardown-display/blocks/audio/AudioOutputBlock.tsx` | 152 | `<img src={src} alt={title ?? "Album art"} className={\`w-full h-full object-cover transition-transform duration-700 ${isPlaying ? "scale-110" : "scale-100"}\`} />` | Album-art cover from an AI audio block. `src` comes from the parent. If it's a cld_files share URL → easy migration. Need to spot-check what populates `src`. |
| `components/mardown-display/blocks/audio/AudioComponent.tsx` | 148 | Same shape, same caveat. | Same as above. |
| `components/ui/file-upload/ImageUploadField.tsx` | 108 | `<img src={value} alt="App Banner" className="w-full h-full object-cover" />` (inside an uploader's preview row) | The prompt says "skip the uploader's preview". This component is a generic uploader though — once the value is set, the URL it renders is the persisted one, not the local blob. Migrate after confirming `value` is always a cloud URL post-save. |
| `components/official/ImageAssetUploader.tsx` | 631 | `<img src={variants.thumbnail_url ?? variants.tiny_url ?? variants.image_url} alt={label} className="w-14 h-14 rounded-lg object-cover border shrink-0" onError={…hide} />` | Explicit skip per prompt rules ("ImageAssetUploader's preview"). Listed here only because it's borderline — once uploaded, these are cld_files URLs. Leave for the dedicated uploader-component sweep. |
| `features/image-manager/components/ProfilePhotoTab.tsx` | 73 | `<img src={currentAvatar} alt="Current avatar" className="h-full w-full object-cover" />` (inside `{currentAvatar ? … : <User/>}`) | `currentAvatar` is the persisted avatar URL — cld_files share URL once saved. Migrate as `<InlineMediaRef ref={currentAvatar ?? null} size={{width:48,height:48}} fit="cover" rounded="full" fallbackIcon={<User className="h-5 w-5"/>} alt="Current avatar" />`. Note: parent wrapper sets `rounded-full overflow-hidden`. |
| `features/prompt-apps/components/PromptAppEditor.tsx` | 1023 | `<img src={editFaviconUrl} alt="App favicon" className="w-full h-full object-cover" />` | Legacy prompt-apps system (being deleted per active migration). Skip — feature is going away. |
| `features/agents/components/tools-management/AgentToolsManager.tsx` | 2422, 3261 | `<img src={entry.iconUrl} alt="" className="w-6 h-6 rounded mt-0.5 shrink-0 object-contain" />` (and one larger variant) | `entry.iconUrl` is an integration icon URL — typically static from the integration registry. If they're truly static `/public/` assets, leave; if served via cld_files for org-uploaded custom tools, migrate. |
| `app/(authenticated)/settings/integrations/page.tsx` | 457 | `<img src={entry.iconUrl} alt="" className={cn("w-9 h-9 rounded-lg object-contain", isComingSoon && "grayscale")} />` | Same as above — integration registry icon. Verify source. |

---

## Skip (out of scope or already canonical)

Grouped by reason. None of these belong in the migration sweep — listed so we don't re-examine them.

**External/scraped image URLs (user pasted, search-API, or third-party CDN — no cloud-files context):**
- `features/tool-call-visualization/renderers/brave-search/BraveSearchInline.tsx:136` — Brave site favicon
- `features/tool-call-visualization/renderers/news-api/NewsInline.tsx:145`, `NewsOverlay.tsx:164` — NewsAPI thumbnails
- `features/tool-call-visualization/renderers/deep-research/DeepResearchInline.tsx:189, 360`, `DeepResearchOverlay.tsx:152, 236` — scraped page favicons/thumbs
- `features/tool-call-visualization/renderers/web-research/WebResearchInline.tsx:262, 623`, `WebResearchOverlay.tsx:335, 612, 753` — scraped favicons / OG images
- `features/workflows/results/registered-components/BraveSearchDisplay.tsx:257, 309, 375, 467, 537, 579, 600, 639` — Brave Search API images / favicons
- `features/workflows/results/registered-components/SerpResultsPage.tsx:433` — SERP API image result
- `features/scraper/parts/ScrapedResultDetailTabs.tsx:233` — scraped main image
- `features/scraper/parts/tabs/images/SEOImageViewer.tsx:122` — scraped SEO image
- `features/research/components/media/MediaGallery.tsx:348, 404, 459` — research-scraped media
- `features/news/components/NewsFloatingWorkspace.tsx:179` — NewsAPI article image
- `app/(public)/demos/scraper/search/page.tsx:37` — scraped image
- `features/resource-manager/resource-picker/ImageUrlResourcePicker.tsx:358` — user-pasted URL preview
- `features/public-chat/components/resource-picker/PublicImageUrlPicker.tsx:229` — user-pasted URL preview
- `features/public-chat/components/resource-picker/PublicYouTubePicker.tsx:194` — YouTube thumbnail (external)
- `features/resource-manager/resource-picker/YouTubeResourcePicker.tsx` — YouTube thumbnail
- `features/prompts/components/resource-display/ResourcePreviewSheet.tsx:796` — user-pasted URL preview
- `app/(authenticated)/tests/oauth/components/SlackManager.tsx:337, 368` — Slack-hosted avatars / file thumbs (external)
- `app/(legacy)/legacy/demo/component-demo/draggables/draggable-photo-cards/page.tsx:60` — demo with static photos
- `components/animated/ExpandableCards/ExpandableCardDemo.tsx:72, 133, 176` — demo static cards
- `components/ui/animated-testimonials.tsx:82` — testimonials demo
- `components/image/unsplash/desktop/EnhancedImageViewer.tsx:203, 322`, `mobile/MobileUnsplashViewer.tsx:134` — Unsplash external

**Markdown image renderers (receive arbitrary `src` from markdown content):**
- `components/mardown-display/MarkdownRenderer.tsx:139`
- `components/mardown-display/chat-markdown/BasicMarkdownContent.tsx:705`
- `components/mardown-display/chat-markdown/ConfigurableMarkdownContent.tsx:851`
- `components/mardown-display/markdown-classification/custom-views/view-components/AppSuggestionsView.tsx:200`
- `components/mardown-display/blocks/artifact/ArtifactBlock.tsx:167`

**Data: URLs / blob URLs (not file-handler scope):**
- `features/file-analysis/components/BboxPreview.tsx:39` — `data:image/png;base64`
- `features/file-analysis/content/ImagesContent.tsx:129` — `data:image/png;base64`
- `features/file-analysis/content/RepeatedRegionsContent.tsx:165` — base64 PNG
- `features/file-analysis/studio/ThumbnailStrip.tsx:136` — module-cached PNG data URL
- `features/file-analysis/studio/panels/PagesPanel.tsx:380` — page-render data URL
- `features/pdf-demo/components/RegionOverlayPreview.tsx:250` — `URL.createObjectURL`
- `features/pdf-demo/components/PdfBinaryResult.tsx:99` — object URL
- `features/rag/components/documents/panes/PdfPane.tsx:55` — page-render data URL (check)
- `features/window-panels/WindowTray/TrayChipPreview.tsx:149` — data URL snapshot
- `features/image-studio/components/StudioFileCard.tsx:128`, `StudioVariantTile.tsx:188`, `EmbeddedImageStudio.tsx:640, 860, 971, 1220`, `CropPreview.tsx:283`, `CropStudioWindow.tsx:249`, `InitialCropPanel.tsx:629`, `Base64DecoderShell.tsx:359`, `modes/annotate/AnnotateModeShell.tsx:220` — in-progress edits, blob/dataURL
- `app/(ssr)/ssr/demos/screen-capture/_components/FloatingCaptureDemo.tsx:118`, `ScreenCaptureDemo.tsx:27` — screenshot data URLs
- `app/(public)/demos/local-tools/_lib/ResultPanel.tsx:51`, `system/page.tsx:369, 396`, `files/page.tsx:270` — local-tools demo data
- `app/(authenticated)/(admin-auth)/administration/official-components/need-wrappers/screenshot-with-context.tsx:60`, `screenshot-demo.tsx:90, 100, 110` — screenshot demos
- `app/(authenticated)/(admin-auth)/administration/official-components/component-displays/paste-image-handler.tsx:170` — paste-handler demo
- `components/ui/file-upload/PasteImageHandler.tsx` — paste UX

**Static asset / public-folder paths (not file-handler scope):**
- `components/official/icons/IconResolver.tsx:531` — static SVG path
- `components/voice/voice-assistant-ui/extras/AssistantSelect.tsx:34, 54`, `CurrentAssistantDisplay.tsx:16`, `VoiceSelect.tsx:32, 52` — `imagePath` from voice config constants
- `app/oauth/consent/ConsentClient.tsx:573` — OAuth client `logo_uri` (third-party URL)
- `components/ssr/RouteIndexPage.tsx:80`, `components/ssr/route-display/GroupedCardsDisplay.tsx:41, 91` — route-index static thumbnails
- `components/ai-help/AIHelpDialog.tsx:205, 239` — static help illustrations

**Canonical components (skip per prompt rules — these ARE the migration target):**
- `features/files/components/inline/InlineMediaRef.tsx` — the component itself
- `features/files/components/core/MediaThumbnail/MediaThumbnail.tsx`
- `features/files/components/core/FilePreview/previewers/ImagePreview.tsx`
- `features/files/components/core/FilePreview/previewers/SvgPreview.tsx`
- `features/files/components/core/ShareLinkDialog/ShareLinkDialog.tsx` (mention only — code comment)
- `features/files/components/surfaces/FileShareTab.tsx` (mention only — description copy)
- `components/official/ImageAssetUploader.tsx:631` — uploader's own preview (explicitly excluded)

**Custom interactive viewers (zoom/pan/ref-driven — not a swap):**
- `features/window-panels/windows/image/ImageViewerWindow.tsx:206, 365` — pan/zoom viewer
- `components/image/gallery/desktop/SimpleImageViewer.tsx:216, 327` — desktop gallery viewer
- `components/image/gallery/mobile/MobileImageViewer.tsx:149` — mobile gallery viewer
- `components/ui/image-display.tsx:75`, `app/entities/fields/other-components/image-display.tsx:75`, `app/entities/fields/field-components/EntityImageDisplay.tsx:108`, `components/matrx/ArmaniForm/field-components/EntityImageDisplay.tsx:75`, `components/matrx/ArmaniForm/field-components/image-display.tsx:75` — `ThumbnailActions` + fullscreen flow; entity-field rendering, ref-heavy

**Audio with custom player (not a swap):**
- `features/transcripts/components/TranscriptViewer.tsx:~85` — `<audio ref={audioRef} src={audioUrl}>` with manual play/pause/seek; `audioUrl` from `useFileSrc({kind:"file_id",fileId:audio_file_path})`. `<InlineMediaRef>` renders `<audio controls>` only — not a fit.

**Form/Entity infra (legacy carousel, generic entity-select):**
- `components/matrx/ArmaniForm/action-system/triggers/triggerComponents.tsx:518`, `triggerRegistry.tsx:502` — legacy ArmaniForm trigger renderer
- `components/matrx/Entity/prewired-components/entity-management/parts/EntitySelectVariants.tsx:165` — generic entity select carousel; `imageUrl` could be anything

**Cloud images tab (already adjacent — uses Files SDK):**
- `components/image/cloud/CloudImagesTab.tsx:318` — only a code comment, no `<img>` tag at that line

---

## Patterns that recur

Group | Count | Canonical replacement
--- | --- | ---
**Podcast covers** (`show.image_url`, `ep.image_url`, `ep.thumbnail_url`, `coverImage` ?? show fallback) inside a `(url ? <img>... : <Mic/Music/>)` fork | 7 sites (PodcastsTable ×2, ShowDetailClient ×2, ShowsClient ×1, PodcastShowPage ×1, PodcastAudioPlayer ×1, PodcastGrid foreground ×1) | `<InlineMediaRef ref={image_url ?? null} size={...} fit="cover" rounded="md\|lg" fallbackIcon={<Mic/Music ...>} alt="" />`. Podcast records carry plain `image_url`/`thumbnail_url` strings (no cloud_file_id surfaced to the table-row level) — pass the URL as the `ref`.
**Org logo** inside `(logoUrl ? <img/> : <Building2/>)` | 4 sites (OrganizationCard, OrgSidebar, GeneralSettings, org/[slug] page, invitation accept page) | `<InlineMediaRef ref={logoUrl ?? null} size={...} fit="cover" rounded="lg" fallback={null}/icon alt={org.name} />`
**Applet/App banner** in `(imageUrl ? <img/> : <placeholder/>)` filling a sized wrapper | 7 sites (AppPreviewCard, AppletPreviewCard, SmartAppList ×1, SmartAppletList ×1, applet home Grid, applet home Sidebar, AppletCard in components/) | `<InlineMediaRef ref={imageUrl ?? null} fit="cover" rounded="none" fallback={null} className="w-full h-full" alt={name} />`
**Chat resource attachment** (`isImage && resource.data.url ? <img/> : <icon/>`) | 4 sites (cx-chat UserMessage, cx-conversation UserMessage, public-chat MessageDisplay, public-chat ChatInputWithControls) | `<InlineMediaRef ref={resource.data.url ?? null} size="sm\|{64,64}" fit="cover" rounded="none" fallback={null} alt={filename ?? "Attached image"} />`
**Feedback screenshot grid** (cloud-files share URL → `<img/>`) | 4 sites (FeedbackDetailDialog ×3, FeedbackTable, settings/feedback page) | `<InlineMediaRef ref={url ?? null} fit="cover\|contain" rounded="none\|sm" fallback={null} alt={...} />`
**Canvas/share cover image** (preset gallery thumb OR uploaded thumbnail) | 4 sites (CanvasShareSheet, ShareCoverImagePicker ×2, image-manager PublicImagesSection) | `<InlineMediaRef ref={url ?? null} fit="cover" rounded="none" fallback={null} alt={...} />`
**WhatsApp clone media tiles** (thumbnailUrl/url ?? signedUrl via useFileSrc) | 3 sites (MediaTab — biggest win since it already does the `useFileSrc` ladder; ImageBubble; VideoBubble) | One swap to `<InlineMediaRef ref={item.cloudFileId ?? item.thumbnailUrl ?? item.url ?? null} fit="cover" .../>` collapses the local resolution code.

---

## Open questions

**§A. Zero-sized passthrough mode.** `<InlineMediaRef>` always reads `width`/`height` from the `size` prop and applies them to the rendered element via `width={…} height={…} style={{width,height}}` (line 184-186 + the element render). Several call sites (applet banners, WhatsApp image bubbles, canvas cover, gallery card) currently rely on the wrapper to size the image and use `className="w-full h-full"` to fill it. If we set `size={{width:0,height:0}}` to disable the explicit attrs, the inline width/height attrs render as `0`, which can cause initial layout collapse before CSS resolves.

→ **Files affected:** `app/(a)/podcast/PodcastGrid.tsx:36`, `features/applet/builder/previews/{AppPreviewCard,AppletPreviewCard}.tsx`, `features/applet/builder/modules/smart-parts/{apps/SmartAppList,applets/SmartAppletList}.tsx`, `features/applet/home/main-layout/{Grid,Sidebar}.tsx`, `components/applet/apps/AppletCard.tsx`, `features/cx-chat/components/messages/UserMessage.tsx`, `features/cx-conversation/UserMessage.tsx`, `features/public-chat/components/{MessageDisplay,ChatInputWithControls}.tsx`, `features/canvas/social/{CanvasShareSheet,ShareCoverImagePicker}.tsx`, `features/image-manager/components/PublicImagesSection.tsx`, `features/window-panels/windows/FeedbackWindow.tsx`, `features/gallery/components/GalleryFloatingWorkspace.tsx`, `features/agent-apps/components/inputs/AgentAppImageField.tsx`, `features/whatsapp-clone/chat-view/bubbles/{ImageBubble,VideoBubble}.tsx`.

→ **Resolution options:**
  1. Add a `size="fill"` variant to `<InlineMediaRef>` that emits `width="100%" height="100%"` (or no width/height attrs) so the parent box controls dimensions.
  2. Keep `size` mandatory and require call sites to compute a real px size. Painful for responsive cards.
  3. Pass explicit width/height matching the parent's smallest expected size; let `className="w-full h-full"` override. Works but ugly.

Recommend option 1.

**§B. Responsive `md:` size jumps.** `app/(authenticated)/org/[slug]/page.tsx:215` uses `className="w-20 h-20 md:w-24 md:h-24 …"`. `size` can't express a breakpoint. Either drop the larger md size, or rely on `className` overrides (works because Tailwind classes win over inline styles for w/h via `!important`-free order — but the inline `width={...}` HTML attribute still sets the element's intrinsic size for layout purposes before CSS kicks in).

**§C. Audio `<audio>` with custom controls.** `features/transcripts/components/TranscriptViewer.tsx` resolves a signed audio URL via `useFileSrc({kind:"file_id",fileId:audio_file_path})` and binds it to a manually-controlled `<audio ref={audioRef} …>` element (play/pause/seek/playback-speed). `<InlineMediaRef as="audio">` only emits `<audio controls>`; it cannot accept a forwarded ref or expose load/play events. → Either out-of-scope for this sweep, or we should add `forwardRef` + event-prop pass-through to `<InlineMediaRef>` and migrate as part of a richer iteration.

**§D. `ImageOutputBlock`'s "Save to Files" + refresh overlay UX.** This is the heaviest custom image surface in the app and would benefit most from consolidation, but currently owns `imageLoaded` fade-in, "URL refresh" Loader2 overlay, save-to-cld_files button, expand modal, retry-on-error. → Pre-req: `<InlineMediaRef>` needs `onLoad` / `onError` / `isResolving` props (and `forwardRef` for the expand modal's ref-driven copy logic). Tracked as a follow-up rather than migrated now.

**§E. `useFileAs` + `fileSourceFromS3Url` in `ImageArrivalPeek`.** The peek extracts a `cld_files` UUID from a raw S3 URL string before resolving. `<InlineMediaRef>`'s built-in UUID detection only triggers when the entire `ref` string is a UUID — it won't fish a UUID out of an S3 path. → Either keep the local `fileSourceFromS3Url` helper and pass `{file_id: uuid}` to `<InlineMediaRef>`, or fold S3-path-UUID extraction into the handler. Recommend the former for the first sweep.
