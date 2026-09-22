-- chair-step: it replaces one live client door so its answer carries a field it already had
--   the data for. Additive in substance — one CREATE OR REPLACE, one key added to a jsonb
--   answer, nothing dropped, nothing revoked, no schema change, no grant — and the body it
--   overwrites is named by the `-- based-on:` line. It cannot be gated on a record-store knob
--   without making the office's copy-link conditional on a switch that has nothing to do with
--   whether a plumber can text his customer a link.
-- based-on: custom.portal_card(uuid, uuid) a054b2d6119875631c1eae010bfba99af6537b51a39dc8e2f56e5a5ced7be972
--
-- TAILS-5 (B) — THE OFFICE'S COPY-LINK, WHICH WAS ONE FIELD SHORT.
--
-- ════════════════════════════════════════════════════════════════════════════════════════
-- WHAT PORTAL-BIND LEFT BEHIND, IN ITS OWN WORDS
-- ════════════════════════════════════════════════════════════════════════════════════════
--     🚨 The office's own copy-link is one line short. `custom.portal_invite` returns
--     `accept_path`, and `PortalsPanel` in `@ai-matrx/records-ui` — which is where a plumber
--     actually invites somebody — does not render it. … a pending principal needs the same
--     control fed from `accept_path` (and `custom.portal_card` should carry it per principal,
--     which is a small additive change to that door).
--
-- So a plumber invites a customer, the door hands the panel one sentence and one link, and the
-- moment that sentence scrolls away the link is gone: the panel redraws from
-- `custom.portal_card`, which knows the person is "invited and waiting" and has no way to say
-- WHAT they are waiting on. Texting a customer their link — which INVITE-DELIVERY measured as
-- the ordinary case, not the fallback — meant inviting them a second time to see it again.
--
-- ════════════════════════════════════════════════════════════════════════════════════════
-- THE CHANGE, AND THE ONE DECISION IN IT
-- ════════════════════════════════════════════════════════════════════════════════════════
-- Each principal now carries `accept_path`: the path of the invitation that is STILL USABLE
-- for that person, or `null`. It is built the one way it is built anywhere —
-- `/invitations/portal/accept/` || the token — from the same `iam.invitations` row
-- `custom.portal_invite` minted, and never from a second template.
--
-- 🚨 `null` IS AN ANSWER, NOT AN ABSENCE, and the screen has to say which. A principal has no
-- path when:
--   * they have already followed it (the invitation is `accepted`) — there is nothing to copy
--     and a link would be a lie;
--   * the office took it back (`custom.portal_revoke` withdraws the invitation in the same
--     statement, which is PORTAL-BIND's own rule that the link dies with the access);
--   * it has expired;
--   * or they were let in through the OTHER way in — `app/api/portal/[slug]/sign-in/route.ts`
--     still mints a Supabase magic link server-side and binds without an invitation at all.
--     That door is the "two doors into one portal" PORTAL-BIND flagged for a ruling, and until
--     somebody rules, a principal who arrived that way genuinely has no link to copy. The panel
--     says so in words rather than drawing a dead control.
--
-- The `status = 'pending'` test is deliberate and not `accepted_at is null`: `iam.invitations`
-- keeps `accepted` as the HISTORY of how somebody was asked, and PORTAL-BIND already paid for
-- reading that row as though it were the current state — its defect 1 was a withdrawn link
-- that still said "already open to you" because the peek asked the invitation instead of the
-- principal. Here the invitation IS the question ("is there a live link to copy?"), so its own
-- status is the right thing to ask.
--
-- Nothing else about the door moves: the two assertions above it, the tables list, the
-- external-lane knob and every other principal field are unchanged, character for character.
--
-- Inverse: migrations/inverse/tails5b_the_portal_card_carries_the_link_down.sql

set lock_timeout = '4s';

CREATE OR REPLACE FUNCTION custom.portal_card(p_organization_id uuid, p_portal_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_p custom.portal;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.portal_card');
  select * into v_p from custom.portal where id = p_portal_id and organization_id = p_organization_id;
  if not found then
    raise exception 'There is no such portal in this organization.' using errcode = '02000';
  end if;
  perform custom.assert_client_may_open(p_organization_id, v_p.client_table_id,
            'custom.portal_card', 'admin'::public.permission_level, 'table');

  return jsonb_build_object(
    'portal_id', v_p.id,
    'title', v_p.title,
    'slug', v_p.slug,
    'is_active', v_p.is_active,
    'sign_in_method', v_p.sign_in_method,
    'client_table_id', v_p.client_table_id,
    'tables', coalesce((
      select jsonb_agg(jsonb_build_object(
               'table_id', pt.table_id,
               'name', coalesce(nullif(t.data ->> 'name', ''), 'a table'),
               'names_via', pt.edge_role,
               'visible_fields', pt.visible_field_keys,
               'editable_fields', pt.editable_field_keys,
               'comments', pt.comments_allowed,
               'conveys', pt.conveys_max::text) order by pt.ord)
        from custom.portal_table pt
        left join custom.record t on t.organization_id = pt.organization_id and t.id = pt.table_id
       where pt.portal_id = v_p.id), '[]'::jsonb),
    'principals', coalesce((
      select jsonb_agg(jsonb_build_object(
               'principal_id', pp.id,
               'email', pp.email,
               'client_record_id', pp.client_record_id,
               'client', coalesce(custom.portal_record_title(pp.organization_id, pp.client_record_id), pp.client_record_id::text),
               'signed_in', pp.user_id is not null,
               'is_active', pp.is_active,
               'invited_at', pp.invited_at,
               'revoked_at', pp.revoked_at,
               -- TAILS-5 (B): THE LINK THE OFFICE COPIES, per person. Built the one way it is
               -- built anywhere, from the invitation custom.portal_invite minted. Null when
               -- there is no live link — the screen says which, and never draws a dead control.
               'accept_path', (
                 select '/invitations/portal/accept/' || i.token
                   from iam.invitations i
                  where i.target_type = 'portal_principal'
                    and i.target_id = pp.id
                    and i.organization_id = pp.organization_id
                    and i.status = 'pending'
                    and i.deleted_at is null
                    and (i.expires_at is null or i.expires_at > now())
                  order by i.created_at desc
                  limit 1)) order by pp.invited_at)
        from custom.portal_principal pp
       where pp.portal_id = v_p.id), '[]'::jsonb),
    'external_lane_open', coalesce(
      (platform.knob_resolve('custom', 'external_principal_enabled', p_organization_id) #>> '{}')::boolean, false));
end $function$;
