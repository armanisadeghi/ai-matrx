-- D108: recover the seven "permanently dead" feedback screenshots, and close the
-- classifier hole that let their URL form be written in the first place.
--
-- THE LEDGER WAS WRONG about the loss. The seven `users.user_feedback.image_urls`
-- entries pointing at `server.app.matrxserver.com/share/<token>/download` 404 with
-- `share_link_invalid` — but only the SHARE LINK died. All seven tokens still
-- resolve through `graveyard.files_share_links` to live `files.files` rows, every
-- one of them `visibility='public'`, and every one of their CDN objects returns
-- HTTP 200 today (verified with a real anonymous fetch of all 7 before writing
-- this). Nothing needed recovering from backups; the durable URL was always there.
--
-- No flip is involved, so the D158 flip-then-rewrite ordering hazard does not
-- apply here: flipping a file to public MOVES the S3 object and invalidates URLs
-- written beforehand, but these files are already public and already served.
--
-- PART 2 — the actual defect behind it. `mtx_is_durable_media_url` fenced only
-- SIGNED urls (`x-amz-signature`, `expires`, …). A `/share/<token>/download` link
-- carries no signature, so the guard called it DURABLE and happily let it be
-- stored in a column meant to hold permanent media. But a share link is
-- revocable and expirable BY DESIGN — that is what a share link is for — so it
-- is never a durable identity for an asset. That is precisely how these seven
-- became dead pointers. The frontend twin (`lib/media/durability.ts`) is
-- corrected in the same change to keep the two classifiers in parity.

-- ---------------------------------------------------------------------------
-- Part 1 — heal the seven rows from their own file rows.
-- ---------------------------------------------------------------------------
update users.user_feedback f
set image_urls = (
  select array_agg(
    case
      when u.url like '%/share/%/download%' then coalesce(healed.durable_url, u.url)
      else u.url
    end
    order by u.ord
  )
  from unnest(f.image_urls) with ordinality as u(url, ord)
  left join lateral (
    select 'https://cdn.matrxserver.com/'
           || fl.created_by::text || '/'
           || replace(fl.file_path, ' ', '%20') as durable_url
    from graveyard.files_share_links g
    join files.files fl on fl.id = g.resource_id
    where u.url like '%/share/' || g.share_token || '/download%'
      and fl.visibility = 'public'
    limit 1
  ) healed on true
)
where exists (
  select 1 from unnest(f.image_urls) as x(url) where x.url like '%/share/%/download%'
);

-- ---------------------------------------------------------------------------
-- Part 2 — a revocable share link is NOT a durable media URL.
-- ---------------------------------------------------------------------------
create or replace function public.mtx_is_durable_media_url(url text)
returns boolean
language sql
immutable
as $function$
  select case
    when url is null or url = '' then true
    -- signed / expiring URLs are the failure mode we fence against
    when url ~* '[?&](x-amz-signature|x-amz-credential|expires|signature)=' then false
    -- a share link is revocable and expirable BY DESIGN, so it can never be the
    -- durable identity of an asset. Storing one in a permanent-media column is
    -- how D108's seven feedback screenshots became dead pointers: the files were
    -- always alive and public, but the link that named them was revoked.
    -- The durable ref is the CDN/public URL, or the file_id re-minted on read.
    when url ~* '/share/[0-9a-f-]{8,}/(download|view|raw)(\?|$)' then false
    else true
  end;
$function$;
