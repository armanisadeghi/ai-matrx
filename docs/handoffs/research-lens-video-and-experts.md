---
status: active
updated: 2026-07-27
repos: [matrx-frontend, aidream]
vision: [features/research/docs/PIPELINE_FLOW.md, features/research/docs/VISION_AND_GAPS.md]
---

# Research — per-keyword goals, video, and experts

Two workstreams, both changing **what the AI agents receive**. Phase 1 (making
incremental research visible and controllable) is shipped; this is what's next.

---

## 1. Vision — Arman's words

### The original problem

> "I had 3 keywords I researched and when it was all done, I decided to add a 4th.
> Now, this should be the easiest thing in the world where I go to the keywords
> page and it should tell me that one is unprocessed and offer to start it."

> "the system should use everything we've already captured because my guess is
> for this particular use case, eighty percent of the sites that come up will be
> the same… we've already scraped them, and we have the core data. **With the
> difference that now we're looking at it through a different lens** because
> we're looking for this specific keyword."

> "the system is smart enough to go through and reuse what makes sense to reuse,
> but then for the parts where it doesn't make sense to reuse, we would do it
> new, but not in a way that messes up what we've already done or repeats things
> that have already been done."

### The governing principle — nothing hidden

> "Right now, everything is sort of like happens in the background. It's a
> secret. No one knows what's going on. You know, there's a secret club meeting.
> **We can't have that.**"

> "if we're getting things that we're not clearly showing the user or we're
> getting things and they're not actually being utilized for the big
> documentation package that we put together. Well, then **we're just wasting our
> time, and we may as well not get it.**"

Two tests every feature here must pass: *is it visible to the user?* and *does it
reach the final document?* Fail either and the work should not be done at all.

### Quotas are real, but must be explained

> "those limitations are in place because, in the future, some account types
> won't be able to add more than a certain number of keywords. So we don't wanna
> lose that, but we wanna make it where the user is told what's going on."

### The focused lens (workstream A — NOT STARTED)

> "what we're gonna wanna do is capture the overall goal and then take it one
> step further. And **for each keyword, enter a goal** so that when we're
> prompting the agent, it's not just the keyword, but it's **what is the goal of
> this particular search**."

> "in case I've added the name of an attorney who's the partner, I would want to
> add that I want information about him, not the firm, but that's not immediately
> obvious from the search."

> "it's going to impact other things… it'll change multiple prompts."

**Why this matters:** a page summary written for "PBW Law firm profile" cannot
answer "what does this say about Barry Pearlman." The pipeline correctly reuses
those summaries — they were just never looking for him.

### Video and experts (workstream B — partially started)

> "we can now get YouTube results but that has to be an **optional addon**
> because we're limited on the searches per day."

> "take one focused keyword, do a YouTube search, and then have those videos
> available. But then we also have the videos that we get from just our scraping
> in general… the key would be that we would allow the **user to select a few of
> the videos** and then be able to get them processed."

> "for certain topics, YouTube videos are going to be critical. But **the key
> with YouTube videos is that they're going to need to be for identifying
> experts**, and that's a big part of what we're gonna need to be doing. And also
> **curating expert channels is critical.**"

> "What we don't want to do is set it up so that a user is randomly including a
> bunch of YouTube searches when that may not be necessary."

### THE QUOTA RULE — read this twice

> "it would be **STUPID** for us to tell our users how many requests **WE** have
> remaining… These are not how many the user has left. **it's OUR budget.**
> Imagine how pathetic we would sound and how unprofessional it would be for us
> to tell a user that. And what happens when we're down to 20 and a user then
> realizes that he better use them all so our other 100,000 users cannot!"

The YouTube Data API allowance is a **platform-wide operating budget**, not a
per-user entitlement. Remaining headroom is operator-only information. This was
violated once and fixed (see Done); do not reintroduce it in any form — not a
counter, not a progress bar, not "limited availability" copy that implies a
number.

Current scale context, in his words: *"Today, we're not officially in full
production yet, so that will be no problem because we only have a few actual
users other than me. But when we go full blown production, that will become an
issue."*

### Industries — use what exists

> "Do the industries but when you say 'riding' it sounds like you're trying to
> do something different but it's not. We have an admin system that allows us to
> assign assets to industries so it's a matter of understanding where these are
> stored and then associating them. **We will likely need new tables for
> unique/new things we've never done.**"

### UI direction

> "the new YouTube UI is beautiful and the font and things match YouTube. **You
> need to borrow from that system** to do it right."

### Contacts — the bigger system this proves we need

> "we also want to start creating a way to manage these 'contacts' which leads to
> needing a **full-scale contact management system** built into our system, which
> is already planned but this is now the time that proves we need to get it done
> asap."

A separate planning task was spun off for this. Experts in research are its first
consumer — build them so they can later be absorbed, not so they must be rebuilt.

---

## 2. Resources

**Read first:** [`features/research/docs/PIPELINE_FLOW.md`](../../features/research/docs/PIPELINE_FLOW.md)
— traced flow + the exact input contract of every agent. Answers "what does each
agent receive" without reading aidream.

