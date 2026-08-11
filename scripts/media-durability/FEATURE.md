# Media durability check — the DURABILITY MISMATCH guard

**Status:** live (2026-08-11) · `pnpm check:media-durability` · loud, advisory, never blocking

## What this exists to catch

**An expiring signed URL is NOT a defect.** It is the correct, intended mechanism in
many places, and destroying those is a worse bug than the one being fixed. Arman's
ruling, verbatim:

> "The problem here is not expiring URLs. There are plenty of times where you want a
> URL to expire because you're sharing it with someone for a few minutes or a few
> hours or a few days. That's very different than something that is being published
> publicly and it's supposed to be persistent, but then it magically goes away."

**THE DEFECT is the MISMATCH** between a URL's lifetime and its consumer's contract:

- a column an **anonymous** surface reads (public share pages, published episodes,
  blog/CMS pages, RSS, OG images) must hold a **durable** ref — an expiring URL there
  works in testing and 403s days later, and the anonymous viewer *cannot re-mint*;
- a column that must **still resolve for its owner tomorrow** must hold a durable ref —
  a public/CDN URL for public content, or a `file_id` re-minted on read for private.

**Not defects, left alone:** time-boxed share links (a security *feature*), TTL caches,
transient in-flight payloads, audit/log/error-capture rows where the expiring string
*is the data*, `mtx_media_heal_queue` (whose job is to hold the offending URL), verbatim
third-party scrape/search responses, and retired `graveyard.*` tables.

## The hard safety rule

**Never resolve a mismatch by publishing private content.** If an asset is
access-controlled, the durable ref is the `file_id`, re-minted on read for an authorized
viewer — *not* a permanent public URL. Converting a private asset into a permanently
public one to make this check come back clean is a data-exposure incident, not a fix.
If you cannot tell whether an asset is meant to be public, **stop and ask Arman.**

## Two rules this system paid for — general, not about media

Both were learned here, and neither is about media URLs. They apply to any guard,
anywhere in the platform. If you take nothing else from this document, take these.

### 1. Assert the machinery out of the LIVE DATABASE, not out of a file

A test that lives in a file can be deleted by the same change that breaks the thing it
guards — and a `create or replace` written against a stale copy silently deletes working
behaviour with nothing going red. That is not hypothetical here: the guard trigger's
per-element array branch was **actually removed from production** by a migration authored
against an older copy of the function. No error. No failing test. The only way to see it
was to read the deployed function.

So the check reads `prosrc` out of `pg_proc` and asserts the properties are still there
(`mtx_media_durability_health()`). A guard whose own integrity is only asserted by a file
sitting next to it is guarding nothing the moment someone rewrites that file.

**Generalise it:** when the artifact you depend on lives in the database — a trigger, an
RPC, a policy, a constraint — assert its shape *from the database*. Code-side tests prove
what the repo believes, not what production does.

### 2. Assert that nothing is STUCK, not that a queue is EMPTY

A queue at zero and a queue quietly filling look identical to a row count. That is exactly
how the media healer stayed green for three weeks while returning `-1` every ten minutes
and healing nothing — `cron.job_run_details` logged "succeeded" the whole time.

So `heal_queue_draining` fails on **staleness**: any row pending or healing for more than
24h, reported with the count and the oldest timestamp. Emptiness is not evidence of a
working drain; absence of *stuck* work is.

