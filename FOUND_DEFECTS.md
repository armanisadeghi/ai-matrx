# FOUND DEFECTS — AI Matrx Admin (frontend)

The ledger of found bugs and gaps on the frontend. Twin of aidream's `FOUND_DEFECTS.md`.

**Rules**

- File only defects you can't fully fix in the moment, and only UNRELATED findings — a bug related to your current task gets **fixed**, not filed. Enough context to act cold: what, where, the fix.
- **When you fix one: collapse it to a one-line bullet in Resolved (title + date + commit/file pointer) — or delete it outright.** No histories, no verification narratives, no journeys. An entry earns lines only while it is open.
- Keep open entries compressed to load-bearing facts: what's broken, exact paths, the fix, who decides. A partially-fixed entry keeps only the open remainder.
- CLAUDE.md links here. Read both before touching files, media, or persistence.

---

## OPEN

### D179 — Keyword Research workbench: remaining UI debt (2026-08-13, Arman review)

Arman reviewed `/marketing/keyword-research` during the sharing pilot and named
more UI problems than that task closed. Fixed there: the "Saved research" row
that wasted a full row, the input↔Research misalignment, and the deep-link
showing unrelated library keywords. **Still open, Arman's words: "there are
other UI issues with this page as well."** Not enumerated yet — this page wants
a dedicated `ui-sharp`/`ui-dense` pass over the whole workbench (launcher strip,
the metrics line under `KeywordInput`, cluster chip, toolbar, table density),
not another one-off patch. Whoever takes it: screenshot first, list every issue,
then fix as one change.

### D180 — Hydration mismatch + "script tag while rendering" on `(core)` marketing routes (2026-08-13)

Every `(core)` marketing route logs two console errors on load in dev:
"Encountered a script tag while rendering React component" followed by
"Hydration failed because the server rendered HTML didn't match the client."
Reproduced on `/marketing/keyword-research` AND untouched `/marketing/ai-visibility`,
so it is shell-level, not feature-level — a `<script>` rendered inside a React
tree somewhere in the `(core)` layout chain. Found while verifying the keyword
share pilot; not investigated (out of that task's scope). Hydration failures
silently re-render the whole tree client-side, so this is a real perf +
correctness cost, not cosmetic noise.

### D172 — `normalisePageUrl` rejects a URL its own test says it must accept (2026-08-11)

`features/marketing/lib/page-url.test.ts` "lowercases scheme and host" FAILS on
committed `main` — `acceptPageUrlInput` throws "Only HTTP(S) page URLs can join
the registry." for input the test feeds it (`page-url.ts:145`). Found while
running the marketing suite for an unrelated change (site-audit gone pages);
64 of 65 marketing suites pass, so this is one specific regression, not a broken
tree. Not investigated — it is nowhere near the audit rollup, and another
session may be mid-edit in that file. **Whoever owns `page-url.ts` should decide
whether the guard or the test is wrong**: the function is the parity mirror of
the scraper's `_normalise_url`, so "just relax the guard" is the wrong reflex if
Python still rejects the same input.

### D171 — `content_role` has two writable authorities and 13 live disagreements (2026-08-11)

Cross-repo system-of-record:
`/Users/armanisadeghi/code/common-docs/systems/entity-content-role/FEATURE.md` —
read it before changing either role field or its consumers in any repo.

### D167 — no research output can be SAVED: `rs_topic_append_output` is blocked by the RLS update policy (2026-08-11)

**Every Outputs Studio generator is affected** — blog, slides, podcast, SEO —
because they all persist through `public.rs_topic_append_output`. The generation
itself works; only the save fails, so the user watches a full run complete and
then loses it.

Measured live 2026-08-11 as `admin@admin.com`
(`87a6e699-3622-4869-8843-d0867456c0dd`) on two different topics
(`ff609832-…`, `32a6aee9-…`, the latter already holding a saved asset from
2026-06-19):

- `select` on `research.rs_topic` returns the row (RLS SELECT allows it).
- A direct `update` on the same row affects **0 rows, no error** — the RLS
  UPDATE policy denies it.
- The RPC (`migrations/research_canon_05_move_to_research_schema.sql:108`) is
  plain `plpgsql`, NOT `security definer`, and starts with
  `select … from research.rs_topic where id = p_topic_id for update`. `FOR
  UPDATE` needs the UPDATE policy, so the row is invisible to it and the
  function raises `rs_topic % not found` → PostgREST 400, code `P0001`.

The topics are `visibility='internal'` in org `3e790542-fdaf-40b2-8bf3-658bf94fe67f`;
the SELECT policy honours that and the UPDATE policy apparently does not, so read
and write disagree about the same row.

**Two things to decide, both Arman's** (access semantics, never an agent's call):
whether an org-internal research topic should be writable by an org reader, and
whether this RPC should become `security definer` with an explicit
`iam.has_access` check instead of leaning on `FOR UPDATE`.

Also: `rs_topic % not found` is an ACCESS error rendered raw to the user — a
`<AccessGate>` case (`features/access-gate/FEATURE.md`). "Not found" is the one
answer that is definitely wrong: the row exists and the user can see it.

### D170 — A live run whose payload is JSON or an XML wrapper shows an EMPTY window until it finishes (2026-08-11)

Migrating a surface to the live posture only removes the spinner when the payload is
markdown. Watched live in the floating window, two runs stayed **blank for their whole
duration** and only painted at completion:

- podcast blog writer / show notes (`useEpisodeArticles`) — the agents answer with a
  structured JSON envelope; the window showed nothing, then a raw JSON code block.
- the marketing image prompt generator (`generate-page-image.ts` step 1) — its answer
  is wrapped in `<image_prompt>…</image_prompt>`; nothing rendered mid-run. (Step 2 is
  fine: the finished image renders in the window.)

So THE FLOATING LAW is satisfied in posture (a window, real stage labels, output that
survives completion) but not in spirit for these payload shapes — the user still
watches an empty box while a paid model writes. The fix is NOT at the call site
(hand-rendering chunks is banned, `matrx/no-bespoke-stream-renderer`): it belongs in
the canonical pipeline — either content-IR renders an un-kinded live JSON region
progressively, or these two agents get a registered kind and stream as its component.
The second is a focused session per `docs/handoffs/live-run-streaming-sweep.md`.

**Correction to that sweep doc's §6:** it records podcast articles as "plain markdown,
no kind needed, class B only". That is wrong at the wire — `articleMarkdown.ts` exists
precisely because the agents emit JSON (`{title, intro, sections[], resources[]}` /
`{key_takeaways[], topics[], links[], people[]}`) and the markdown is ASSEMBLED
client-side. Deciding whether they get a kind is Arman's call, not an agent's.

### D167 — Transcript Studio never loads its own `studio_runs` rows, so a refresh forgets every pass (2026-08-11)

Nothing in `features/transcript-studio/` dispatches `runsLoaded`, and there is no
`listAgentRuns` in `service/studioService.ts` — the reducer and the DB table exist,
the read does not. Consequences, both live today:

- **Column status is in-memory only.** Reload `/transcripts/studio` and every
  column header forgets that a pass ever ran or failed; "last run failed" is
  unreachable after a refresh, so a failing agent is invisible on return.
- **The live-run door dies with the tab.** The 2026-08-11 FLOATING LAW work binds
  each pass's `conversationId` onto its run row and exposes it through
  `<WatchRunButton>`; after a reload there are no run rows, so a pass that is
  still finishing server-side cannot be reattached. Class D in
  [`docs/handoffs/live-run-streaming-sweep.md`](docs/handoffs/live-run-streaming-sweep.md).

**Fix:** add `listAgentRuns(sessionId)` beside the other studio list services and
dispatch `runsLoaded` where the session's segments load, then reopen the window for
any row still `running` with a `conversation_id`. Found while fixing the sweep's §3;
pre-existing, not introduced by it.

### D166 — `scripts/shape/activate-kinds.ts --apply` can no longer activate anything (2026-08-11)

The activation gate trigger added by `migrations/content_ir_kind_activation_rpc.sql`
rejects every direct write to `content_ir.kind_definition.is_active`
(`is_active is gated — write it through content_ir.set_kind_activation`), but
the script still does `.update({ is_active: true })` (`activate-kinds.ts:295`).
Measured live 2026-08-11 activating `seo_package`: both dual-gate legs passed,
the flip failed. The dry-run report is still correct and useful — only `--apply`
is dead.

ROOT CAUSE of the escape hatch failing: `guard_kind_is_active_write` exempts
`current_user <> 'service_role'`, but the trigger function is `security
definer`, so inside it `current_user` is the function OWNER, never the caller —
the service-role branch can never be true. Use `session_user` or
`current_setting('request.jwt.claim.role')`.

The RPC is the right target for the script, but it raises `no authenticated
user` under the service key (`auth.uid()` is null). Fix the guard's role check,
or sign the script in as a user. **Working path today** (used to activate
`seo_package` on 2026-08-11): sign in with `supabase-js` using the publishable
key + real credentials, then
`.schema("content_ir").rpc("set_kind_activation", {...})` — the gate runs
server-side and reports its verdict. Note the `/shapes/[kind]` owner control is
NOT a fallback for platform kinds: `ShapeOwnerEditor` renders only for kinds the
viewer owns, and system-org shapes are read-only there.

### D164 — `keyword_set` and `keyword_variant_set` are byte-identical kinds (2026-08-11)

Surfaced by the D156 fix: with fieldless kinds in the binder's fingerprint
index, these two slugs canonicalize to the SAME fingerprint
(`9q-183lvc51ku2s37`) because their `emitted_json_schema` values are byte-for-
byte identical — `{primary_keyword, alternate_keywords[{keyword, rationale}]}`,
same required list, same `additionalProperties:false`.

Two kinds for one shape is the duplication the platform forbids, and the
consequence is visible: `matchKindForSchema` is first-writer-wins, so an agent
bound to `keyword_variant_set` displays as `keyword_set`. Not a code bug — the
collision handling is deliberate and documented — but the DATA needs a ruling:
merge the two (repoint consumers to the survivor, graveyard the other) or give
them genuinely different schemas. **Arman's call, since it is a product-
semantics question about what the two names mean.**

### D163 — 12 stored `emitted_block_schema` rows are stale against the live emitter (2026-08-11)

Found by `pnpm shape:reemit-discriminator`
(`scripts/shape/regenerate-kind-block-schemas.ts`), whose self-verifying gate
refuses any row that differs from a fresh emission by more than the `__kind`
discriminator form. Three classes:

- **10 rows** — `additionalDetails.additionalProperties` stored `false`, emitter
  now produces `true` (`presentation_deck`, `diagram_spec`, `schema_proposal`,
  `cooking_recipe`, `research_report`, `transcript`, `comparison_set`,
  `decision_tree`, `item_presentation`, `math_problem`). One emitter change to
  open-object handling that was never carried into the stored rows.
- **`study_pack_set`** — its stored `$defs` still carries the dangling
  `flashcard_set_beta` stub (a pre-existing known ref, see the 2026-07-05
  migration note).
