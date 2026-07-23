---
status: active
updated: 2026-07-23
repos: [matrx-frontend, aidream]
vision: []
---

# Podcast media enrichment + the "stream everything, no spinners" bar

Scope: the podcast **feature image** (transcript-derived extra image + style options), the public
**blog page** look, the run-page **cover-art grid**, and the platform bar Arman set — *no blocking
spinners anywhere; results stream in real time*. Two sibling handoffs own adjacent podcast work and
must NOT be duplicated here: generation pipeline (gates/casts/chapters/languages) →
`docs/handoffs/podcast-system.md`; live run-page liveness + research feed →
`docs/handoffs/podcast-run-liveness-and-research-feed.md`. Living state of the whole feature:
`features/podcasts/FEATURE.md` (read its top Change Log entries first).

## Vision — Arman's words

**Feature image (the original task):**
> "Get the prompt from this agent [GPT Image Prompt Generator, `175cd409-cb7e-4c53-83e6-1dbf0ec24ed1`] … intent_or_content must be the full transcript of the episode. For style, we will default it to 'Infographic' but I want to give the user an option to override it in the ui as the additional custom image type. Also, think of other potentially really good image types. This is the exact agent that will be used for the image generation [Matrx Image Ultra, `f5d213aa-4b98-49eb-9fb3-d93172e68453`]. This combination … produces really incredible images that can be highly detailed and intricate so we can provide some really great options."

**Blog page:**
> "when we publish the blog post, we're publishing it with only one image at the top. … include at least one more image, somewhere lower in the content, … so that the page isn't so plain and simple. And also, at the bottom, we're sort of listing a podcast link, but we're not really making it easy to play the episode. Would it be better to just embed the player, maybe halfway down …? … the key … is we wanna make it look really nice … just gives it a little more balance to the page."

**The streaming bar (applies platform-wide, not just to podcasts):**
> "You're creating this thing that just sits there and spins for over a minute. That's pathetic. No one in AI does that these days. … It has to stream in real time. That's the beauty of these things these days. That's what people pay money for."

**Data:**
> "If there are messed up podcasts, then just delete them. I'd rather have them be clean."

**Ship discipline (standing, all work):**
> "when you finish a focused session … don't sit around and wait for someone else to deploy it. Commit … then … go ahead and release."

## Resources

- FEATURE doc (source of truth): `features/podcasts/FEATURE.md`; aidream pipeline
  `packages/matrx-ai/matrx_ai/agent_runners/podcast_generator.py` + `services/podcast/FEATURE.md`
- Feature image FE: `features/podcasts/generator/featureImageStyles.ts` (11 style tokens — must stay
  char-identical to aidream's `FeatureImageStyle` StrEnum), picker in `generator/components/GeneratorForm.tsx`
- Blog FE: `features/podcasts/components/player/PodcastBlogPage.tsx` + pure split
  `features/podcasts/blogLayout.ts` (+ `__tests__/blogLayout.test.ts`); route `app/(core)/podcast/[slug]/blog/page.tsx`
- Cover-art grid: `features/podcasts/generator/components/MediaOptionsGrid.tsx`
- Kind Request primitive (streaming): `features/content-ir/react/actions/{useKindRequest.ts,KindRequestDialog.tsx}`;
  the "Need an idea?" consumer `features/podcasts/generator/components/TopicIdeaHelper.tsx`
- Defects: `FOUND_DEFECTS.md` D82 (untitled episode), D83 (duration), D85 (concurrency root cause)
- Deploy: FE `scripts/release.sh` (Vercel → aimatrx.com); aidream auto-deploys from `main`.
  Confirm aidream live by probing `https://server.app.matrxserver.com/openapi.json` for the field you shipped.
- Test route + login: `/podcast/studio/create` → generate; log in `admin@admin.com` / `Password1234#`

## Remaining work

1. **D82 — flashcard→podcast still publishes "Untitled Episode" (aidream, NOT fixed).** The
   education/flashcard path (`features/flashcards/data/podcastOverview.ts`) sends a full-content deck;
   the script agent returns an empty title and aidream persists it as `"Untitled Episode"` with no
   description/art. Fix in aidream: derive a title when the agent omits one, and never persist an
   empty title (an untitled episode is a failed run). Reproduces on the next such run. Full repro +
   row ids in `FOUND_DEFECTS.md` D82.
2. **D83 — `pc_episodes.duration_seconds` never written (aidream).** 44/48 episodes null; every
   server-rendered list/RSS has no runtime. Write duration at publish time in the generator. (FE now
   recovers it client-side from the audio element, but lists can't without downloading every file.)
3. **The streaming bar is a standing standard, not a closed ticket.** "Need an idea?" is fixed;
   audit every remaining agent-backed action for a blocking spinner and stream it via the same
   primitive. The run-page cover-art / video cards still read as static "Queued" tiles during the
   multi-minute image wait — owned by `docs/handoffs/podcast-run-liveness-and-research-feed.md`;
   make them feel alive (per-card progress / streamed prompt already shows, but the wait is long).
4. **Eyeball two real runs post-deploy (both live, not yet visually watched end-to-end):** (a) the
   "Need an idea?" dialog streaming options in one at a time; (b) a full generate producing the 6th
   "feature image" card live. Both are deployed and code-verified; a real-run visual confirm is the
   only thing left.
5. **Blog second still image — deliberately deferred.** The blog uses the episode's official video
   as its lower visual because the extra generated stills live on the `internal`-visibility studio
   run and are not anon-readable. If Arman wants distinct stills in the blog, see Decisions.

## Done

- Feature image: two-step agent chain (prompt agent → Matrx Image Ultra) from the full transcript,
  11 styles (default Infographic, `auto` delegates), UI picker, gated on the image budget, resume-safe
  URL guard, concurrency leak fixed — aidream `podcast_generator.py` + FE `featureImageStyles.ts`; live.
- Blog enriched + balanced: player embedded at the article midpoint, official video lower, SSR-safe
  waveform — `PodcastBlogPage.tsx` + `blogLayout.ts`; live.
- Cover-art grid no longer hides the 6th image (`VISIBLE_IMAGES = 6`) — `MediaOptionsGrid.tsx`.
- Kind Request streams its result live (killed the blocking spinner) —
  `useKindRequest.ts` + `KindRequestDialog.tsx`; live.
- Data cleaned: 15 dead/duplicate/untitled episodes + the empty AP Bio show soft-deleted; dead media
  refs healed. `/podcast` index identity + header/theme/cursor fixes shipped earlier.

## Decisions needed

- **The "prep-step" task is undefined.** Situation: after the feature image, Arman said "I can
  assign you the next task that will add a prep step but I want this done first" — the feature image
  is now shipped, but the prep step was never described. Decide: what prep step, and where in the
  pipeline (before the prompt agent? a user-editable step?).
- **Distinct still images in the blog.** Situation: the blog can only use episode-public media; the
  run's 5–6 generated stills are `internal`-visibility and not anon-readable, so the blog shows the
  official video instead of a second still. Decide: make the studio run public, denormalize a small
  image gallery onto `pc_articles` at publish, or leave the video as the sole lower visual.
