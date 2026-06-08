# KNOWN DEFECTS — AI Matrx Admin (frontend)

The running ledger of known bugs, gaps, and "must never happen again" classes of
failure on the frontend. Mirrors the backend's `KNOWN_DEFECTS.md` in aidream.

**Rules of this file**
- When you discover a defect you can't fully fix in the moment, add it here with
  enough context to act on it cold. A defect that lives only in a chat log is a
  defect that will recur.
- When you fix a defect, move it to **Resolved** with the commit/approach — don't
  delete it (the history is the institutional memory).
- Each entry: **what**, **why it happened**, **the fence(s) that prevent the
  class**, and **what's still open**.
- CLAUDE.md links here. Read both before touching files, media, or persistence.

---

## OPEN

### D1 — Media durability: public/owned media must never be a signed, expiring URL
**Severity: high — silently breaks public pages days later.**

**What.** Generated podcast media (covers, audio, per-clip videos) was persisted
into `pc_episodes.image_url` / `audio_url` / `video_url` as **expiring signed S3
URLs** (`matrx-user-files.s3.amazonaws.com/…?X-Amz-Signature=…&Expires=…`). The
public episode page (`/podcast/[slug]`, viewed by anonymous users) renders these
directly, so once the signature expires the images/audio break — silently, days
after creation. Older episodes stored durable public-bucket / `cdn.matrxserver.com`
URLs and work fine; the new pipeline regressed.

**Why it happened (multiple mistakes, both sides).**
1. **Backend (root):** the media agents persist with the default
   `visibility="private"` (`packages/matrx-ai/.../providers/base_media.py:_persist_asset`),
   which yields a signed S3 URL. The orchestrator captures that URL string and
   `_persist_episode` (router `aidream/api/routers/podcast_generator.py`) writes it
   verbatim into `pc_episodes`. The *official video* already does it right
   (`visibility="public"` → permanent CDN) — proof the fix is a one-knob change.
2. **Frontend:** the public episode/show pages render media with **raw `<img>` /
   `<video>`** (`features/podcasts/components/player/PodcastEpisodePage.tsx`,
   `PodcastShowPage.tsx`, `PodcastGrid.tsx`) instead of the canonical
   `<InlineMediaRef>`, with hide-on-error and no fallback — so a broken URL just
   vanishes. This violated CLAUDE.md's "every file flow funnels through
   `@/features/files`" rule, and there was no lint rule enforcing it.

**The fences (defense in depth).**
| Layer | Status | Mechanism |
|---|---|---|
| 1. Server persists media PUBLIC at generation | **OPEN (backend)** | Mirror the official-video path — `save_media_envelope_async(..., visibility="public")` for podcast image/audio/clip assets, or `SyncEngine.change_visibility_async(file_id,"public")` post-gen. Tracked in aidream `KNOWN_DEFECTS.md`. |
| 2. DB-edge guard | **DONE** | `migrations/mtx_public_media_url_guard.sql` — registry (`mtx_public_url_guard`) + generic trigger that, on any write of a non-durable URL to a registered column, RAISES a loud WARNING and queues a heal job (`mtx_media_heal_queue`). Reusable for any table/column. Non-blocking. Registered on all `pc_episodes` media columns; existing broken rows backfilled. |
| 3. Frontend classifier + loud logger | **DONE** | `lib/media/durability.ts` — `classifyMediaUrl` / `isDurableMediaUrl` (twin of the DB classifier) + `reportMediaDurabilityViolation()` which screams in the console when an expiring URL reaches a render/store path (so the defect can't be ignored). |
| 4. Canonical render component re-mints | **PARTIAL** | In the **authed** studio, `podcastMediaRef()` recovers the file_id from the signed URL → `<InlineMediaRef>` re-mints a fresh URL (durable for owners). Anonymous public viewers CAN'T re-mint (needs auth) → they require a truly durable URL (layer 1/2/owner-heal). |
| 5. Owner heal path | **OPEN/PARTIAL** | An authed owner viewing their run/episode should process `mtx_media_heal_queue`: extract file_id → `useFileMutation().setVisibility(fileId,"public")` → fetch the CDN URL → rewrite the `pc_episodes` column → mark healed. (Wire-up pending; see below.) |

**What's still open.**
- **Backend layer 1** — the real fix (see aidream KNOWN_DEFECTS). Until it lands,
  new episodes keep getting queued by the guard.
- **Owner heal (layer 5)** — process `mtx_media_heal_queue` from the authed
  studio. Recipe (confirmed feasible): for each pending row whose episode the user
  owns → `fileIdFromUserFilesUrl(bad_value)` → `useFileMutation().setVisibility(fileId,"public")`
  (PATCH /files moves the object to the public bucket) → `getFile(fileId)` →
  `record.cdnUrl` (the permanent URL; the redux record carries `cdn_url`/`public_url`) →
  `podcastService.updateEpisode(episodeId,{image_url:cdnUrl,…})` → mark the queue
  row `healed`. Build + verify as its own focused change (multi-step, needs
  per-step error handling — do NOT bolt it onto an unrelated commit).
- **A pg_cron + pg_net automated healer** (the fully-hands-off version): a cron job
  drains `mtx_media_heal_queue` by calling a backend "publish file + rewrite
  column" endpoint. That endpoint doesn't exist yet (needs a small aidream route).
- **Lint enforcement** — there is no ESLint rule banning raw `<img>`/`<video>` for
  our media. The doctrine (CLAUDE.md "File Handling") says use `<InlineMediaRef>`;
  add a rule so it's enforced, not just documented.
- **Public pages still use raw `<img>`** in some spots — migrate the hero renders
  to `<InlineMediaRef>` + a fallback chain (`image_url → og_image_url →
  thumbnail_url → show image`) + the loud guard.

---

## RESOLVED

_(none yet — move D-entries here as their fences fully land.)_