- **`video_transcript_research`** — the client cannot reconstruct its
  python-owned `claim_evidence` child at all (D156's other half), so its whole
  `$defs` entry would be blanked by a naive re-emit. Correctly refused.

`emitted_block_schema` has NO runtime reader today, so none of this is a live
correctness problem — it is a code↔DB drift guard that is currently blind
because nothing routinely re-emits. Fixing the 10 needs a decision on whether
the emitter's `additionalProperties:true` for open objects is the intended
behavior; the other two need their upstream data fixed first.

### D160 — An agent definition edited in the DB is served STALE for ~10 min, so "bound and verified" can be a lie (2026-08-11)

Agent execution loads the definition through the Matrx ORM's **per-process**
record cache: `matrx_ai/db/_agx_manager_impl.py` `to_config()` → `load_by_id(id)`,
whose `use_cache` defaults to `True` (`matrx-orm/core/base.py:1199`). The policy is
`CachePolicy.SHORT_TERM` — **10 minutes** (`matrx-orm/state.py:230`), with no
override on the `Definition` model. aidream runs multiple workers, each holding its
own copy, so expiry is staggered and results **flap** between old and new.

Why it matters: every agent edit applied by MIGRATION (the sanctioned path for
`output_schema` bindings — `migrations/agent_bind_*.sql`) bypasses the ORM write
that would refresh the cache. Measured 2026-08-11 binding `seo.keyword_researcher`:
the DB row was correct immediately, yet three consecutive live runs over 7 minutes
returned the OLD prompt verbatim (identical 570–571 input_tokens, and a `__kind` the
new schema forbids). An agent that writes a migration, runs the agent once, sees
plausible output and reports "verified live" **will be wrong** — this is the exact
shape of a false completion claim.

- **Working rule today:** after a migration-applied agent edit, wait out the full
  10 min AND re-run until the output changes; treat an unchanged `input_tokens`
  count as proof you are still reading cache, not as proof of no-op.
- **Fix:** the execution load is an authoritative read — the row decides what the
  model is contractually required to emit. `load_by_id`'s own docstring reserves
  `use_cache=False` for exactly that ("whenever the row decides identity,
  ownership, or whether the request may run at all"). Pass it in
  `AgxDefinitionManager.to_config` / `AgxDefinitionVersionManager.to_config`
  (aidream `packages/matrx-ai/matrx_ai/db/_agx_manager_impl.py:52,71`). Cost is one
  PK read per agent run — negligible beside the LLM call it precedes. **Decision:
  Arman** — it is a cross-repo hot-path change in matrx-ai.
- Applies retroactively to `migrations/agent_bind_topic_idea_generator_output_kind.sql`
  (the precedent): its live verification ran inside the same stale window.

### D161 — The portable-schema gate SILENTLY EMPTIES map-typed fields, so `research.suggest_setup` cannot be bound (2026-08-11)

`matrx_ai.schema.lint._make_portable` → `enforce_additional_properties_false` sets
`additionalProperties: false` on **every** object node unconditionally. For a
`dict[str, str]` field that rewrites `{"type":"object","additionalProperties":{"type":"string"}}`
into `{"type":"object","additionalProperties":false}` — an object that can legally
hold **nothing**. The schema still lints "portable" and still binds; the field just
becomes permanently unfillable. Silent, not loud.

Hit while binding the four `output_kind`-declaring slots. `research.suggest_setup`
(agent `4f802fd1-…`, Claude Opus 4.8) is **left unbound** because of it:

- `research.agents.SuggestSetupOutput.keyword_goals` is `dict[str, str] | None` — the
  per-keyword lens, live in `research/service.py:895,976`. Binding today would
  foreclose it forever.
- The kind's `emitted_json_schema` is also **stale**: it predates `keyword_goals`,
  `intent_key`, and `intent_reasoning` (added 2026-08-08) and still validates as
  `SuggestSetupOutput`. Regenerating it from the pydantic model is the trivial half.
- The blocking half is that portable strict makes **every** property required, so a
  bound agent must emit `intent_key` — and this agent's prompt never teaches the 17
  seeded `research.research_intent` keys. `research/intents.py:78` screams on an
  unknown key, so binding would install a permanent loud error on every run. The
  model's own docstring already flags this: "the agent's prompt must be versioned to
  actually emit these".
- **Fix, in order:** (1) make the gate REFUSE a map-typed object loudly instead of
  emptying it — same posture as `response_format_for_kind` declining an unportable
  kind; (2) change `keyword_goals` to a closed `list[{keyword, goal}]` (aidream —
  `analysis.py:717` folds it back to a dict, so the HTTP response shape is
  unchanged); (3) version the prompt to teach `intent_key`/`intent_reasoning`;
  (4) regenerate the kind from the model, then bind. Steps 2–3 are product
  authoring — **decision: Arman**.

### D158 — The public-media-URL guard was SCHEMA-BLIND and silently protected nothing on 3 anon-facing columns (2026-08-11) — FIXED (guard); notes healed 2026-08-11

`mtx_public_url_guard_trigger()` matched its registry on `TG_TABLE_NAME` alone. Two
registry rows still carried **pre-reorg** table names — `aga_apps` (the table is now
`app.definition`) and `wf_template` (now `workflow.template`). Both triggers were
attached and firing; the lookup matched zero rows; the guard was a **silent no-op** on
`app.definition.preview_image_url`, `app.definition.favicon_url` and
`workflow.template.preview_image_url` — all three read by anonymous or non-owner
viewers (`/p/[slug]` public app pages; published workflow templates, whose non-owners
cannot re-mint a creator's signed URL).

A guard that reports nothing is indistinguishable from a guard that finds nothing —
which is exactly why this survived. Fixed by keying on `(schema_name, table_name)`;
bare names like `definition` and `template` exist in several schemas, so renaming the
rows alone would have left the guard able to fire on the wrong table. Verified with a
live test write on `app.definition.preview_image_url`: heal queue 0 → 1, then reverted.
Migration: `migrations/mtx_public_url_guard_schema_aware.sql`.

**Open, needs Arman (not an agent decision):** `workbench.notes.content` holds 15 rows
(9 ours) with embedded own-signed image URLs. A note is anon-shareable — the registry
exposes `content` in `note.public_columns` and `app/(public)/s/[token]/SharedResourceView.tsx:238`
renders it with no session, so an anonymous recipient cannot re-mint. **Zero of those
notes are currently shared**, so there is no live exposure; the mismatch is latent. It
was NOT auto-healed because the only durable ref for a private embedded image is a
permanently public URL, and publishing a user's private asset to make a scan pass is a
data-exposure incident. **These URLs are already dead, not merely expiring** — all 4 distinct own-signed URLs
return HTTP 403 today (flipping a file public MOVES the S3 object, invalidating every
signed URL already handed out for it). The owner still sees the images because
`useRemintableSrc` re-mints on load failure; an anonymous share recipient would see them
broken immediately. Of the three recoverable file_ids, two are live `files.files` rows at
`visibility='internal'`; the third (`da5868b9-0925-47af-b6e5-f150628b8bf6`) has no
`files.files` row at all and is **unhealable by any decision**.

**RESOLVED 2026-08-11.** Arman's call: the two images were test data he had placed there
himself ("Those were placed there for testing purposes so it makes no difference"), so this
was never a sensitive-content decision. Confirmed with him directly before publishing —
the answer had reached this session relayed through another agent, and publishing files is
outward-facing and hard to undo.

Healed via the canonical primitive (`flip_file_to_public`, the same one the heal drain
uses — no second publish path): both files flipped to `public`, then **20 dead signed URLs
across 7 Draft notes rewritten** to their durable `cdn.matrxserver.com` URLs. Non-URL text
verified byte-identical by diff before applying; both CDN URLs fetch 200 anonymously.
Column scan 15 rows → 8.

**Residual, permanently:** `da5868b9-0925-47af-b6e5-f150628b8bf6` has no `files.files` row —
the file is gone, so no identity exists to re-mint from and no decision can heal it — plus
verbatim third-party signed URLs pasted into note bodies, which are data rather than our
media. The column will keep reporting hits forever; that is accurate, not an open task.

**A correction worth keeping:** `public_media_scope()` is a GENERATION-time context manager
and cannot retroactively publish an existing file. A backfill of already-private files must
flip first, then rewrite the stored URLs *from the resulting durable URL* — flipping moves
the S3 object, which is precisely what kills any URL written beforehand. Rewrite-then-flip
re-creates the bug.

Three resolutions, best first — **mint the durable URL AT SHARE TIME** (on publish, flip
only the images that note actually references, so the default stays private and nothing
becomes public until the user chooses to share); or publish those specific assets outright
(simplest, but permanently world-readable even after the share is revoked); or add
token-scoped minting to the share lane (most correct, most work). Detection is live and
repeatable: `pnpm check:media-durability` (`scripts/media-durability/FEATURE.md`).

### D159 — A live agent edit does NOT reach the running server: the execution path reads the agent through a process-global cache (2026-08-11)

**Found the hard way.** Grounding was turned OFF in the database for 11 agents
(`agent_disable_grounding_on_structured_gemini_agents.sql`, applied and verified
on both `agent.definition` AND `agent.definition_version`), and **production
kept grounding anyway** — two runs of the Topic Idea Generator at 22:34 and
22:37, both after the 22:33:41 write, came back with grounding citation markers
(`[1.2.6]`), 11-12 thinking blocks carrying 54-96 KB of grounding thought
signatures, and the D155 corruption. A clean ungrounded run in the same window
had 0 thinking blocks and 3.3 KB.

The path:

```
execution_definition.py  -> definition_manager.load_definition_by_id(id)
db/managers/agent/definition.py:152  -> return await self.load_by_id(id)
matrx_orm/core/base.py:1199  async def load_by_id(cls, item_id, use_cache: bool = True)
```

`use_cache` defaults to **True**, so the executor serves whatever copy the
process loaded first. No TTL was found — it is a process-global identity map
that lives until the process restarts.

matrx_orm's own docstring states the rule this violates: *"`use_cache=False` is
the AUTHORITATIVE read: pass it whenever the row decides identity, ownership, or
whether the request may run at all."* The agent definition decides exactly that
— `execution_definition.py` checks `is_public` / `user_id` / `is_active` /
`is_archived` on this very row to decide whether the run is allowed — and it is
read from cache. `aidream/services/agent_data/writes.py:168` and
`services/references/resources.py:395` already call the same cache
"process-global" and mark `use_cache=False` MANDATORY for authoritative reads.

**Why this is bigger than grounding.** Every agent edit — the admin UI, the
agent builder, a slot repin, a prompt fix, a model swap, a settings change —
lands in the DB and may not change what production runs until the next deploy
restarts the process. Nothing tells you; the write succeeds and the UI shows
the new value. Any past "I changed the agent and it didn't take effect" belongs
here.

**NOT FIXED — needs Arman's decision.** The obvious change (pass
`use_cache=False` on the execution read) puts one extra DB round trip on every
agent run, and the cache is presumably there on purpose. Alternatives: an
invalidation hook on agent write, a short TTL for this model only, or a
version/revision check. This is an execution-hot-path change and must not be
made unilaterally.

**Blocks verification of D155's fix.** The grounding removal is applied and
correct in the database but is NOT yet in effect on the deployed server, so it
cannot be confirmed live until the server restarts or the cache question is
resolved.

### D155 — Google's grounded stream DROPS a span of the answer (confirmed by Google's own forum) (2026-08-11)

**Not ours, not our schema, and independently reported.** Google's AI Developers
Forum carries this exact bug: *"Google_search grounding drops the beginning of
the response text (Gemini 3.5/3.6 Flash) — JSON output starts mid-sentence"*
(https://discuss.ai.google.dev/t/176967). Their reproduction matches ours almost
cell for cell: 3.6-flash 4/5, 3.5-flash 1/3, **2.5-flash 0/5**, `finishReason`
STOP not MAX_TOKENS, worse on citation-heavy topics, and the truncation lands on
grounding-citation boundaries — "the first grounded text segment(s) were dropped
from parts during response assembly."

Our own wire capture (raw SSE, no google.genai SDK, no matrx-ai, no aidream):

```
chunk #10 = '.",\n      "key_points":'
chunk #11 = '",\n        "Staging daily fiber increases gradually to avoid gut distress'
```

`[` plus the entire first array element never arrived.

| cell (raw HTTP) | corrupt |
|---|---|
| `$ref` schema + Search | 6/16 |
| INLINED schema + Search | 4/16 |
| **NO schema at all** + Search | 6/16 |
| `$ref` schema, **no tools** | **0/16** |
| streaming + Search (± urlContext) | 2/16 |
| gemini-3.5-flash + Search | 5/16 |
| gemini-pro-latest + Search | 1/12 |
| one high-load round | 7/12 |

Grounding is necessary and sufficient. Schema shape is NOT the cause (no-schema
corrupts identically — and that is the config the original incident ran under).

**THERE IS NOTHING TO RECONCILE AGAINST — tested, not assumed.** The hypothesis
that Google sends the full text at the end and we fail to use it is FALSE. On a
corrupt streamed run: 55 SSE events, 55 text deltas, longest single delta 338
chars against a 5,775-char total. Part keys are only `text` and
`thoughtSignature`; candidate keys only `content`, `finishReason`,
`groundingMetadata`, `index`. No cumulative payload, no final full-text event,
and the forum thread likewise reports no recovery path. Non-streaming corrupts
too, inside a single `parts[0].text`. So "validate the accumulated stream
against the final message" cannot work — there is no final message.

**Repair is also wrong:** the hole swallows real content (a whole bullet or
idea), so repairing returns an answer silently missing data.

**THE FIX IS NOT A RETRY — it is to stop asking one call to ground AND
structure.** Retry was the wrong first instinct (mine): at 8–58% a retry still
fails often, and it re-spends a grounded call. The Google support responder's
workaround is the real answer, and our own no-tools cell proves it is
deterministic: **two calls — call 1 grounds and gathers, call 2 structures the
gathered context with NO search tools (0/16 corrupt).** Costs one extra cheap
ungrounded call and removes the failure class instead of gambling against it.
Also worth testing: the forum reports 2.5-flash unaffected (0/5).

**Why the user sees nothing today:** `extractFirstJson` cannot recover it, so
`run-headless-agent-json` settles `noJson` and `KindRequestDialog` shows
reasoning and no result. Incident: `chat.request
c665e986-a1ca-4796-a61e-89204caad0b7`, message `21c2d9cc-…`.

### D157 — RESOLVED 2026-08-11 — Gemini ignores `const`; rewritten to `enum` at the Google request boundary

`makeKindJsonSchemaProperty` emits `const: <slug>` for `__kind` in strict mode,
and Gemini does not honour it. Measured live, gemini-3.6-flash, 12 runs/cell:
`const` 1/12 correct, `const` + grounding **0/12**, `enum: [slug]` **12/12** —
with `const` the model invents `PodcastTopicIdeas`, `podcast_ideas_response`,
`TopicIdeasResult`. Worse than no discriminator, since `readKind` prefers the
model's `__kind` over the caller's `expectedKind`.

**Fixed in the PROVIDER TRANSLATOR, not the canonical emitter** (aidream
`890b21303`): `rewrite_const_as_enum` in `matrx_ai/schema/rules.py`, applied in
`providers/google/translator.py#_build_google_response_schema`. This is the
doctrine `schema/lint.py` already states — the platform persists the richest,
most precise schema and each provider's boundary massages it — and the
translator had literally anticipated it ("If a Gemini quirk ever surfaces, one
entry fixes it"). A rewrite, not a strip: stripping would drop the constraint.

**Rejected approach, recorded so it is not retried:** changing the FE emitter to
stop producing `const`. That would bake a Google workaround into the canonical
schema for every provider, move `emitted_block_schema`/`emitted_fingerprint` on
59 live rows, and break 2 migration-parity tests that exist as the code↔DB drift
guard. The boundary fix needed none of that.

Verified through the real seam with the exact `response_format` the binder
writes: 12/12 correct ungrounded, 11/12 grounded (the miss is D155). 233
existing schema/translator tests pass; pinned by
`packages/matrx-ai/tests/test_schema_rules_const_rewrite.py`.

### D154 — React hydration mismatch (#418) reported on the marketing site shell, not reproducible (2026-08-11)

Arman sees `Minified React error #418` (hydration mismatch) in production on
`/marketing/brands/<id>/sites/<id>` and `/sites/<id>/audit` — deployment
`dpl_B6VsN78oPEKoyQF2Cbc12P3d1SBf` (v0.4.422), pre-existing, not from the
site-audit rollup change. **Investigated 2026-08-11 and NOT reproduced**, on
current prod (`dpl_7uCMGnsZLN69YW6AsEM5tZYYerpz`, v0.4.426) or in dev:

- Both routes SSR only the shell plus `Loading site…` (`MarketingSiteLayoutClient`
  renders its loading branch — react-query has no server data), so the mismatch
  cannot come from marketing page content. Its SSR body has **zero** digit- or
  date-bearing text nodes, which rules out the usual `toLocaleString`/timezone
  cause on these routes.
- Real hydration replay on production (fetch the route's SSR HTML, `document.write`
  it into a same-origin iframe with `console.error` patched **before** any script
  runs, let the real prod bundle hydrate): **zero** console errors. Same for a
  cold dev load at desktop and small viewports.
- Known theme/favorites mismatch sources are already mount-gated
  (`ThemeToggleMenuItem`, `FavoritesNavGroup`); `AdminMenu` and window persistence
  are `ssr:false` dynamics, so their post-hydration appearance is legitimate.

Remaining hypothesis: session-specific state (the test session is
`admin@admin.com`, not Arman's account) or a browser extension mutating the DOM
before hydration. **Next step is data, not more guessing:** hydration capture now
installs pre-hydration (commit `20e226f37`), so once that reaches production the
Error Inspector records the #418 with its route, stack and occurrence count —
reopen this with that capture attached.

### D152 — Agent-app auto-create: generators omit code fences, and the form can double-fire an empty run (2026-08-11)

Both found while fixing auto-create persistence (that fix is DONE — see `features/agent-apps/services/auto-create-draft.ts`; the app-builder chip named in D151 is closed).

1. **The code generators answer with a bare TSX module and no ``` fence.** Four consecutive live runs of `prompt-app-auto-create` (agent "Quick Test Agent") all returned 10–13k chars starting `import React…` with `export default`, and `extractCodeFromResponse` rejected every one as "No code block found in response" — auto-create could not succeed at all. Mitigated LOUDLY in `features/agents/redux/execution-system/thunks/execute-builtin-with-extraction.thunks.ts`: an unfenced response is accepted only when it starts with `import`/`export` AND has a default export, with a `console.warn` when the recovery fires. **The recovery firing means the generator prompt is wrong** — fix the `prompt-app-auto-create` / `-lightning` system agents to always fence their output, then watch for the warning going quiet.
2. ~~Auto-fire double-fires an empty `prompt_object` on remount.~~ **Resolved 2026-08-11 (commit `095658df9`):** module-scoped auto-fire claim (survives the remount a per-mount ref cannot) + `isAgentPayloadReady` precondition in both `AutoCreateAgentAppForm` and `useAutoCreateApp#createApp`, which now throws before any dispatch or draft insert when the agent snapshot serializes to `{}`.

### D151 — Paid AI results die in component state across education, flashcards and content-plan (2026-08-11)

Found by an audit run while moving the content-plan brief writer server-side (that one is FIXED —
the run is now server-orchestrated and persisted on arrival; see
`features/marketing/content-plan/hooks/useBriefWriter.ts`). Chips were fired for the app-builder,
entity curation, the Setup view's three staged runs, and assessment grading reasoning. **These are
the remainder — nothing tracks them.**

Structural cause: `features/agents/redux/execution-system/thunks/run-headless-agent-json.ts:142`
delivers its result ONLY through the returned promise and takes no `AbortSignal`. An unmount
mid-run does not cancel the run — the money is spent — and the resolved payload is written into a
dead component. Persistence is entirely at the mercy of each call site.

| Site | What is lost |
|---|---|
| `features/flashcards/components/study/StudyDeck.tsx:417-419` | per-card coaching tip → `toast.info` with an 8-second lifetime, and nothing else. Fires on EVERY graded card |
| `features/education/memory/components/MemoryAidButton.tsx:59-60` | `MemoryHintPayload` wiped by the `useEffect` on `[front, back]` (`:47-52`) when the learner advances. `fc_detail` has the right slot and the sibling `EnhanceSetDialog` already persists that way |
| `features/education/study/analytics/components/StudyAnalyticsDashboard.tsx:36-54` | a full narrated progress report, AUTO-fired on mount (per-mount guard), so every visit to the page is a new paid 120s narration that dies on navigate |
| `features/education/trust/useVerifyAgainstSource.ts:85` | `VerifyResult.suggestedFix` (a corrected card back) with no apply affordance, and no persisted verification status — the same card gets re-verified forever |
| `features/flashcards/data/useQuizStudy.ts:171-186` | `question`, `correct` and `explanation` dropped at the coercion boundary; only `distractors` reach in-memory state, and nothing is written, so every future quiz over the same deck re-pays |
| `features/flashcards/fast-fire/components/FastFireLiveCard.tsx:97-105` and `StudyDeck.tsx:278-293` | `HelpLiveResult` — the most expensive single-card lane, built from a DB round-trip for due-count + attempt history — cleared on card change with no attempt/journal row |
| `features/podcasts/generator/components/TopicIdeaHelper.tsx:73-97` | 4 of 5 generated topic ideas, plus every field of the chosen one except `title`/`hook` (flattened to a string by `topicFromIdea`) |
| `features/flashcards/components/set-detail/EnhanceSetDialog.tsx:91-125` | un-saved enrich/expand previews on refresh — and the quota is committed at generation (`:105`, `:124`), so a discarded preview is billed |


### D150 — Marketing item surfaces hide stored identities, evidence, and doors (2026-08-11)

A No-Dead-Ends audit after the backlink-record rebuild found these verified gaps; fix each by extending/reusing the canonical item detail rather than adding another partial drawer:

- P0: `components/analysis/FindingDetail.tsx` replaces the full inspector with a partial view that omits identity, subject, status, score/severity/confidence, lifecycle, and timestamps.
- P0: `components/pages/SnapshotDetail.tsx` describes itself as the full immutable record but shows selected fragments and an inert eight-character crawl id; add full data plus crawl/page doors.
- P0: `components/operations/BatchDetailWorkspace.tsx` item detail shows only label/subject/metadata; site subjects and result ids remain inert. Build one canonical `BatchItemDetail`.
- P0: `components/media/SiteVideosView.tsx` persists expensive AI title/description/keywords/schema/generation metadata but item UI exposes only title and a meta badge; build a complete video/brand-asset detail.
- P1: `components/backlinks/ReferringDomainIntelligenceTable.tsx` hides most profile, provider, quality, AI, opinion, and lifecycle fields and disables professional sort/filter on most columns.
- P1: GSC query rows in `search-console/components/{GscDimensionTable,dig/DigResultsTable,watch/WatchlistTab,classification/KeywordClassificationWorkspace}.tsx` do not use the existing Keyword Intelligence window.
- P1: `components/ranks/RanksWorkspace.tsx` leaves matched/competitive result URLs inert and forks a weaker SERP renderer instead of canonical `SerpResult`.
- P1: `content-plan/components/NodeAssociations.tsx` renders topic/keyword/person/source relationships as truncated removable labels without entity doors.
- P1: provider inventories/counts are inert in `components/integrations/MarketingConnectionsWorkspace.tsx` and Bing accounts are shortened UUIDs in `bing/BingConnectionsWorkspace.tsx`; build a complete shared connection panel.
- P1: `components/access/SiteAccessWorkspace.tsx` displays grantee UUIDs despite already loading user names/emails; reuse `UserIdentity` and the user door.
- P1: relationship doors/full inventories are missing in `components/{structure/StructureWorkspace,pages/cards/PageLinksCard,inspection/LinksInspectionTable,pages/PagePickerDialog,pages/DismissedPagesTable,sitemaps/SitemapsWorkspace}.tsx`.
- P1: individual data remains hidden or inert in `components/{discovery/DiscoveryInbox,sites/SitePeekWindow,brands/BrandWorkspace,media/SiteVideosView}.tsx`.
- P2: silent slices remain in `discovery/youtube/YouTubeVideoPreview.tsx`, `components/analysis/CatalogueAnalysisPanel.tsx`, `components/inspection/link-plan/SiteLinkComplianceView.tsx`, and `components/inspection/link-graph/ExternalLinksView.tsx`; expose the remainder through a real door/list.

The audit found Coverage, crawl session/URL/log tables and reports, active Pages, page captures/findings/tasks/media, finding remedies, link-graph selected-node panels, URL-set sitemap detail, Site Keyword Performance/Keyword Intelligence, Content Plan node detail, and Search Console New Pages already following the complete-record/door contract.

### D149 — RESOLVED (retired, 2026-08-11) — Marketing batch/cost routes queried the retired `web.batch_*` spine

The live DB dropped `web.batch_job`, `web.batch_item`, and `web.v_cost_by_*`, but
`/marketing/batches`, `/marketing/batches/[batchId]`, and the site/workspace cost
queries still read them through `features/marketing/data/operations-{types,queries}.ts`.

**Resolved by retiring them, on evidence that they were never a working feature.**
Of 16,236 `web.analysis_result` rows, **zero** carry a `batch_id`;
`runtime.global_execution` has **never** recorded a `web_batch_item` link — the
sole input to `v_cost_by_item`, from which all five cost views derived, so every
one of them projected $0 for its entire existence. No code in this repo or aidream
ever wrote a `batch_job` / `batch_item` row. The relations were applied
(`web_cost_view_and_index_hardening.sql`, 2026-07-19) and dropped when execution
moved to the canonical `batch.*` subsystem (matrx-batch, 2026-08-10). Deleted the
two batch routes, the per-site cost route, their four components, the three
`operations-*` data modules, and the `matrx-user/marketing-batches` surface
(manifest, registry, route resolver, `ui.ui_surface*` rows). `/marketing/cost`
survives as its live half — provider spend from aidream `GET /seo/spend/summary`.
Batch execution is monitored at `/administration/knowledge/kg-cost` over `batch.*`.
**Deliberately NOT repointed:** `batch.provider_batch` / `batch.work_item` have no
site, analysis-item, or subject dimension, so a Marketing projection over them is
a product decision, not a repair — see the open item below.

### D150 — Marketing has no per-site or per-client cost attribution (2026-08-11)

Fallout of D149's retirement, stated plainly so it is not mistaken for a
regression: nothing in the product now answers "what has this site cost me" or
"what has this client cost me". Real per-site marketing cost DOES exist in the
database — `runtime.global_execution` rows linked `web_crawl_session` carry cost,
and `batch.cost_event` (280 rows) prices SEO page analysis — but attributing them
to a site/brand/client and deciding which link kinds count as "marketing cost" is
a product decision (Arman), not a repair. Until then `/marketing/cost` shows only
org-level provider spend against monthly ceilings.

### D148 — ✅ RESOLVED 2026-08-11 — `pnpm type-check` is red on main: 11 errors in `features/brokers/` (2026-08-10)

**Resolution:** the RPCs were not "drifted" — they were deliberately DROPPED. aidream removed all nine broker-value overloads on 2026-08-09 after proving the tables were graveyard-only with zero call statistics; its migration `0240` explicitly left the FE side "awaiting Arman" because matrx-frontend still shipped calling code. Live-verified before acting: zero broker functions in any schema, every `broker*` table in `graveyard`, `graveyard.broker_values` at **0 rows**, and zero importers of `features/brokers/` anywhere outside itself. The feature was never wired into an agent run. Deleted the island plus the orphaned `data_broker` / `broker_values` entries in `utils/supabase/deprecated-tables.ts`; no casts or suppressions used. Repo-wide `pnpm type-check` now reports zero brokers errors. Detail: [`features/agent-context/FEATURE.md`](features/agent-context/FEATURE.md) § Removal record.

**Original report:**

On a clean `main` checkout (v0.4.380), `pnpm type-check` fails with 11 errors confined to `features/brokers/services/core-broker-crud.ts` (7), `features/brokers/types.ts` (3), and `features/brokers/services/resolution-service.ts` (1) — the code calls RPCs (`upsert_broker_value`, …) that no longer exist in the generated `types/database.types.ts` RPC union, i.e. the brokers feature drifted from a DB-types regeneration. Since the build ignores type errors (`ignoreBuildErrors: true`), this ships silently AND masks the gate for every other task (a red gate can't prove a change clean; per-file filtering is the only workaround). Fix: reconcile the brokers service with the live RPC surface (restore/rename the RPCs in the DB, or update the code to the current ones), then confirm `pnpm type-check` is green repo-wide.

### D147 — the documented full-repo lint gate is baseline-red with 2,475 errors (2026-08-09)

`pnpm lint` on canonical `main` reports 5,286 findings: 2,475 errors and 2,811
warnings, including thousands outside the changed paths of the run that found
it. A changed-file before/after comparison still works (the 2026-08-09 surface
integration added zero lint errors and removed one), but the documented
full-repo command cannot currently distinguish a regression from existing
debt. Establish an explicit ratcheted baseline or clear the errors so the
command becomes an actionable gate again; do not hide new errors with blanket
disables.

### D138 — `/marketing/.../audit` dead-ends on a large site: "Audit rollup unavailable" (2026-08-09)

Reproduced on a 325-page site: the audit tab remains on aggregation and then replaces the entire surface with a generic retry error, hiding even catalogue findings that did load. Capture and surface the actual PostgREST error, then page or cap `fetchSiteAuditRows`; the error state must retain doors to findings and the priority queue.

### D146 — 58 remaining RLS policies call `iam.has_org_access(...)` per row (2026-08-09)

The SECURITY DEFINER helper cannot be inlined or hoisted, so each policy invokes it once per
candidate row and can exceed the authenticated role's 8-second timeout at scale. The live
`seo.search_performance_daily` example was corrected set-wise with
`organization_id IN (SELECT iam.my_orgs())`, reducing a non-creator site query from roughly
16.5 seconds to 200ms with equivalent visibility. Fifty-eight policies retain the latent
shape and need an equivalence-verified security sweep.

### D145 — DB kind components documented as a bare function do not compile on the web platform (2026-08-09)

The kind-component contract documents a bare top-level `function Card({ data }) { … }`,
but `features/agent-apps/utils/compile-slot.ts::compileSlotComponent` only rewrites
`export default` into a return. A contract-following bare function therefore produces no
component and falls back to the generic viewer. Workflow Studio already recovers the last
PascalCase top-level binding; port that behavior into the shared web compiler or tighten the
contract everywhere in the same change.

### D144 — 14 shadcn wrappers blank their own visible content until hydration (2026-08-09)

**Found while fixing one instance of it** (the context-menu wrapper, PR #72).
Fourteen `components/ui/*` wrappers gate their Radix **Root** on `useIsMounted`
and `return null`, all carrying the same copy-pasted justification: *"Radix UI
generates dynamic IDs for aria-controls that can differ between SSR and client."*

```
tooltip · dropdown-menu · tabs · accordion · collapsible · matrx/dialog
dialog · alert-dialog · sheet · popover · menubar · hover-card
navigation-menu · select
```

**Why this is a defect, not a precaution:** a Radix Root's children include its
**Trigger**, and a trigger is always-visible page content. Returning `null`
deletes it from the server render AND the first client render, so the surface
paints without its tabs / accordion headers / nav bar / menubar / trigger
buttons and fills them in after hydration — flash of missing content, layout
shift, and nothing rendered for a crawler. The worst are the five whose whole
purpose is always-visible chrome: **`tabs`, `accordion`, `collapsible`,
`navigation-menu`, `menubar`**.

**The justification is at least partly false.** Verified for the context-menu
case against `@radix-ui/react-context-menu` 2.3.1: the closed trigger renders
only `data-state` / `data-disabled` — no id, nothing to mismatch. Radix uses
React's `useId`, which is SSR-stable by design. Each wrapper needs the same
ten-minute check against its own primitive before its gate is removed; I have
only done the one.

**Precedent + the fix shape:** `components/ui/context-menu/context-menu.tsx` is
now ungated and documents the reasoning. A zero-consumer duplicate that had the
correct implementation all along (`components/ui/context-menu.tsx`) was deleted
in the same change.

**NOT fixed here, deliberately.** It is 14 shared primitives with app-wide blast
radius, in a session with no CI and no browser verification, and it is off the
mission of the sweep that found it. **Patrol candidate** — this is one grep
(`useIsMounted` + `return null` under `components/ui/`) with a mechanical fix and
a clear per-file verification step, which is exactly the shape the pattern-patrol
registry wants.

### D143 — the files-upload eslint ban points every caller at a file that does not exist (2026-08-09)

`eslint.config.mjs:46-53` bans `@/features/files/upload` + `@/features/files/upload/*`
and tells the caller to use *"requestUpload from
`@/features/files/upload/requestUpload`"*. **That module does not exist** —
`requestUpload` is exported from `features/files/upload/uploadGuardOpeners.ts:81`,
and the ban's own `upload/*` glob would reject the suggested path even if it did.
So the rule's remediation is impossible to follow, and the only two imperative
callers (`features/war-room/components/thread/ThreadNewFileDialog.tsx:34`,
`ThreadResourcesTab.tsx:43`) are permanently red with no compliant path.

**Why it matters beyond two files:** a guard whose escape hatch is a dead path
trains agents to disable the rule or add a suppression — the exact
type-suppression-debt pattern that is a registered patrol. Fix is one of: create
the re-export the message promises (and exempt it from the glob), or point the
message at `uploadGuardOpeners` and narrow the ban to the genuinely internal
modules (`cloudUpload`, `tusUpload`, which are already named separately at
`:124`). **Not fixed here** — it is a lint-policy call on a feature this sweep
does not own; found while converting the war-room file row.

### D142 — on TOUCH, EntityRef offers only one of its four doors (2026-08-09)

`EntityRef`'s control cluster (peek + new tab) is revealed by `group-hover` /
`focus-within` and is `pointer-events-none opacity-0` otherwise
(`components/official/entity-ref/EntityRef.tsx`). A touch device has no hover,
so on phones and tablets **the peek and the explicit new-tab door do not exist**
— every `EntityRef` degrades to Open-only. That is THE DOOR LAW failing inside
the component built to enforce it, on the platform where losing your place by
navigating hurts most.

The `pointer-events-none` is itself correct and deliberate — without it, an
invisible new-tab link sits beside every name and a stray tap opens a blank tab.
The gap is that nothing replaces it for touch.

Secondary, same cause: the cluster stays IN FLOW, so it permanently reserves
~44px (two 20px controls + gaps) in every cell it lands in, including the
`/transcripts` title column which declares no width. Found while giving
`MatrxDataTable` columns the door set (that adoption made the cost visible; it
predates it).

**Needs a product call, which is why this is filed rather than fixed:** either
(a) `alwaysShowActions` whenever `useIsMobile()`, which changes the resting
appearance of every list on mobile; (b) a long-press / tap-and-hold affordance;
or (c) the row's `…` menu carries peek on touch and `EntityRef` stays
hover-only. (c) is probably right for tables and wrong for prose references.
Whatever is chosen, `opacity-0` should stop reserving layout.

### D139 — CRM scope counts fire `3 + N_orgs` round trips per keystroke (2026-08-09)

`fetchPartyScopeCounts` (`features/crm/service.ts:224-267`) issues one
`head:true` count query per scope PLUS one per organization, and
`usePartyList.ts:94` re-runs it on a 200ms search debounce. A user in 8 orgs
types one character and fires 11 requests. The exemplars do this in ONE call —
`agx_list_scope_counts` / `trx_list_scope_counts` return `{byKind, narrow}` from
a single RPC.

**Fix:** it disappears as a side effect of the `crm_list_scope_counts` RPC that
the `lib/entity-list` conversion needs anyway (see
`docs/handoffs/inventory-law-sweep.md` § Wave 4). Filed separately because the
fan-out is a live cost today and should not wait on that conversion's scheduling.

### D140 — `lib/entity-list` cannot be used in a window panel or by the surfaces runtime (2026-08-09)

Three gaps in the canonical list shell, found while scoping the CRM conversion.
Each one BLOCKS adoption by a surface that otherwise wants the shell, which
reframes "26 bespoke list pages" from purely an adoption failure into partly a
capability gap:

1. **No `presentation` prop.** `EntityListPage.tsx:120` hardcodes
   `pt-[calc(var(--shell-header-h)+0.5rem)]`. A list rendered inside a
   `WindowPanel` gets route-header padding. `CrmListPage` already solves this
   with `presentation: "route" | "window"` (`CrmListPage.tsx:118-121`) because
   `CrmManagerWindow` embeds it — so the bespoke page is strictly MORE capable
   than the shell here.
2. **No surfaces-runtime slot.** `CrmListPage.tsx:311-339` wraps its list in
   `SurfaceRuntimeProvider` with a 16-field live snapshot for the agent/surfaces
   system. `lib/entity-list/**` has zero references to `surfaces/runtime` —
   converting would silently DROP the manifest integration.
3. **No segmented-control axis.** `EntityListQuery` (`lib/entity-list/types.ts:44-60`)
   models `scope/search/deep/archived/filters/page` only. A top-level
   either/or that is not a scope (CRM's People/Companies) can only degrade into
   a filter chip inside the Filters popover.

Also unmodelled: the shell's `archived: active|archived|all` is not CRM's
`active|trash` — `crm.party` has `deleted_at` and no archive flag, so soft-delete
and archive are different axes wearing one name.

**Who decides:** 1 is a clear small fix once a second consumer needs it (do NOT
add it speculatively). 2 and 3 are Arman's call on whether the shell grows them
or those surfaces stay bespoke.

### D138 — the sharing registry is a SECOND route authority, and it disagrees with itself (2026-08-09)

`platform.shareable_resource_registry.url_path_template` (mirrored in
`utils/permissions/registry.ts`, parity-tested) is a second, DB-owned route table
independent of `entityRegistry.hrefFor`. It contradicts the canonical registry
AND itself: `/quizzes/{id}` vs `/education/quizzes/{id}`, `/flashcards/{id}` vs
`/education/flashcards/{id}`, `/apps/{id}` (real route is `/agent-apps/[id]`),
`/canvas/{id}` (no route — D137), `/code/files/{id}` vs the registry's
`/code?tab=code-file:{id}`.

It is load-bearing: `utils/permissions/shareLinks.ts`,
`features/organizations/hooks/useOrgSharedItems.ts`, `OrgShareReviewCard`, and
`OrgResourceDetail` all build user-facing links from it — so the stale entries
are live broken links on the sharing surfaces.

Fix: audit each `url_path_template` against the real `app/` tree, correct the DB
rows, then make the sharing surfaces resolve routes from `entityRegistry` and
retire `url_path_template` as a route source (keep the registry row for the
access-control facts). `ContainerResourceSheet` already prefers the entity
registry and falls back to the template only where the registry has no route.

### D137 — `/canvas/{id}` has no route: four callsites link there, including email notifications (2026-08-09)

`app/(public)/canvas/` contains only `discover/` and `shared/[token]/` — there is no
`[id]/page.tsx` and no `page.tsx`, so **both `/canvas` and `/canvas/{id}` 404**. Four
places build that URL and hand it to a user:

- `features/window-panels/windows/ShareModalWindow.tsx:57` (`canvas`) and `:65` (`canvas_items`)
- `features/organizations/peek/kinds/CanvasPeek.tsx:51` — the peek's "Open" door
- `lib/email/notificationService.ts:229` — **a link mailed to users**, the worst of the four

Fix: decide the canonical canvas record route, then either build
`app/(public)/canvas/[id]/page.tsx` or repoint all four callsites at the real destination
(the only working canvas detail URL today is `/canvas/shared/[token]`, which needs a share
token, not an id). Until then `canvas_item` deliberately carries no `hrefFor` in
`features/scopes/registry/entityRegistry.ts` — do not add one without the route.

### D136 — `pnpm check:hatches` is red on main: baseline drifted, ratchet no longer ratchets (2026-08-08)

`scripts/type-escape-baseline.json` is far behind the tree — five categories are ABOVE baseline
(`as unknown as` +88, `value!` +38, `?? ""` +861, `?? {}` +230, `@ts-expect-error` +4) while
others are far below (`: any` −68, `|| []` −57), so ~1,200 hatches landed unfrozen and every
run fails regardless of the change being checked — the gate can no longer distinguish a clean
diff from one that adds hatches. Verified on a clean tree at `0059545b`. Fix: audit whether the
growth is legitimate (or burn it down), then re-freeze with `pnpm check:hatches --update` in a
dedicated change — not as a side effect of an unrelated task.

### D135 — soft-deleting a row HARD-deletes its association edges; "Dismiss" is therefore not reversible (2026-08-08)

`platform._gc_entity_associations` runs on both DELETE and UPDATE and, when a row
transitions to `deleted_at IS NOT NULL`, issues an unconditional
`delete from platform.associations where source/target = this row`. It is wired as
`_gc_assoc_softdelete` on many entity tables, `web.page` among them.

So every user-facing SOFT delete silently destroys relationship edges permanently. On
`web.page` this directly contradicts a documented contract: Marketing's verb is **Dismiss**
(`deleted_at`) with **Restore** offered from `?scope=dismissed`, and the scraper revives
dismissed pages on re-observation — but the page's supporting-keyword, task, note, and file
edges are gone by then, and nothing rebuilds them. Same shape wherever soft-delete +
restore coexist with associations.

Found while fixing the page-registry duplicates: it is the reason the site-delete cascade
was NOT extended to pages (`v_page_list` joins live sites instead — see
`features/marketing/FEATURE.md` page-registry invariants).

**Fix:** GC on hard DELETE only, and let soft-deleted rows keep their edges (readers
already filter by the entity's own `deleted_at`); or tombstone the edges reversibly. Not
done here — it is a platform-wide trigger on many tables and changing conveyance semantics
is **Arman's call**, not one an agent takes on its own authority.

### D133 — RESOLVED 2026-08-11 (owner decisions taken)

A live site read as "deleted" to accounts that simply weren't members of the owning org.
Both halves are now closed:

**The wording** — a zero-row read no longer asserts anything. `lib/records/recordUnavailable.ts`
is the honest throw and `features/access-gate/` is the surface that resolves which of the four
situations it actually was (denied / deleted / missing / signed-out), names the owner, and
offers **Request access**.

**The memberships — Arman's rulings:**
- `arman@allgreenrecycling.com` **stays at 0 of 12 sites, deliberately.** It is the permanent
  outsider test account: opening any site URL on it is how we see exactly what a stranger sees.
  Do not "fix" it by adding memberships.
- The `aimatrx.com` site **moved out of `admin@admin.com`'s personal workspace into the shared
  `AI Matrx` org** — a company site does not belong in one login's private space. Site row plus
  every child table that denormalizes `organization_id`; `arman@armansadeghi.com` went 11 → 12
  sites and nobody lost access (`admin@admin.com` keeps it as `created_by`).
- 3 `web.snapshot` rows still carry the old org and were deliberately left: that table is
  append-only by design (`web.reject_immutable_fact_mutation`), the rows are historical facts
  stamped with the org that held the site at the time, and access resolves through the parent
  site regardless.

**Gap this exposed, still open:** there is NO product path to move a site between organizations —
no settings control, no RPC. It took a hand-written transaction. Anyone hitting this again has
the same problem, so a site-settings "Move to organization" action is worth building.

### D134 — agx_list_scoped org-grant branch: nondeterministic access_level (2026-08-08)

The shared-scope org-grant branch in `public.agx_list_scoped` uses
`SELECT DISTINCT ON (a.id) …` with **no ORDER BY**, so when an agent carries
grants to two of the caller's orgs at different levels, which
`permission_level` the row reports is planner-dependent (can flip between
loads). Cosmetic today (the level is display-only in the list), but any future
consumer branching on `access_level` inherits a heisenbug. Fix: wrap the
branch in a subquery with `ORDER BY a.id, permission_level` — the transcripts
twin already does this (`migrations/trx_list_scoped.sql`, org_shared
subquery); port the same shape into `agx_list_scoped` and re-apply live.
### D131 — Component tables still outside the COMPONENT-ACCESS membrane + two stale entity_types rows (2026-08-08)

The precedent sweep regenerated 96 component tables onto `iam.apply_rls`'s membrane, but these `is_component` tables carry BESPOKE policy families whose extra lanes (public_read, curator, grant_read, read-only runtime) the component variant would drop, so they were deliberately not clobbered — each needs its own canonicalization pass onto the membrane (db-canonicalize-table): `files.analysis/entities/overrides/page_annotations/pages`, `docproc.processed_document_pages`, `transcripts.studio_documents/studio_recording_segments/studio_session_settings`, `workbench.udt_dataset_fields/udt_dataset_rows/udt_structured_list_items`, `pdf.redaction_mapping`, `workflow.node_data_slot`, `legal.wc_impairment_definition`, `runtime.global_execution*/work_item` (their std_select still calls `iam.has_access` per row). Also found: `platform.entity_types` rows `component_group` (`public.component_groups`) and `field_component` (`public.field_components`) point at tables that no longer exist (delete or repoint the registry rows), and `agent.card` is a VIEW flagged `is_component` (no RLS possible — fine, but the flag is misleading).

### D132 — Session-identity drift under long-lived tabs silently lost ~14h of note edits (2026-08-08 incident)

The auth cookie is domain-wide: on 2026-08-07 a Google-OAuth-verification login as
`oauth-review@aimatrx.com` (22:17Z) rotated it under Arman's open `/notes` tab; the note he
created at 22:54Z was INSERTed owned by the reviewer account; a 23:56Z login back as
`arman@armansadeghi.com` rotated it again, after which EVERY autosave from the still-open tab
was RLS-filtered to 0 rows for ~14h and a second note's INSERT failed its
`created_by = auth.uid()` check — that note (`9d973ee3-…`) never reached the DB and is
unrecoverable. Verified via `history.row_versions` (single INSERT, zero UPDATEs) and
`auth.users.last_sign_in_at`. **Fixed 2026-08-08:** `AuthSessionWatcher` now detects identity
drift (auth events + focus/visibility/60s cookie re-reads vs the booted user id) and hard-stops
the tab with a blocking "Account Changed" overlay; the orphaned note was re-owned to the main
account by SQL. **Open remainder:** (a) decide whether unsaved in-memory edits can be preserved
across the forced reload (e.g. local draft snapshot before blocking); (b) the notes autosave
error surfacing existed but 14h of failing saves were ignorable — consider escalating a
persistent save-failure (N consecutive failures) to a blocking banner on the editor itself;
(c) test-account logins (oauth-review, admin@admin.com walkthroughs) should use isolated
 browser profiles/incognito by convention — document in the OAuth-verification plan.

### D130 — RESOLVED (client) 2026-08-08: headless image-gen promise now ALWAYS settles on a terminal run; server socket-hold still open

Root cause found: `processStream`'s read loop exits only when the TRANSPORT closes — a server that reached terminal (both messages persisted 08:44:57Z on `989ac832-…`) but held the response socket open with heartbeats kept the watchdog happy for the 24h lifetime, so `executeInstance` never settled. Fixed at the canonical pipeline: `process-stream.ts` **terminal-settlement guard** — on `completion(user_request)` / fatal `error` / `end`, a 30s grace window closes the stream locally through the normal commit path (screams via `captureError` source `agent-stream-terminal-guard`). Also hardened `generate-page-image.ts`: real `RequestStatus` terminal values (old set had nonexistent "completed"/"failed", missed "timeout"/"cancelled") and `fileId`-OR-`file_id` extraction (FileRecord contract drift). GenerateMediaView's 5-minute `Promise.race` stays as a loud last-resort backstop. **Still open (server, aidream):** why the response was held open post-terminal + the 409 on the conversation-start stream reservation — the guard now self-reports every occurrence.

### D128 — MCP user connections dead since the vault cutover; connect flow unverified E2E (2026-08-06)

All 4 `tool.mcp_user_conn` rows are `status='expired'` with `credential_item_id IS NULL`
(stripe/asana/cloudflare/supabase, from 2026-04), and `tool.definition` has **zero**
`source_kind='mcp_discovered'` rows — no MCP server has ever synced tools in production.
The OAuth start/callback machinery (`app/api/mcp/oauth/*`, DCR + CIMD) is well built but has
not completed a successful connection since the Phase-4 vault cutover; the legacy encryption
GUC was never configured, so MCP connections have likely NEVER worked in prod. Also: the same
OAuth-popup logic is hand-copied in three places (`IntegrationsSettingsPage.tsx`,
`AgentToolsManager.tsx` ×2) — consolidate when touched. **Fix:** re-test one full connect →
discover → invoke loop against a real remote MCP server (aidream `/api/mcp-connections/*`),
then fix what breaks. Companion aidream-side entry exists in aidream/FOUND_DEFECTS.md.

### D127 — Google/MCP docs actively lie: phantom feature dir + mislabeled route group (2026-08-06)

- `features/api-integrations/FEATURE.md` is the ONLY file in its directory yet describes
  `components/`, `types.ts`, `index.ts`, and a deleted client-side MCP execution path
  (`mcp-client/` is a 16-line type stub). It's also listed as a Tier 2 feature in CLAUDE.md.
- CLAUDE.md's route-group table calls `(popup)` "OAuth popup chrome"; it is an unused
  BroadcastChannel demo — neither OAuth flow uses it (MCP returns via `/api/mcp/oauth/complete`
  raw HTML; Google uses the GIS popup).
**Fix:** rewrite the FEATURE.md as an honest index card pointing at `features/agents/` +
`features/settings/`, correct the CLAUDE.md table row (context-docs skill), decide whether
`(popup)` becomes the branded OAuth-return page (see docs/handoffs/google-oauth-product-build.md)
or gets deleted.

### D126 — 22 hand-rolled copies of the headless "launch agent → poll → extract JSON" loop (2026-08-04)

The canonical primitive EXISTS and is almost unused: `executeBuiltinWithJsonExtraction` /
`executeBuiltinWithCodeExtraction`
([features/agents/redux/execution-system/thunks/execute-builtin-with-extraction.thunks.ts](features/agents/redux/execution-system/thunks/execute-builtin-with-extraction.thunks.ts))
has exactly ONE consumer (`features/agent-apps/hooks/useAutoCreateApp.ts`). Meanwhile **22
files** re-implement its body inline — `launchAgentExecution` + a `useAppStore()` + a
`while (Date.now() - start < TIMEOUT)` poll on `selectJsonExtractionComplete` +
`setTimeout(POLL_INTERVAL_MS)` — each with its own timeout, poll interval, error mapping, and
instance cleanup (or lack of it):

`features/education/**` (13: assessment ×4, convert, media/mindmap, spoken-practice ×2,
tutor ×3, trust, study ×2, memory) · `features/flashcards/**` (5) · `features/content-ir/react/actions/useKindRequest.ts` ·
`features/marketing/content-plan/setup/ai.ts`.

This is the "duplicated hook logic" anti-pattern from [docs/reuse-first.md](docs/reuse-first.md) at
scale. Every copy is a place a timeout tweak, an abort-on-unmount fix, or an instance leak has to
be made 22 times — and each new feature copies the nearest neighbour, so it grows on its own.

**Fix:** one hook (`useHeadlessAgentJson(agentId, variables)`) over the existing thunk, then
convert the 22 call sites in batches per feature area. Not a rewrite of behaviour — the loops are
already near-identical; the differences are the accidental ones. **Nobody should convert these
blind:** each area needs its feature's tests/manual path exercised, so batch it per owner.

Filed while merging the content-plan branch (which is copy #22 and correctly followed the local
exemplar `useGenerateQuiz.ts` — the pattern, not that change, is the defect).

### D125 — stale `platform.entity_types` rows → SILENT access denial (2026-08-04; 13 of 18 FIXED, 5 open)

**Fixed live 2026-08-04:** 10 rows `reg.*`→`rag.*`, 2 rows `user.*`→`users.*`. Guard added so this class cannot recur silently: `entity-registry-drift` in `pnpm check:schema` ([scripts/schema-check/checks/entity-registry-drift.ts](scripts/schema-check/checks/entity-registry-drift.ts)).

**Still open — need a decision, all `is_active=true` and therefore silently denying today:**
- `component_group` → `public.component_groups`, `field_component` → `public.field_components`, `prompt` → `public.prompts` — all three tables are in `graveyard`. De-register, or repoint deliberately?
- `agent_user_kv` → `public.agent_user_kv` — the table exists in **no** schema at all.
- (`profile` → `user.profiles` is stale but `is_active=false` and superseded by the `user_profile` token → `users.profiles`. Harmless; delete when convenient.)

**Generated types:** `types/generated/entity-types.generated.ts` refreshed for the 13 renames (`reg`→`rag`, `user`→`users`).

**Decides: Arman** (the graveyard 4).

<details><summary>Original finding (2026-08-04)</summary>

`iam.has_access_for_base` resolves an entity token to a table via `platform.entity_types`, then reads it through `platform.entity_row_access_attrs`, which swallows every exception (`WHEN others THEN NULL`) and returns `found=false`. A stale registry row therefore does not error — it **denies access invisibly**. Nothing in the logs, nothing in the type gate. Live audit of project `txzxabzwovsujtloxrus` (2026-08-04):

- **10 rows `reg.*` → should be `rag.*`**: `kg_alerts`, `kg_sweep_queue`, `kg_sweep_run`, `kg_sweep_state`, `kg_value_matches`, `ner_canonicalizer_shadow`, `context_item_suggestions`, `scope_suggestions`, `scope_association_suggestions`, `scope_item_value_suggestions`
- **3 rows `user.*` → should be `users.*`**: `invitation_codes`, `invitation_requests`, `profiles`
- **3 rows point into `graveyard`**: `public.component_groups`, `public.field_components`, `public.prompts` — probably de-register rather than repoint
- **1 row targets nothing anywhere**: `public.agent_user_kv`

Fix: repoint the 13 renames, decide the graveyard 4, regenerate `types/generated/entity-types.generated.ts`. Then add the drift query as a standing guard (`pnpm check:schema` family) — nothing currently catches a registry row rotting, which is exactly the truth-vs-code guard class CLAUDE.md calls for:

```sql
select et.token, et.schema_name, et.table_name from platform.entity_types et
left join information_schema.tables t
  on t.table_schema=et.schema_name and t.table_name=et.table_name
where t.table_name is null;
```

**Decides: anyone for the 13 renames; Arman for the graveyard 4.**
</details>

### D124 — RESOLVED 2026-08-04: `lib/scheduler-client/claim.ts` never stamped `claim_protocol`

`claimTask` inserted `claimed_at` with no `metadata`, so every claim through this client failed `sch_run_claim_protocol_by_claimed_at_chk` — continuously, in production. Fixed: added a `CLAIM_PROTOCOL = 2` constant (documented as needing lockstep with `matrx_scheduler/queries.py::CLAIM_PROTOCOL`) and `metadata: { claim_protocol: CLAIM_PROTOCOL }` on the insert. **Open remainder:** `claimTask` has no in-repo caller, so the host that was failing is an external consumer of this client and still needs to pick up the fix — identify it and confirm its claims land.

<details><summary>Original finding</summary>

(kept for context) `scheduler.sch_run` enforces `CHECK (claimed_at IS NULL OR metadata->>'claim_protocol' = '2')`. `claimTask` (`lib/scheduler-client/claim.ts:95-109`) builds its insert row with `claimed_at` set and **no `metadata` key at all** — `claim_protocol` appears nowhere under `lib/scheduler-client/` or `features/scheduling/`. Every claim through this client fails on `sch_run_claim_protocol_by_claimed_at_chk`; live Postgres logs show bursts of 1-3 rejections every 1-3 minutes, continuously. aidream's scheduler is correct (`matrx_scheduler/queries.py:252`) and healthy (6,223 successes in 3 days), so the failing host is an **external consumer** of this client — `claimTask` has no in-repo caller. That host is running zero scheduled tasks right now. Fix: add `metadata: { claim_protocol: 2 }` to the insert row, and keep it in lockstep with aidream's `CLAIM_PROTOCOL` constant (bumping one without the other is what produced this).
</details>

### D123 — 🔴 legacy `p_table_name` RPCs: CONFIRMED anonymous RLS bypass (contained 2026-08-04) + still-unidentified caller

**CONFIRMED EXPLOITED-CLASS, NOT THEORETICAL.** `public.dynamic_search(p_table_name, p_search_field, p_search_value, …)` is `SECURITY DEFINER`, owned by `postgres`, was `EXECUTE`-granted to `anon`, and takes an arbitrary table + field. Over plain HTTPS with only the **publishable key** it returned a full row from `public.dev_login_audit` (RLS on, zero policies) including `jwt_jti`, `requester_ip`, `target_user_id`, `requester_secret_hash`, plus `total_count: 55`. Any `public` table was anonymously readable. `fetch_all_fk_ifk` / `fetch_all_fk_ifk_direct` do the same (slower — they were saved only by the statement timeout, an accident, not a control).

**Contained 2026-08-04 (live, via MCP):**
- `REVOKE EXECUTE … FROM anon, PUBLIC` on **all 33** `public` functions taking a `p_table_name text` argument.
- `REVOKE EXECUTE … FROM authenticated` on the 5 `SECURITY DEFINER` ones with **no internal gate**: `dynamic_search`, `duplicate_row`, `fetch_all_fk_ifk`, `fetch_all_fk_ifk_direct`, `admin_get_columns`. (Guest mode mints real `authenticated` users from a fingerprint, so `authenticated` was barely a barrier.)
- Verified after: `42501 permission denied` for anon on `dynamic_search` and `fetch_all_fk_ifk`.
- Left alone: the 4 definer functions that DO gate internally (`admin_upsert_entity_type`, `admin_upsert_shareable_resource`, `create_new_user_table_dynamic`, `update_user_table_metadata`), and `service_role`.

**Open:**
1. **Audit for prior abuse.** The hole was reachable by anyone holding the publishable key (which ships in the browser). Nobody has checked whether it was used.
2. **Drop the whole family.** Containment is a grant change, not a fix; ~33 functions that take an arbitrary table name should not exist. Brief 8 of [docs/upgrades/type-debt/2026-07-01-fleet-briefs.md](docs/upgrades/type-debt/2026-07-01-fleet-briefs.md) already DECIDED to rip out this legacy dynamic-entity system.
3. **The `ai_model` caller is STILL unidentified** — see below. Errors continued unchanged after revoking both `anon` and `authenticated`, so the caller holds **`service_role` or a direct Postgres connection**: a server-side process, not a browser and not the extension's client code. Neither ai-matrx nor aidream contains any reference to these RPC names.
4. Some legit surface may have depended on a revoked grant. Nothing is known to have broken, but watch for `42501 permission denied for function` in the logs — restoring one grant is a one-liner.

**Decides: Arman** (abuse audit + drop schedule).

<details><summary>How the 16s error storm was traced to these RPCs</summary>

Six legacy RPCs interpolate a caller-supplied `p_table_name` into `EXECUTE format('... FROM %I ...')` **unqualified**: `public.fetch_all_fk_ifk`, `fetch_all_fk_ifk_direct`, `fetch_filtered_with_fk_ifk` (×2 overloads), `fetch_paginated_with_ids_names`, `fetch_paginated_with_all_ids`. Two problems:

1. **They are the source of `relation "ai_model" does not exist` firing every ~16s in production** (~5,400 failed round-trips/day). Reproduced byte-for-byte over PostgREST with only the publishable key. No DB object references `ai_model`; a plain `.from('ai_model')` read is ruled out (PostgREST answers `PGRST205` from cache and never reaches Postgres). The caller passes the retired table *name* as a string. `lib/redux/api.ts` (the old caller) is already deleted here — suspect matrx-extend or a stale deployed bundle.
2. **`fetch_all_fk_ifk` / `fetch_all_fk_ifk_direct` are `SECURITY DEFINER`, owned by `postgres`, `EXECUTE` granted to `PUBLIC`/`anon`** — definer rights bypass RLS, so an anonymous caller appears able to read any `public` table, including RLS-enabled tables with zero policies (`api_request_log`). Reaching the `EXECUTE` as anon is confirmed; the read-a-real-row test was **not** run. Confirm, then `REVOKE EXECUTE ... FROM anon, PUBLIC` on all six and drop them once the caller is found.

`.claude/skills/canonical-associations/WORK-QUEUE.md` row 11 tracks the audit — this is the concrete forcing function.
</details>

### D122 — `history.row_versions` partition exhaustion froze 121 tables platform-wide for 4 days (2026-08-04) — FIXED, residual gaps open

`history.row_versions` is RANGE-partitioned on `occurred_at` with **hand-created** monthly partitions. The last ended `2026-08-01T00:00Z` and nothing created the next, so `platform._version_capture()` — a trigger on **121 versioned tables** — failed every INSERT/UPDATE/DELETE with `23514 no partition of relation "row_versions" found for row`. `files.files` last accepted a row at 2026-07-31 22:09; no file, note, task, transcript, flashcard set, membership, or `chat.agent_run` was written for four days. **Fixed** 2026-08-04: `migrations/history_row_versions_partition_autoprovision.sql` (provisioner fn + 18-month runway + `row_versions_default` catch-all + pg_cron `ensure-row-version-partitions` + a `system_error` alarm if the default is ever used).

**Residual, open:**
1. **No guard compares partition runway to `now()`.** `pnpm check:schema` / aidream's `db/schema_analysis` compare code-vs-DB *shape* and would not have caught this — the schema was correct, the *data range* was exhausted. A "time-bounded DDL about to expire" check belongs in the release gates. **Decides: anyone.**
2. **`public.agent_run` / `public.agent_run_stage` are stale empty duplicates** of the live `chat.*` tables (moved by `agent_run_canon_02_move_to_chat.sql`, 2026-06-28) and are still generated into `db/models/public.py` in aidream. Graveyard them (`db-graveyard-table` skill). **Decides: anyone.**
3. **Nothing alarms on "a whole table stopped receiving writes."** Four days of total write failure produced `request_crash` rows and user-visible toasts but no alert. A write-rate watchdog over the busiest tables is the second layer. **Decides: Arman** (ops scope).

### D121 — website-factory audit: 12 content-plan/CMS defects on a dispatch board (2026-07-30)

The 2026-07-30 content-plan/CMS readiness audit found 12 defects — renderer ignoring `theme_config` (my-matrx), plan statuses blind to CMS publishes (1 node "published" vs 42 live pages), FE CMS writes bypassing `matrx-content-guard`, nondeterministic duplicate header/footer render, agent-only capabilities with no human UI (starter kit, header/footer toggles, theme/nav/footer editing), the never-exercised `plan.cms_fill_job` queue with no chaos test, and doc drift. Each is a self-contained assignment with status tracking in [docs/handoffs/website-factory-bug-dispatch.md](docs/handoffs/website-factory-bug-dispatch.md) (WF-1…WF-12); vision-level gaps live in [docs/handoffs/website-factory-vision.md](docs/handoffs/website-factory-vision.md). Close this entry when the board is empty. **Decides: Arman assigns; WF-1/WF-2/WF-3 are HIGH.**

### D120 — `components/ui/chart.tsx` is `// @ts-nocheck` (2026-07-30)

The shadcn-style recharts wrapper (`ChartContainer`/`ChartTooltipContent`/…) opts its whole file out of the type gate in a repo whose CLAUDE.md forbids `any`. Consumers (cx-dashboard usage charts, education StudyTrends, flashcard perf) build on untyped props with zero drift detection. Fix: type the wrapper against recharts ^3.9's real types (its payload generics are the usual pain point) and delete the pragma; new chart surfaces should meanwhile type recharts directly (the Search Console `PerformanceChart` does — use it as the reference) rather than deepening this wrapper. **Decides: anyone.**

### D119 — any EDITOR can flip a canonical entity's `visibility` (incl. to `public`) at the DB layer (2026-07-29)

`std_update` RLS on canonical tables (verified on `workbench.working_documents`) gates UPDATE at `editor` for ALL columns — `visibility` included. Only the ShareModal UI is owner-gated; an editor-sharee can `PATCH ... SET visibility='public'` via PostgREST directly, exposing the row to every authenticated user. `setVisibilityColumn`'s "owner-only writes are enforced by RLS" comment (`utils/permissions/service.ts`) is false for std-variant tables. Fix candidates: a column-level trigger/guard (visibility changes require owner or admin-level access) applied per the canonical RLS pipeline, platform-wide — not per table. Surfaced by the working-document sharing work but applies to every std entity-variant table. **Decides: Arman** (security posture change, cross-cutting).

### D118 — conveying `working_document → conversation` edges let an editor-sharee re-share and amplify access (2026-07-29)

The edge is access-conveying (`container_side='target'`, `conveys_max='editor'`). An editor-sharee B who attaches owner A's document to B's own conversation and shares that conversation conveys up to EDITOR on A's document to third parties — invisible to A, and at odds with the sharing invariant that non-owners cannot re-share. First became reachable when cross-user attach shipped (2026-07-29); the FE now blocks the doomed *viewer* attach path, but *editor* attach conveyance is by-design DB behavior. Options: drop `conveys_max` to `viewer` for this pair, or require doc-OWNER (not editor) for new conveying edges in `assoc_add`. **Decides: Arman** (access-architecture policy; cross-repo doc `common-docs/systems/access-architecture/FEATURE.md`).

### D117 — `content_ir_kind_instance` registry row declares the `visibility` enum in the boolean `is_public_column` slot (2026-07-29)

`platform.shareable_resource_registry.content_ir_kind_instance` has `is_public_column='visibility'` — but that column holds the canonical `platform.visibility` ENUM, not a boolean. A non-null `is_public_column` routes ShareModal's public toggle through `make_resource_public` (boolean write) instead of the canonical `setVisibilityColumn` enum path, and `getResourceVisibility` will read the enum string as a boolean. Fix: set `is_public_column=null` in the live registry + TS mirror + snapshot together (the canonical-visibility shape), then verify ShareModal's Public tab against a kind instance. Found while regenerating the snapshot (which had drifted 6 rows behind the live DB); mirrored verbatim for parity in the meantime. **Decides: anyone — small, but touch all three surfaces in one commit.**

### D118b — invisible inbox injections (`is_visible_to_user=false`) may seed a phantom user bubble in-session (2026-07-29; renumbered from a duplicate D118 2026-08-06)

The Turn-Boundary Inbox client (Flow 6 in `features/agents/components/chat/FEATURE.md`) correctly skips the optimistic bubble for invisible steering messages, but the server still announces the persisted row via `record_reserved cx_message` (role=user), and `process-stream`'s fallback branch (`reserveMessage`) seeds it into `messages.byId` with no visibility flag — a possible empty/phantom bubble until reload (reload filters by `is_visible_to_user`). Fix: carry visibility on the reservation metadata (server) or track announced invisible injection positions in `process-stream` and skip the reservation. Low frequency — invisible injections are only produced by `kind:"system_message"` + `is_visible_to_user:false`, which no product UI sends yet.

### D116 — RESOLVED 2026-07-29: both bespoke stream renderers deleted, gap closed, lint enforced

Both callers are gone and the reason they existed is fixed:

1. `LiveResearchFeed.tsx` — **deleted.** `useKeywordResearch` now ADOPTS the server-orchestrated pipeline stream into `activeRequests` via the new `adoptForeignStream` thunk + `callApi`'s `consumeStream` option, and both surfaces render `<MarkdownStream requestId />`.
2. flashcards `CreateFromTopic` fallback session — **deleted.** `selectKindEnvelope` stands alone.

The root cause was a real platform gap, not carelessness: `activeRequests` (which every canonical read is keyed on) was fillable ONLY by `executeInstance`, so a run orchestrated server-side inside a pipeline endpoint had no `requestId` and literally could not render canonically. That is what `adoptForeignStream` fixes; aidream's `stream_agent_as_blocks` is the server twin (pipeline runs now emit `render_block` events with envelopes, not bare chunks).

The owed lint rule shipped: **`matrx/no-bespoke-stream-renderer`** (ESLint, error) fences `useLiveJsonRegion` / `openParseSession` to `features/content-ir/`.

⚠️ **Verification debt (carried, not closed):** the work was written in an environment where `pnpm install` fails (`codeload.github.com` 403 through the proxy), so it is **neither type-checked nor browser-verified**. Before this is trusted: `pnpm type-check`, then exercise `/marketing/keyword-research` and the Keyword Intelligence research tab live. Tracked in `docs/handoffs/canonical-stream-and-surface-writeback.md`.

### D115 — ✅ FIXED 2026-08-09 — in-session tool-viz repaint reimplemented via the invalidation-registry inversion

Reimplemented per the ruled fix pattern, with ZERO import edge from the stream-effects chunk into either heavy cluster: `lib/invalidation/invalidation-registry.ts` (tiny, zero-import, name-keyed callback registry + key constants) is the only shared code. Consumers register at their own chunk init — `toolRendererCache.ts` (drops caches + bumps per-tool versions; `useToolRendererVersion` re-resolves mounted `DbToolRendererImpl`/`useDbToolMeta`) and `component-registry.ts` (`refreshKindComponents(0)` → db-tier replace → existing per-kind repaint). `toolStateEffects` fires by NAME on `toolcomp_*`/`kindcomp_*` write completions. Guards: `features/tool-call-visualization/__tests__/tool-viz-repaint-invalidation.test.ts` (incl. a source-guard test failing on ANY static/dynamic import from `toolStateEffects` into content-ir or db-renderer) + a registration test in `component-registry.test.ts`. History (the detonator, kept for the class): the v0.4.198/199 pair's `await import()` of the content-ir registry cluster from `toolStateEffects.ts` (statically reachable via `process-stream.ts` from ~every context) cost +14.3GB peak build RSS / +50-57% compile and OOM-killed Vercel builds v0.4.199-210; reverted v0.4.212. THE FRAGMENTATION LAW, `await import()` edition — the sanctioned handler-body dynamic import detonates when the target graph is enormous AND the importer is ubiquitous. Known sibling not covered: `features/workflow-emit/emitRendererCache.ts` (workflow-surface renderer clone, keyed by componentRef) has no invalidation consumer yet.

### D110 — stray or broken Cloudflare Workers build is red on frontend releases (2026-07-27)

GitHub check `Workers Builds: ai-matrx-admin` fails on release commits while Vercel is green and serving. No Wrangler/Cloudflare config exists in the repo; the check comes from an external Cloudflare integration. **Decides: Arman** — retire the integration, or configure the deployment it expects.

### D108 — seven historic feedback screenshots are permanently dead (2026-07-27)

`users.user_feedback.image_urls` has seven expired `…/share/<uuid>/download` pointers (404 `share_link_invalid`). New MCP writes already reject this URL class. Fix: recover originals from backups if possible and replace with CDN URLs; otherwise mark irrecoverable.

### D105b — file surfaces must separate MY files from ORG files (Arman ruling 2026-07-28)

RULED: `internal` default is correct and stays — files are org collaboration data by design; never propose flipping visibility defaults. The real defect is architectural: file list pages don't cleanly separate files that are YOURS from files that belong to the ORGANIZATION (the Mine / My Orgs scope pattern from the canonical entry list). Needs an architecture discussion with Arman before building; do not restyle privacy labels as a substitute.

### D103 — legal vertical landings predate `ModuleLanding`; PD calculator has no guest landing (2026-07-26)

`features/legal/components/landing/LegalLanding.tsx` + `wc/components/landing/CaWcLanding.tsx` (~900 lines) hand-duplicate `ModuleLanding`, aren't in `MODULE_LANDING_DIRECTORY`, get no conversion nudges. Migrate both onto `ModuleLanding` + register. Also: `PdRatingsCalculatorLanding.tsx` (331 lines, zero importers) — wire in via the `module-landing-pages` skill or delete.

### D101 (partial) — `agx_get_list` has no org scope; the delete path is a HARD delete (2026-07-25)

Soft-delete predicate fixed on both gallery readers; the hard-delete path became a soft delete (`deleted_at`) 2026-07-28. Remaining: (1) org-teammate agents invisible in `agx_get_list` — belongs with retiring `/agents/all` onto `agx_list_scoped` once `/agents/browse` is ratified; (2) ~6 more SECURITY DEFINER readers of `agent.definition` share the missing soft-delete predicate (`agx_get_shared_with_me`, `agx_get_shared_for_chat`, `get_agents_for_chat`, `agx_get_access_level`, `agx_duplicate_agent`, `agx_get_shortcuts_for_context*`, `agx_get_list_full` builtin arm).

### D100 — three registered catalog entity types are ACL-invisible (2026-07-24)

`public.analysis_recipes`, `runtime.global_origin`, `scraper.sites` have no ownership/visibility columns and no `default_visibility`, so `iam.has_access_for_base()` denies everyone and no `assoc_add` edge can target them. Latent (no live callers). **Product call**: declare `default_visibility` (`public` for catalogs, `internal` for org-scoped) or add ownership columns.

### D96 — aidream writes Univer document snapshots with no page geometry (2026-07-23)

`workbench.udt_document_snapshots` rows with `origin='agent'` carry `documentStyle: {}` → no wrap, no scroll. FE recovers loudly (`sanitizeUniverDocSnapshot#restorePageStyle`), but the writer bug lives in aidream: stamp A4 geometry (mirror `features/data-tables/document-page-style.ts`), then backfill existing `{}` snapshots.

### D92 — 38 dead RLS policies: policy exists, `authenticated` lacks the privilege (2026-07-23)

Run `pnpm check:access-drift` for the live list (clusters: `scraper.*`, `runtime.*`, `history.row_versions`, `seo.*`, assorted `platform.*`, `iam.memberships`/`invitations`). Fix per cluster: decide intended audience, then `GRANT USAGE`/`GRANT SELECT` (or delete the dead policy). Intentional deny-alls are allowlisted in `scripts/access-matrix/check-access-drift.ts`.

### D93 — `rag.kg_chunks` reads statement-timeout for non-entitled users (perf class) (2026-07-23)

Per-row SECURITY DEFINER policy functions evaluate over thousands of candidate rows before RLS concludes zero. Denial-by-timeout burns a full statement budget and looks like an outage. Fix: hoist the constant `(source_kind, source_id)` predicates to a LATERAL/initplan-friendly shape or per-source materialized visibility check; optimize only against measured plans.

### D94 — `docproc.page_extraction_jobs.project_id` is a project FK on a feature table (forbidden pattern) (2026-07-23)

Nullable tagging-column variant, not load-bearing (auth gates never read it). Removing it end-to-end (column + FE types/forms + aidream model + edge backfill) is its own focused change.

### D88 — service-role RPCs accept raw p_user_id with no internal actor guard (2026-07-23)

`public.get_mcp_credentials` (returns decrypted MCP tokens) and `public.get_user_form_context` are safe only because EXECUTE is service-role-only — one re-grant away from a D86-class actor-spoof hole. `get_mcp_credentials` dies with vault Phase 4; until then add an internal guard (`auth.uid()` null/service or equal `p_user_id`).

### D85 — CROSS-REPO (aidream): concurrent child agents share ONE emitter turn-text accumulator (2026-07-23)

**Owner: aidream. Symptom fixed; root cause latent.** Podcast feature-image agents now run isolated (`suppress_stream=True`) with a `_is_media_url` guard, but every concurrent fan-out platform-wide shares the emitter's `_turn_text_acc` and can cross-contaminate captured `.output`. Durable fix: per-child emitter isolation in `fork_for_child_agent`.

### D84 — live Supabase security-advisor baseline contains unrelated errors (2026-07-22)

Pre-existing `security_definer_view` errors + RLS-disabled exposed tables (e.g. `public.full_spectrum_positions`, `files.structure`, `workflow.worker_heartbeat`). Needs an owner-by-owner audit before the advisor can be a clean release gate.

### D81 (remainder) — two inline mic level-meter copies left (2026-07-22)

Canonical core now `features/audio/streamLevelMeter.ts` (+ `useStreamAudioLevel`); 3 of 5 modules ported 2026-07-28. Remaining: `useSimpleRecorder.ts` and `voice-agent/audio/audioCapture.ts` — analyser lifecycle entangled with recording teardown; port carefully, one per change, verifying the meter still moves.

### D80 — stale agent records report full `_loadedFields` with EMPTY `variableDefinitions` (2026-07-22)

Persisted/rehydrated agentDefinition records predate live edits, `isReady` short-circuits the refetch, and model settings/context slots/variable panel render stale. (Caller-injected runtime variables now pass through unconditionally, so execution is correct.) Fix candidates: treat rehydrated records as never `isReady`; stamp `_loadedFields` with `updatedAt` and refetch when the live row is newer; or always `fetchAgentExecutionFull` on launch. **Decides: Arman** (persistence strategy).

### D79 — CRITICAL: direct project FKs make feature rows project-dependent; research decoupling in flight (2026-07-21)

Frontend cutover DONE (project-optional `createTopic`, association-backed filtering, no path writes `project_id`); Phase-0 migration live. Remaining: aidream Phase-3 cutover + deploy, Phase-4 column drop/scope migration, the aidream release guard, live acceptance matrix. System of record: `common-docs/projects/research-project-decoupling/FEATURE.md`. Keep until then.

**Transcript focused repair 2026-08-08:** while adding explicit Mine / org
scope to the transcript hub, the required live trigger/FK inspection found
`transcripts.transcripts_project_id_fkey`. All 1,024 rows had a null
`project_id`, and the transcript feature had no project/task column consumer.
`migrations/transcripts_remove_forbidden_relationship_dependencies.sql`
therefore drops only the project FK (the nullable compatibility column stays).

### D78 — CRITICAL: legacy `platform._mirror_fk_to_assoc` triggers remain live (2026-07-21)

Research's `_mirror_proj` trigger dropped. Live trigger count re-verified 2026-08-06: **26** remain platform-wide (down from the 32 baseline at filing — ratchet moving the right way). FE alarm layer shipped (`lib/diagnostics/errorTierRules.ts` pins any firing as permanent critical). Remaining: the aidream release guard (strict tier + 32-ratchet) and live verification of the induced-failure inspector flow.

**Transcript focused repair 2026-08-08:** live inspection found `_mirror_proj`
and `_mirror_task` on `transcripts.transcripts`; both called the forbidden
function. `migrations/transcripts_remove_forbidden_relationship_dependencies.sql`
drops both triggers, taking the expected live remainder from 26 to 24.

### D74 — `web.link_edge.http_status` is NEVER populated: no broken-link detection exists (2026-07-20)

All 10,676 rows null. FE is ready (link graph, External view, HTTP column). Fix lives in the scraper (matrx-scraper/aidream): post-crawl link-check pass writing `http_status` back. Relay prompt handed to Arman 2026-07-20.

### D73 — Folder picking needs a canonical story (2026-07-20)

File-picker consolidation done; `FolderPicker`/`SaveAsDialog` still use the old `PickerShell` dialog. Decide: extend `FilesResourcePicker` with folder-select mode or keep a dedicated folder surface, then retire `PickerShell`.

### D114 — ROTATE exposed provider keys + prune NEXT_PUBLIC secret env vars. Arman action (2026-07-28)

The D113 fix stops NEW bundles from carrying keys, but past production bundles shipped `NEXT_PUBLIC_CARTESIA_API_KEY` and `NEXT_PUBLIC_OPENAI_API_KEY` — treat both as compromised and **rotate them at the provider**, then set the Cartesia key as server-only `CARTESIA_API_KEY` (already read by `/api/cartesia*`). Also prune the ~20 unreferenced `NEXT_PUBLIC_*` secret env vars in `.env.local`/Vercel (Anthropic, Gemini, Groq, Deepgram, Replicate, Stability, Cerebras, Fireworks, xAI, GetImg, ModelLabs, News, Comfy, Deploy, Picovoice, Stream secret, TensorDock, Unsplash secret) — unreferenced code can't bundle them, but the naming invites the next leak; rename server-side ones without the prefix, delete dead ones.

### D82b — CROSS-REPO (aidream): education/flashcard podcast runs publish "Untitled Episode" (2026-07-22)

**Owner: aidream.** (1) Empty title treated as success — derive a title when the agent omits one; never persist `title=''`. (2) `buildDeckOverviewRequest` sends `max_images: 0` yet episodes publish to the public show — **decides: Arman**: give deck overviews a cover or keep them out of the show. Reproduces on the next flashcard→podcast run.

### D83 — `pc_episodes.duration_seconds` null on 44 of 48 episodes (2026-07-22)

aidream never writes it; lists/RSS can't show runtimes (player recovers client-side per fetched file only). Fix in aidream at publish time; backfill needs per-file probing.

### D67 — doctrine says "banned", ESLint says `warn`, with live violations (2026-07-18)

Browser dialogs (`no-alert` etc.), barrel files (488 warnings), banned lucide brand icons (runtime-missing → 500s; `warn` is the wrong severity). Each needs: finish cleanup and promote to `error`, or soften the doc. Don't leave doc and rule disagreeing. 2026-08-09: `features/` + `components/` + live admin pages are now dialog-clean (16-file batch); the remaining bare dialogs sit only in `app/(dev)/demos` and admin official-components display demos — finish those, then promote `no-alert`/`no-restricted-globals` to `error`.

### D60 — chat draft transfer never lands for VARIABLE-INPUT agents (2026-07-17)

Plain-agent path fixed. For agents with launch variables/broker inputs (repro: agent `a2525cd3`) the stash is consumed but the smart-input stays empty — suspect the variable-bearing input binds text differently or the instance is recreated on variable hydration. Also: `setUserInputText`'s `if (!entry) return;` is a silent drop — should scream.

### D59 — CRITICAL: follow-up turns must CONFIRM identity-context changes with the user (2026-07-15)

Context (`organization_id`, `project_id`, `task_id`, `scope_ids`, agent identity) must not silently drift between turns. Today: console warn + BE stream warning only — neither blocks nor confirms. Required: FE compares previous vs current and prompts the user. **Owner: Arman** (confirm UX). Twin entry in aidream.

### D58 (remainder) — Stripe Connect built + live; Arman dashboard actions remain (2026-07-15)

The stub is DELETED live (verified 2026-07-28); real path shipped `584eb5941`: Checkout destination-charge (80/20 split) → signature-verified webhook → service-role `edu_class_confer_purchase` (+ refund/dispute revoke). **Blocked on Arman:** (1) enable Stripe Connect on the platform account; (2) set `STRIPE_WEBHOOK_SECRET` + register `/api/stripe/webhook` in the dashboard; then one test-mode purchase E2E.

### D57 — COPPA gate: only the LEGAL policy calls remain (2026-07-15)

All code layers done (client fail-closed, server-side enforcement in aidream, `age_band` write-tamper trigger + audit). **Open (Arman/legal):** (1) self-declared age — hard-block the `under_13→adult` transition vs allow-audited (currently audited + `review_signal`); (2) verifiable-consent method per COPPA §312.5. See `COPPA_VERIFIABLE_CONSENT_RUNBOOK.md` §1.

### D53 — `files.matrxserver.com` CORS blocks local browser uploads; fix published, deploy pending (2026-07-14)

`matrx-files==0.1.10` fixes CORS; remaining: deploy to the EC2 service (AWS SSO was expired). Live recheck still 405/no-ACAO until the container swap.

### D51 — vision-variant path collision fixed in aidream; pending prod release (2026-07-14)

Root cause: variant paths lacked master-file identity, so all grade-flow uploads collapsed onto one cached variant. Fixed in aidream `8d9513e8a` (master-scoped path + loud `derived_from` guard), verified on dev. Ships with the next aidream release.

### D35 — `platform.association_types` PK forbids what the pair+label index exists to allow (2026-07-09)

**Decides: Arman.** Latent (0 labeled rows). (A) per-label rules wanted → surrogate uuid PK, 3-col index becomes the key (needs aidream ORM regen); (B) not wanted → drop the 3-col index + label field + amend the reachability doc. Never `label NOT NULL DEFAULT ''`.

---

## Pending Arman review

**Proposed promotion (2026-07-19):** none outstanding — D72 (the prior P0 proposal) was fixed 2026-07-28.

---

## Rejected

_One line each: `- D## — <short reason> — <date> — delete when: <condition>`_

---

## RESOLVED

- **D173 — shortcut/template project/task scoping had NO canonical path after the mirror-trigger disarm — RESOLVED 2026-08-12.** The four forbidden FK columns are DROPPED live (proven 0 scoped rows); `agent_shortcut→project/task` association types registered (target-container, editor — the agent→project precedent); 7 RPCs + `agent.context_menu_view` rewritten with edge projections (signatures and output shapes unchanged, so read paths needed zero changes); writes now create `platform.associations` edges (agx_create_shortcut, create_shortcut_from_agent_surface, POST /api/agent-shortcuts); FE converters/API allowlists cut; aidream agent models regenerated (zero real consumers existed). Both `agent.shortcut` and `agent.template` are now CERTIFIED. Migration `agent_shortcut_scoping_to_associations.sql` (ledgered). Remaining mirror-function dependents were separately eliminated the same day (only graveyard remains).
- **D168 — Claude-only, untracked `preview_start` replaced by tracked provider-neutral `pnpm preview:start`; Claude/Codex hooks block duplicate raw launches.** 2026-08-12 — `scripts/agent-dev-server.sh`, `scripts/agent-harness/`.
- **D165 — the Redux execution system could not carry a `context_anchor` — RESOLVED 2026-08-11.** `HeadlessAgentJsonOptions` now carries `contextAnchor` / `organizationId` (`run-headless-agent-json.ts:82,88`) straight into `launchAgentExecution`, so migrating a surface to the live posture no longer drops its durable-entity anchor. Filed and closed the same day while migrating the Research Outputs Studio SEO card, which passes `{resource_type:"research_topic", resource_id: topicId}` on the live path.

### D156 — Python-owned kinds were FIELDLESS to the frontend (140 active rows) — RESOLVED 2026-08-11

`emitted_json_schema` now rides on the catalog entry (`DEF_COLUMNS` → `BlockSchemaEntry.emittedJsonSchema` → `KindCatalogEntry.emittedJsonSchema`), carried VERBATIM — no lossy schema→fields→schema round trip. `isKindBindable` passes on "fields OR a stored schema" and excludes the machine-minted `is_contract_artifact` rows the change would otherwise have surfaced; `buildKindOutputSchema` is entry-keyed and returns the stored schema untouched for fieldless rows. Bindable kinds 32 → 146 (114 newly reachable, all build); browser-verified in the agent builder's Output Schema tab. Leftovers filed as D163 + D164.

One line per fix — title, date, pointer. History lives in git.

- **D162** — both research agents bound to the kind their own code already parses, and `settings.response_format` (the key that was winning and discarding the real schema) dropped: `migrations/agent_bind_cross_cutting_tags_output_kind.sql` + `agent_bind_structured_page_summary_output_kind.sql`. Each slot's declared `output_kind` was CORRECT — the disagreeing `output_schema.name` was name-only drift, since each kind's `emitted_json_schema` is generated from the exact Pydantic `Output` the pipeline parses (`CrossCuttingTagOutput` → `research/tag_generation.py`, `PageAnalysis` → `research/analysis.py`) — so no slot was changed and neither prompt taught a conflicting shape. Verified live 11.6 min after apply (D160 wait): the `GOOGLE ADJUSTMENT: structured output OMITTED` warning fired on every pre-fix run and on the in-cache run 21s after apply, then **stopped**; output flipped from markdown-fenced to raw JSON emitted in the SCHEMA's property order rather than the prompt's (incl. nested `evidence_signals`) — grammar, not instructions. Correction to the original entry: the downgrade came from Google's `_build_google_response_schema`, not Anthropic's translator — both agents are gemini-3.6-flash, and `json_object` has no Gemini equivalent either, so BOTH were prompt-only. 2026-08-11.
- **D64** — `ContainerResourceSheet` refactored to the keyed derived-state pattern (SlotEditor style): items + search query keyed by `table|column|value`, loading derived, no setState in the effect body; lint clean. 2026-08-09.
- **D106 (remainder)** — BudgetMeter headline is now a green/yellow/red verdict ("Fine / Getting heavy / Too much", weighed against the active or default ceiling); token count demoted to fine print (`features/research/components/resources/BudgetMeter.tsx`). 2026-08-09.
- **D106b** — last 4 "Only you" surfaces reworded to honest claims: vault SharePanel reports the grant list (org-admin caveat included), CanvasShareSheet Private = "Not published — no public page or link access", StructuredListManagerV2 Private = "Not shared", education marketing copy scoped to "within your account / workspace you add them to" (FAQ + feature grid). 2026-08-09.
- **D137 (public /seo analyzers 401 for guests)** — both analyzers now read meta tags through the guest-friendly `/seo/public/page-audit` route via `usePublicPageMetadata`; verified signed-out. 2026-08-09.
- **D76 / D61** — one root cause, fixed once: `errorCaptureStore.emit()` notified its `useSyncExternalStore` subscribers SYNCHRONOUSLY, so any `captureError` on a render path (content-ir screams, data-shape reads, org-resolution) re-rendered the shell's Error Inspector badge inside another component's render. Notification now defers to a microtask; snapshots stay synchronous. Pinned by `lib/diagnostics/errorCaptureStore.renderSafety.test.tsx`; verified clean in-browser on `/`, `/scraper`, and a live `/chat` stream. 2026-08-09.
- **D129 (tasks lifecycle)** — all three gaps closed: `operatingTaskId` → `operatingTaskIds` set (add/remove actions, `selectIsTaskOperating`, all thunks/consumers ported); `tasksUi.nowMinute` ticked ~60s by `useNowMinuteTick` on /tasks feeds `selectFilteredTasks`/`selectSmartViewCounts`/`buildSmartViewContext` so snooze expiry + date windows resurface without an unrelated store change; monthly recurrence keeps its month-end anchor via `BYMONTHDAY` (parsed/formatted/honored in `utils/recurrence.ts`, `-1` = last day; `completeTask` stamps it on first roll via `ensureMonthDayAnchor`) — jest suite `features/tasks/utils/__tests__/recurrence.test.ts`. 2026-08-09.
- **D129** — Apple OAuth secret rotated and verified; hard-coded expiry replaced by live `app_config` credential metadata plus an audited admin editor and actionable Manage toast. 2026-08-07.
- **D113** — no Cartesia key in the browser: ONE token primitive (`lib/cartesia/accessToken.ts` — lazy, cached, dedupe, refresh-retry-once) + ONE ws connector (`connection.ts`); all 8 hooks/adapters ported; voices list/clone/create moved to authed server routes (`/api/cartesia/voices*`); raw-key `client.ts`/`tts-service.ts`/`AudioPlayground` deleted; `NEXT_PUBLIC_OPENAI_API_KEY`/`NEXT_PUBLIC_GOOGLE_API_KEY` bundle refs also removed. Rotation = D114. 2026-07-28.
- **D107** — closed by Arman's attribution: the OOM fix was eliminating bad edge lazy imports (v0.4.137 revert), NOT the memory ceiling; `turbopackMemoryLimit` restored to 40GiB. 2026-07-28.
- **D104** — shared `PublicFooter` (Privacy/Terms/Contact) mounted in `(public)/layout.tsx` + `app/page.tsx` (`components/matrx/PublicFooter.tsx`). 2026-07-28.
- **D106.1-3** — research context builder save/load drift: `parseBindings` round-trips `delivery`+`strategy`; agent selection lifted + persisted (`features/research/service/resources.ts`, `ContextBuilder.tsx`). 2026-07-28.
- **D101.2** — agent delete is now a soft delete (`deleted_at`) in `agent-definition/thunks.ts`. 2026-07-28.
- **D81 (3/5)** — level-meter core extracted to `features/audio/streamLevelMeter.ts`; MediaDevicesPanel, useChunkedRecordAndTranscribe, continuousCapture ported. 2026-07-28.
- **D74b** — Cartesia voices list unwraps the paginated envelope via direct versioned REST (`lib/cartesia/cartesiaUtils.ts`); real error surfaced in the toast. Key exposure filed as D113. 2026-07-28.
- **D70** — every React Flow surface behind ONE dynamic gate (rag viz + schema-visualizer shells → `*Impl`); `reactFlowStaticImportBan` comment corrected. 2026-07-28.
- **D66** — `app/(dev)/**` un-excluded from the type gate; all dev-route errors fixed properly; full repo green. 2026-07-28.
- **D64/D65** — RATIFIED by Arman: "scream loud, never stop the build" — `ignoreBuildErrors` stays (annotated), `pnpm type-check` added to the advisory release gates so every release screams. 2026-07-28.
- **D112** — canonical list title cells are now real `next/link`s (keyboard/SR/middle-click) via `MatrxColumnDef.href` in `MatrxDataTable`; agents-browse + CRM columns wired. 2026-07-28.
- **D102** — `callApi` now surfaces server `user_message`/`message`/`details[].message` instead of bare "HTTP 422" (`lib/api/call-api.ts`). 2026-07-28.
- **D97** — Univer autosave filtered to `CommandType.MUTATION` (+ denylist); scrolling no longer writes snapshots — `DocumentEditor.tsx`, `WorkbookEditor.tsx`, shared `isSnapshotMutation.ts`. 2026-07-28.
- **D99** — `useEpisodeArticles` render-phase ref write + sync setState-in-effect refactored; lint clean. 2026-07-28.
- **D98** — `OutputsStudio` loading derived from fetch lifecycle; banned `Sparkles` replaced; stale disables removed. 2026-07-28.
- **D75** — transcripts sidebar nested `<button>` → `role="button"` div with keyboard handlers (`TranscriptsSidebar.tsx`). 2026-07-28.
- **D73c** — /artifacts stuck `isNavigating` spinner: pathname-reset + 6s fallback + unified `handleNavigate` (`CmsArtifactList.tsx`). 2026-07-28.
- **D72** — /files row-click share race closed: hidden toolbars get `pointer-events-none`, row onClick ignores `[data-row-actions]` targets (`FileTableRow.tsx`). 2026-07-28.
- **D68** — OverlayController ESLint override now `error` and re-lists all 13 global ban groups. 2026-07-28.
- **D69** — `features/files/**` gets `no-restricted-imports: off` (ring-fence targets outside consumers). 2026-07-28.
- **D109** — `TEMP_SKIP_RELEASE_CHECKS` no longer exists anywhere (repo, env, shell rc); release gates run normally. Verified 2026-07-28.
- **D82** — (1) v1 paginated RPC SQL injection fixed with bound params (`migrations/get_user_table_data_paginated_v1_injection_fix.sql`); (2) `get_user_feed` actor guard 2026-07-25; (3) dead prompt branches dropped from `get_version_history` + dead `features/versioning` deleted (`migrations/get_version_history_drop_dead_prompt_branches.sql`). 2026-07-28.
- **D71** — retired `rag_search` name gone from live SQL; `platform.entity_types.data_store` note updated to `knowledge_search`. 2026-07-28.
- **D111** — `web.page.canonical_page_id` added to `PAGE_COLUMNS`; `createManualPage` mints the id (`features/marketing/data/service.ts`). 2026-07-27.
- **D73-feedback** — external MCP submission no longer requires `agent_id` (`app/api/mcp/[transport]/route.ts`). 2026-07-27.
- **D104b** — research condensed export type-check fixed; duplicate snippet normalizer deleted. 2026-07-25.
- **D103b** — production build OOM from unused admin TS-error analyzer: route deleted, `pnpm capture-errors` CLI replaces it. 2026-07-25.
- **D95** — SEO command results now a discriminated union end-to-end (aidream `SeoCommandResult` + `result_kind`); FE inline casts killed. 2026-07-23.
- **D89** — `rag.fn_data_store_members_rich` admits grant readers (`migrations/data_store_members_rich_grant_reader.sql`). 2026-07-23.
- **D87** — plaintext secret columns ruled per-column: `byok_secret_key` holds env-var names (CHECK-guarded), `files.webhooks.secret` DB-plaintext by design, `workflow.trigger.webhook_secret` Fernet-encrypted (aidream `0242`). 2026-07-23.
- **D86** — `industry_*` RPC actor-spoof + anon EXECUTE fixed (`migrations/industry_rpc_actor_spoof_fix.sql`). Class rule: session identity always wins over an actor param. 2026-07-23.
- **D77** — dead `podcast-assets` bucket refs healed; dead-media episodes soft-deleted. Standing gap: nothing re-audits media refs post-write. 2026-07-22.
- **D62** — React Compiler re-enabled with A/B proof (+13% build). 2026-07-18.
- **D63** — doc-vs-config drift sweep: `pnpm check:doc-claims` built; 485 files un-excluded from the type gate; `removeConsole` restored; 28 skills migrated. 2026-07-18.
- **D41-audio** — batch STT/TTS on authenticated catalog aliases, typed responses, durable media. 2026-07-15.
- **D36** — dynamic-route soft 404s fixed in production (`3cb3a011f`, `d3214f473`). 2026-07-15.
- **D32** — 500-page PDF scale set shipped (virtualized Studio, resumable clean, lazy ZIPs). 2026-07-08.
- **D60-org** — atomic `org_create` (org + owner in one tx); direct INSERT revoked (`20260715060000`). 2026-07-15.
- **D48** — FE cold-registry gate removed; aidream is the model-resolution authority. 2026-07-16.
- **D59-scopes** — scope/scope-type soft delete restored with owner/admin ACLs (`20260715054500`). 2026-07-15.
- **D2** — canonical membership/invitation privilege escalation closed (`20260715053000-53100`). 2026-07-15.
- **D47** — Image Studio 404 affordances gated by one backend-capability registry. 2026-07-15.
- **D31** — SECURITY DEFINER caller-identity audit closed across all PostgREST-exposed schemas (`20260715042550-050602`). 2026-07-15.
- **D50** — full repo TypeScript green (616 diagnostics eliminated). 2026-07-15.
- **D12** — `selectContextPayload` preserves primitive context labels/types. 2026-07-07.
- **D47-notes** — /notes rich-document actions restored (`NotesView.tsx`). 2026-07-14.
- **D3** — Agent Find Usages + Drift live (prod registry/report/scan, weekly runs). 2026-07-15.
- **D9** — agent working-document edits stream via `context_delta` (8 regression tests). 2026-07-08.
- **D54** — anon NULL-uid bypass in `edu_class_*`/`creator_*` RPCs closed (`migrations/edu_class_anon_null_bypass_fix.sql`). 2026-07-15.
- **D55** — invalid errcode `'NO_DATA_FOUND'` → `'P0002'` (`migrations/edu_class_state_errcode_fix.sql`). 2026-07-15.
- **D56** — `edu_class_roster` peer-email leak: emails nulled for non-owners, `display_name` added (`migrations/edu_class_roster_member_email_privacy.sql`). 2026-07-15.
- **D52** — guardian-link email-enumeration oracle closed + 8/min rate limit (`migrations/edu_guardian_link_d52_enumeration_ratelimit.sql`). 2026-07-15.
- **D49** — canvas materialized tasks/structured_info artifacts self-load via `useCanvasItem` (`cecd46a51`, `5f8d577ee`). 2026-07-13.
- **D46** — draft-transcript auto-label 404: `/api/content-label` → contract-bound `/content-label`. 2026-07-12.
- **D45** — folder rename/move silent no-op: `updateFolder` sends `folder_path`; contract-derived request types (`74942304f`). 2026-07-12.
- **D45-mobile** — mobile flashcard cloze/matching rendering (`4bf7958d5`+). 2026-07-12; re-verified 07-13.
- **D44** — RAG hand-mirrored types derive from `components["schemas"]` (`5329ff502`+). 2026-07-12.
- **D33** — html-preview save-back + content-actions `onSave` chain fixed E2E (`3ccdaae1a`+). 2026-07-12.
- **D14** — war-room recording tab-switch + per-session transcripts verified; stale-key prune fixed (`6bcab5a21`). 2026-07-12.
- **D15-primitives** — generic `file_read` tool + `source_ids` RAG filter live (aidream `4769866cc`). 2026-07-12.
- **D19-items** — audit_bridge `actor_id`, webhook redeliver, `latency_ms` shipped. 2026-07-12.
- **D34-api** — `api_class` tear-out gaps closed; silent-drop sweep promoted to TASK-003. 2026-07-12.
- **D42** — aidream persistence-barrier outage (`Model name 'Users' is ambiguous`) fixed + deployed (`61d5c60b2`). 2026-07-12.
- **D40** — Gemini TTS param-shaping regression fixed (aidream v0.1.544) + concurrent sub-agent `request_id` memo race fixed (v0.1.545); podcast audio E2E verified. 2026-07-14.
- **D43** — app-builder retired-RPC family reimplemented client-side over `graveyardDb`. 2026-07-11.
- **D39** — `model_provider`→`provider_id` stale consumers fixed (aidream `3d3105cb3`; `migrations/ssr_shell_models_provider_id_fix.sql`). 2026-07-11.
- **D37** — cross-account flashcard decks readable via visibility-aware `assoc_members_visible` RPC. 2026-07-10.
- **D38** — `learn_doc` registry `is_public_column` enum-as-boolean nulled (`migrations/p7_fix_learn_doc_registry_is_public_column.sql`). 2026-07-10.
- **D34-dev** — `opengraph-image.tsx` under catch-all moved to a route handler (`9461f3b52`). 2026-07-07.
- **D28** — `study_record_attempt` NULL-result branch fixed live. 2026-07-07.
- **D27** — phantom association tokens: `normalizeEntityToken()` chokepoint + canonical reads. 2026-07-07.
- **D26** — working-document legacy columns dropped; `conversation_documents` graveyarded. 2026-07-02.
- **D25-menus** — content-block insertion restored on all 4 surfaces via v3 `EditableContextMenu`. 2026-07-07.
- **D22** — auth open-redirect + spoofable `x-forwarded-host` closed (`utils/auth/safe-redirect.ts`). 2026-07-07.
- **D30** — shareable-resource TS mirror regenerated from the registry; legacy grant rows backfilled. 2026-07-07.
- **R3** — soft-delete in authenticated RLS removed (`iam.apply_rls` v2). Standing rule: authenticated RLS = authorization only; readers filter `deleted_at` themselves (`docs/official/db-rules.md`). 2026-07-04.
- **D16** — composer draft false-alarm scream + unified send (`a3dfe59d2`). 2026-07-02.
- **D11** — per-turn context chips read frozen `model_context` snapshots. Standing rule: historical record components read frozen snapshots, never live slices. 2026-06-29.
- **D8** — item-presentation detailSources repointed to live schemas (`6769af0c6`). 2026-06-29.
- **D24** — no-op `contentHistory` overlay deleted (`594498a5e`). 2026-06-29.
- **D23** — orphaned `TaskDetails` variant replaced with `<TaskAttachmentsPanel>` (`c4a639ca9`). 2026-06-29.
- **D21** — dead AI-Runs feature deleted (`b4092df3b`). 2026-06-29.
- **D6b** — duplicate tool-viz code-runner deleted (`d05096766`). 2026-06-29.
- **D18** — `files.share_links`/`file_versions` owner SELECT RLS gap closed. 2026-06-27.
- **D17** — `userPreferencesSlice` module lists completed. 2026-06-27.
- **D6a** — window geometry restore keyed by slug (`WindowPersistenceManager.tsx`). 2026-06-27.
- **D5a** — permissive `shortcut_categories` SELECT policy dropped. 2026-06-27.
- **R2** — 11 severed overlay callbacks were dead; deleted. 2026-06-14.
- **R1** — chat Edit/resubmit severed `onSave` + missing RPCs fixed (`migrations/cx_message_soft_delete_and_truncate.sql`). 2026-06-14.
- **D41-research** — research live spend catalog-driven end to end. 2026-07-15.
- **D41-podcast** — podcast cast policy server-owned via typed `GET /podcast/cast-preview`. 2026-07-15.