**Feature docs:** [`features/research/FEATURE.md`](../../features/research/FEATURE.md) ·
[`features/research/docs/VISION_AND_GAPS.md`](../../features/research/docs/VISION_AND_GAPS.md)
(§4, §13.2 predate the Gemini-native path — see Gotchas) ·
[`features/industries/FEATURE.md`](../../features/industries/FEATURE.md) ·
`/Users/armanisadeghi/code/aidream/research/FEATURE.md`

**Frontend**
- Readiness ledger: `features/research/readiness.ts` (+ `__tests__/readiness.test.ts`)
- Quota gate: `features/research/keywordQuota.ts`, `components/keywords/KeywordQuotaDialog.tsx`
- Orchestra: `components/overview/orchestra/PipelineOrchestra.tsx`, `OrchestraNode.tsx`
- Next steps card: `components/overview/PipelineNextSteps.tsx`
- Run from any surface: `hooks/useRunPipeline.ts`
- **YouTube UI to borrow from:** `features/marketing/discovery/youtube/` —
  `YouTubeDiscovery.tsx`, `YouTubeVideoPreview.tsx`, `formatters.ts`
  (`formatYouTubeCount` / `Duration` / `Date`, `youTubeEngagementRate`)
- Video primitives: `lib/media/youtube.ts` (THE parser — never re-implement),
  `features/files/blocks/youtube/YouTubeEmbed.tsx`, `blocks/video/UnifiedVideoBlockRenderer.tsx`
- Media gallery: `features/research/components/media/MediaGallery.tsx`

**Backend (`/Users/armanisadeghi/code/aidream/`)**
- `research/service.py` — `run_initial_pass` + every skip gate
- `research/search.py` — `execute_search`, `find_keyword_videos`
- `research/analysis.py` — `analyze_source` (the lens gap lives here)
- `research/synthesis.py` — keyword + topic synthesis
- `research/youtube.py` — Data API client · `research/youtube_quota.py` — budget
- `research/agents.py` — every agent + input model · `research/agent_resolution.py` — the 8 override keys
- `aidream/services/media_resolvers/youtube.py` — Gemini transcription

**DB** (Supabase `txzxabzwovsujtloxrus`)
- `research.rs_*` · `platform.associations` (source⇄keyword edges; `rs_keyword_source` no longer exists)
- `iam.industries`, `iam.org_industries`, `iam.industry_curators`
- `rag.data_store_grants` — **the exemplar for industry-gated assets**:
  `(data_store_id, audience, industry_id, organization_id, granted_by)`
- `public.get_topic_overview()` — counts + the `pending` readiness ledger
- `research.youtube_quota_day` + `research.youtube_quota_spend()` (service_role only)

**Testing:** `/login` as `admin@admin.com` / `Password1234#`. Research topics are
RLS-scoped to their creator — to test against a realistic topic you must seed
one under the test user (association edges need `organization_id` or the
readiness ledger silently reads zero).

---

## 3. Current state

### Done
- Readiness ledger + honest orchestra (amber `stale` ≠ failure `partial`) — `features/research/readiness.ts`
- Keyword quota gate on both add-keyword paths — `features/research/keywordQuota.ts`
- Report-supersession choice + visible synthesis version history — `components/synthesis/`
- `/document` no longer auto-generates on tab click — `components/document/DocumentViewer.tsx`
- YouTube search made opt-in + metered, degrades to web-only — `aidream/research/youtube_quota.py`
- Per-keyword `find-videos` endpoint — `aidream/research/search.py#find_keyword_videos`
- Budget exposure removed everywhere (endpoint, 429 body, stream message, DB grants)
- Pipeline + agent-input trace — `features/research/docs/PIPELINE_FLOW.md`

### Partial
- **Video search triggers.** Backend done; **no frontend at all**. Needs the topic
  toggle (`search_params.include_youtube`) and the per-keyword button calling
  `POST /research/topics/{id}/keywords/{kid}/find-videos`. Arman chose **both**.
  Show **no quota numbers**.
- **Video legibility.** A transcribed video is an anonymous `rs_content` row —
  no channel, duration, or view count anywhere in research UI. Fails the
  "if we don't show it, we're wasting our time" test.

### Not started
- **Per-keyword goals (workstream A)** — the whole focused-lens idea.
- **Expert identification** — YouTube results already carry subscriber count,
  video count, view/like counts and channel identity. **Nothing consumes any of
  it.** The Authority Ranker receives these fields but scores *trustworthiness*,
  not *who is this person*.