And its twin, `heal_queue_no_failures` — because a **terminal** state is the other way a
queue lies. A `failed` row is the drain giving up; it never ages into the pending set, so
a staleness check alone would never see it, *at any age*. Any failed row is a finding
regardless of age: the media it points at is still non-durable and nothing will retry it.
(This gap was real — the first version of this check looked only at `pending`/`healing`,
and the aidream session's measurement of a live mis-resolution is what exposed it.)

**Generalise both:** a queue has three ways to be unhealthy and depth catches none of
them — work that is stuck, work that was abandoned, and a worker that is not running.
Assert on the age of the oldest unfinished item AND on the count of terminal failures.

**Generalise it:** for any queue, retry table, or outbox, the health signal is age of the
oldest unfinished item, never depth. Depth-zero is equally consistent with "working
perfectly" and "nothing is running".

## How it runs

| Command | Scope | Use |
|---|---|---|
| `pnpm check:media-durability` | contract-scoped (seconds) | release gate; the default |
| `pnpm check:media-durability:full` | every text-ish column in every schema | periodic patrol sweep |
| `pnpm check:media-durability:strict` | contract-scoped | exit 1 on an unclassified hit |

The default scan is **contract-scoped on purpose** — it probes exactly the two
populations where the mismatch is definitionally a defect:

1. every column registered in `public.mtx_public_url_guard` (columns a DB designer
   declared must stay durable);
2. every text/jsonb column named in `platform.shareable_resource_registry.public_columns`
   — literally the projection an anonymous share-link viewer receives.

A blanket 734-table sweep takes ~8 minutes and belongs in the patrol, not in every
release.

### `--full` coverage is partial, and it says so

`--full` batches **per schema** (`p_schema`) to stay under the PostgREST statement
timeout. As of 2026-08-11 it completes **41 of 49 schemas**; the eight biggest — `chat`,
`docproc`, `graveyard`, `history`, `public`, `scraper`, `seo`, `web` — still time out
and are **named in the output** as *not covered*. That is deliberate: a patrol that
silently skips the biggest tables reads as "all clear" when it isn't.

**For an authoritative full sweep**, run it over a direct Postgres connection instead of
PostgREST — no statement-timeout ceiling. The original inventory used aidream's
credentials (`SUPABASE_MATRIX_*` in `aidream/.env`, the sanctioned non-MCP path per
`reference_platform_schema_db_access`) and covered all 734 tables in ~8 minutes.

Server side: `public.mtx_media_durability_scan(p_full boolean, p_schema text)` and
`public.mtx_media_durability_schemas()` (`migrations/mtx_media_durability_scan.sql`).

## The classification is the deliverable

`allowlist.json` is not a silencer list — it is **the classification**, and a wrong
verdict in it is the expensive mistake. Every entry names the **consumer** and the
**reading code path** that makes expiry correct there. Three buckets:

- **`intentional`** — expiry is right. Audit/log/error capture, verbatim third-party
  data, documentation prose, retired tables. The checker is silent about these.
- **`mitigated`** — stores a non-durable value, but every reading path recovers the
  `file_id` and re-mints, so nothing breaks for a user. Reported as open, not healed.
- **`mismatch_open`** — a real mismatch that has not been resolved, and why.

**Adding an entry is a judgement, not a way to quiet the checker.** If you cannot name
the consumer and say why expiry is fine for it, it is not intentional — fix the writer.

## The DB-edge guard (write time)

`public.mtx_public_url_guard` + `mtx_public_url_guard_trigger()` catch a non-durable
write *as it happens*: loud `WARNING` in the Postgres log plus a row in
`mtx_media_heal_queue`. Non-blocking by design — rejecting the write would lose the
real media.

Register a column:

```sql
insert into public.mtx_public_url_guard (schema_name, table_name, column_name, note)
values ('podcast', 'pc_episodes', 'image_url', 'public episode cover — anonymous web reads it');

create trigger pc_episodes_public_url_guard
  after insert or update on podcast.pc_episodes
  for each row execute function public.mtx_public_url_guard_trigger();
```

**Do NOT register intentional-expiry columns** — that would queue heal jobs against
working features and break them.

### 🚨 The trigger body is MERGED — never re-derive it from one migration

`mtx_public_url_guard_trigger()` carries two independent improvements from two
different migrations, and a `create or replace` in either one silently overwrites
whatever the other taught it:

1. **Array awareness** (`mtx_public_media_url_guard_rollout.sql`) — the columns this
   defect class is actually about are `text[]`: `podcast.pc_studio_runs.image_urls`
   and `.video_urls`. A scalar `->>` on an array yields the array's JSON *text*, so a
   signed element is caught only because the regex happens to match inside the blob —
   detection by accident, per-blob instead of per-element. The array branch checks each
   element (`jsonb_array_elements_text` + `bool_or`) and skips JSON nulls.
2. **Schema awareness** (`mtx_public_url_guard_schema_aware.sql`) — the registry lookup
   keyed on `(schema_name, table_name)`.

**This already went wrong once, and the array branch was ACTUALLY LOST IN PRODUCTION —
not almost-lost.** Recording the sequence precisely, because a fuzzy version of it invites
someone to drop aidream migration `0333` as redundant:

1. `mtx_public_url_guard_schema_aware.sql` applied with a scalar-only body. The live
   function became **schema-aware but scalar-only** — the per-element array branch was
   gone from the database. Measured directly with `pg_get_functiondef`:
   `jsonb_array_elements_text` absent, `TG_TABLE_SCHEMA` present.
2. aidream migration **`0333`** restored the union: array branch + schema match +
   JSON-null skip + `schema_name` on the queued row. That is what `0333` is FOR — it is
   not precautionary and must not be dropped.
3. This file was then updated to carry the merged body too, so a re-apply can no longer
   revert it.

During step (1) the guard was silently blind to per-element checking on exactly the
`text[]` columns this defect class is about. Nothing errored. **Do not record this as
"the live body was never scalar-only" — it was**, between the two applies. (An earlier
draft of this doc said exactly that, inferred from a single reading taken after `0333`
had already landed; the podcast session had the direct measurement.)

Both branches now live in `mtx_public_url_guard_schema_aware.sql`, which is the file to
edit, and `public.mtx_media_durability_health()` asserts all four properties out of the
LIVE `prosrc` on every `pnpm check:media-durability` run — so this window cannot reopen
unnoticed. Regression-tested
2026-08-11 on a throwaway table (`public.mtx_guard_selftest`, created and dropped in the
same run so no live row is touched) across six cases — array with one signed element
among durable ones, all-durable array, empty array, SQL NULL, scalar signed, scalar
durable: all pass.

### The guard's health check is ONE authority, callable from any repo

`public.mtx_media_durability_health()` lives in the **database**, not in this repo. That
is deliberate: the thing it guards — `mtx_public_url_guard_trigger()` — is shared by
matrx-frontend and aidream, so a second implementation on the server side would be two
authorities that can disagree about whether the guard is intact.

**aidream (or any repo) should CALL it, not reimplement it.** One authority, many callers.
`select * from public.mtx_media_durability_health()` returns `(check_name, ok, detail)`;
fail the caller's release gate on any `ok = false`.

Calling it from aidream's own release path is worth doing and is **not** duplication —
it's coverage. This repo's gate only runs when someone runs *this* repo's gates, so an
aidream-only deploy could otherwise regress the shared trigger with nothing asserting it.
The failure mode being covered is precisely a silent one: the array branch was already
lost in production once (above) and no error was raised.

### The healer is NOT pg_cron anymore (2026-08-11)

The original migration's comment promised "a pg_cron + pg_net + backend publish endpoint
tomorrow". That healer existed, then **died silently on 2026-07-21**:
`mtx_media_heal_dispatch()` returned `-1` every 10 minutes because the vault secret
`CLOUD_FILES_BYPASS_SECRET` was removed by the org-vault annihilation, while
`cron.job_run_details` cheerfully logged "succeeded". It is now an in-process loop on the
aidream scheduler host with a stall alarm; aidream migration `0332` unschedules the
`mtx-media-heal-drain` cron job and **drops `mtx_media_heal_dispatch()`**. Don't
resurrect either name.

### The guard was schema-blind, and it silently died (fixed 2026-08-11)

`mtx_public_url_guard_trigger()` matched the registry on `TG_TABLE_NAME` alone. Two
registry rows still carried **pre-reorg** names — `aga_apps` (now `app.definition`) and
`wf_template` (now `workflow.template`). The triggers were attached and firing, the
lookup matched zero rows, and the guard was a **silent no-op on three columns — all
three anon-facing**: `app.definition.preview_image_url`, `app.definition.favicon_url`,
`workflow.template.preview_image_url`.

A guard that reports nothing is indistinguishable from a guard that finds nothing. The
key is now `(schema_name, table_name)` — bare names like `definition` and `template`
exist in several schemas, so renaming the rows alone would have left the guard able to
fire on the wrong table. `schema_name IS NULL` still matches any schema (back-compat).
Migration: `migrations/mtx_public_url_guard_schema_aware.sql`.

## Related

- `CLAUDE.md` § "Media durability — public/owned media is NEVER a raw signed URL"
- `lib/media/signed-url.ts` — `isSignedUrl` / `signedUrlExpiresAtMs`, the shared
  classifier that knows both AWS dialects (SigV2 and SigV4)
- `lib/media/durability.ts` — `fileIdFromUserFilesUrl`, `reportMediaDurabilityViolation`
- `features/files/handler/hooks/useRemintableSrc.ts` — the read-side self-heal
- `components/mardown-display/blocks/buildMediaSource.ts` — file_id recovery for blocks
- `FOUND_DEFECTS.md` → D1

## Change Log

- **2026-08-11** — Created. Platform-wide inventory (734 tables in Matrx Main + all 11
  tables of the CMS project `viyklljfdhtidwecakwx`, which was clean); 61 columns
  classified; the schema-blind guard defect found and fixed with a proven live test
  write; scan RPC + this checker added.