- **Expert channel library** (industry-gated, per Arman's decision).
- **Media multi-select + batch processing** — `MediaGallery.tsx` has no selection
  UI whatsoever.
- **Non-YouTube video** — `trigger_transcription` hard-rejects anything not
  YouTube (`aidream/research/multisource.py:739`), so Vimeo/mp4 rows in
  `rs_media` have no processing path.

### Known issues / risks
- **Tag consolidation sends full raw page bodies with NO truncation**
  (`aidream/research/tagging.py:56-96`). Page Summary caps at 100k; this doesn't
  cap at all. A large tag can blow context and cost. Same for the auto-tagger
  (`tagging.py:226` only warns).
- **Keyword *update* mode drops the keyword** (`research/synthesis.py:249`) — the
  Updater gets `previous_report` + `new_information` only. Relevant to workstream A.
- **Topic update computes `all_search_text` and never uses it** (`synthesis.py:558`).
- **Override precedence inverted** in `_synthesize_topic_update` (`synthesis.py:596`):
  `agent_config → explicit arg`, the reverse of every other call site.
- **`rs_content.linked_transcript_id` is a dead column** — defined in models and
  both TS type files, written and read by nothing. Use it or drop it.
- **`features/industries/FEATURE.md` says `public.industries`; the tables are in
  `iam`.** It also omits `iam.industry_curators`. Verify schema in the DB, not the doc.
- `MediaGallery.tsx` hand-rolls YouTube iframes instead of using
  `features/files/blocks/youtube/YouTubeEmbed`.
- **`get_topic_overview` is not SECURITY DEFINER** — the readiness ledger reflects
  what the *caller* can see, including `platform.associations` edges. Edges written
  without `organization_id` are invisible and silently read as "nothing pending".

---

## 4. Remaining work — in order

1. **Video search triggers (frontend).** Topic toggle writing
   `rs_topic.default_search_params.include_youtube`, plus a per-keyword "Find
   videos" button. Borrow type/formatting from
   `features/marketing/discovery/youtube/`. **Never render a quota number**; on
   429 show the generic message the API returns.

2. **Make video legible.** Video sources and transcripts must look like video —
   channel, duration, view/subscriber counts, thumbnail — on the sources list,
   `/content`, and source detail. Data is already in
   `rs_source.raw_search_result`. Reuse `formatters.ts` and `YouTubeEmbed`.

3. **Per-keyword goals (workstream A).** A goal column on `rs_keyword`; captured
   at topic creation (the Suggest agent takes ONE field today and invents
   keywords — it must produce goals too) and on add-keyword. Thread into
   `PageSummaryInputs` and add `keyword_id` to `rs_analysis` so a source can hold
   one analysis per lens. Existing analyses stay valid as the topic-level lens.
   **Read `PIPELINE_FLOW.md` §3 first** — this changes the analysis dedup key,
   which is what makes reuse work.

4. **Expert identification.** An agent pass over video results producing
   first-class expert records on the topic (name, channel, reach signals, the
   videos they appear in) with their own surface and a report section. Build them
   absorbable by the coming contact system.

5. **Expert channel library, industry-gated.** New table(s) — Arman expects them.
   Copy the `rag.data_store_grants` shape (`audience` + `industry_id` +
   `organization_id`) so entitlement rides the existing Industries spine rather
   than a second sharing mechanism. Writes via SECURITY DEFINER RPC, audited,
   per `features/industries/FEATURE.md` doctrine.

6. **Media multi-select + batch transcribe.** Selection UI on `MediaGallery.tsx`
   (copy the checkbox + bottom action-bar pattern from
   `features/transcript-studio/components/scribe/RecordingCardList.tsx`), plus a
   batch endpoint. Must map a media row back to its source.

7. **Non-YouTube video.** Decide whether to support it; today it silently cannot
   be processed at all.

---

## 5. Gotchas

- **Three different things are called "YouTube."** (1) videos found during
  keyword search via the Data API — costs budget; (2) videos harvested off
  scraped pages into `rs_media` — free; (3) the standalone discovery search at
  `/marketing/discovery/youtube` — costs budget and **cannot add to a topic**.
  Always say which.
- **Transcription is not automatic for all videos.** `scrape_source`
  (`aidream/research/scraper.py:209`) routes `source_type='youtube'` to Gemini
  instead of fetching HTML — but only inside the scrape path, gated by
  `scrapes_per_keyword`. A video competes for the same slots as web pages.
- **A `/run` never refreshes the topic report** once one exists
  (`research/service.py:2014`) and **never assembles a document at all**. Any UI
  implying otherwise is lying.
- **`max_keyword_syntheses` is a topic-wide TOTAL**, not per keyword. A keyword
  can be searched, scraped and analyzed and still get no write-up.
- **A migration file changes nothing until applied to Supabase** and recorded in
  `public._schema_migrations`. Verify live.
- **`pnpm type-check` is the only type gate** — the build ignores type errors.
- **The repo has parallel agent sessions running.** Commit only your own files;
  `git pull --rebase` will refuse on a dirty tree, and an interrupted rebase can
  leave your commit off HEAD (recover with `git rebase --abort`, the commit
  survives in reflog).
- **`VISION_AND_GAPS.md` §13.2 proposes a three-tier YouTube transcript ladder
  (yt-dlp → third-party API → Speechmatics).** That predates the Gemini-native
  path, which already works today with no download and produces transcript +
  analysis in one call. Do not build the ladder without re-deciding.

---

## 6. Decisions needed

**Expert record scope.** A separate planning task is designing a platform-wide
entity/contact system (experts, leads, contacts). Research needs experts before
that lands.

*Decide:* build research experts as a research-local table now and migrate later,
or wait for the entity system's schema so experts are born on it. Waiting blocks
workstream B item 4; not waiting risks a migration.
