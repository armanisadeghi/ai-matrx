-- additive: yes
--
-- chair-step: it REPLACES the live body of `custom.assert_client_may_change` again, for
--   one word of English. Nothing else moves.
--
-- TAILS — "You are a editor of this table" (and the fix is to drop the article).
--
-- The sentence landed an hour earlier as "You are a % of this %", and `%` is a level name
-- the ladder supplies, so `editor` and `admin` both came out with the wrong article. An
-- English article computed from a rung name is a second thing to get wrong for no gain, so
-- the sentence names the level the way the rest of the ladder's own prose does:
--
--     "You hold the editor level on this table, and custom.field_declare needs the admin level."
--
-- based-on: custom.assert_client_may_change(uuid, uuid, text, permission_level, text) 08344622e7140aa222afb7d50c519622cac1258548c197f438bfbd01d2d8d5b7

CREATE OR REPLACE FUNCTION custom.assert_client_may_change(p_organization_id uuid, p_subject_id uuid, p_door text, p_required permission_level DEFAULT 'editor'::permission_level, p_subject_word text DEFAULT 'record'::text)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me          uuid;
  v_subject_org uuid;
  v_held        public.permission_level;
begin
  -- ONE order, always: the organization wall first, then the row. A door that asked about
  -- the row first would answer "you may not touch this record" to somebody who should have
  -- been told they are in the wrong organization entirely.
  perform custom.assert_client_may_reach(p_organization_id, p_door);

  -- Way through 1: the role that owns the store (every campaign and server lane).
  if custom.query_is_store_owner() then
    return;
  end if;

  if p_subject_id is null then
    return;
  end if;

  -- Way through 2: no signed-in person at all — the anonymous capture door, which has
  -- already decided this write against the form's own token.
  v_me := custom.query_principal();
  if v_me is null then
    return;
  end if;

  -- Way through 3: a subject that does not live in this organization (the kernel Tables),
  -- or that is not there at all (the door raises its own 02000 a line later).
  select r.organization_id into v_subject_org
    from custom.record r
   where r.organization_id = p_organization_id
     and r.id = p_subject_id;
  if v_subject_org is null then
    return;
  end if;

  if custom.has_visibility(v_me, 'record', p_subject_id, p_required) then
    return;
  end if;

  -- ── LANE TAILS, 2026-09-21: THE REFUSAL NAMES THE RUNG HELD, NOT ONLY THE RUNG NEEDED. ──
  -- This one sentence is every structural door's refusal (form_declare, field_declare,
  -- capture_sheet_declare and the rest all speak through here), and it told an EDITOR of a
  -- Table "You do not have access to this table" - which he demonstrably does. The rung he
  -- was missing appeared only in the hint, so the sentence a screen shows, a log keeps and a
  -- person reads was false while the small print beneath it was true. Named by DOORS-GREEN.
  v_held := custom.effective_level(v_me, p_organization_id, p_subject_id, 'record');

  if v_held is null then
    -- Nothing at all: the original sentence, which was never wrong for this case.
    raise exception 'You do not have access to this %, so % may not write to it.',
      coalesce(nullif(btrim(p_subject_word), ''), 'record'),
      coalesce(nullif(btrim(p_door), ''), 'that door')
      using errcode = '42501',
            hint = format(
              'DOOR-1 decides reading and writing with the SAME question: a %s you may not open is a %s you may not change. This needs the %s level (viewer < commenter < editor < admin) - ask whoever holds it to share it with you, or ask an owner of this organization. Being a member of the organization is not by itself permission to rewrite somebody else''s row.',
              coalesce(nullif(btrim(p_subject_word), ''), 'record'),
              coalesce(nullif(btrim(p_subject_word), ''), 'record'),
              p_required);
  end if;

  -- No article: "a editor" was what the first pass shipped, and an English article
  -- computed from a level name is a second thing to get wrong for no gain.
  raise exception 'You hold the % level on this %, and % needs the % level.',
    v_held,
    coalesce(nullif(btrim(p_subject_word), ''), 'record'),
    coalesce(nullif(btrim(p_door), ''), 'that door'),
    p_required
    using errcode = '42501',
          hint = format(
            'DOOR-1 decides reading and writing with the SAME question, on ONE ladder: viewer < commenter < editor < admin. You hold %s on this %s and %s needs the %s level, so ask an admin of this %s - or an owner of this organization - to raise your level. Being a member of the organization is not by itself permission to rewrite somebody else''s row.',
            v_held,
            coalesce(nullif(btrim(p_subject_word), ''), 'record'),
            coalesce(nullif(btrim(p_door), ''), 'that door'),
            p_required,
            coalesce(nullif(btrim(p_subject_word), ''), 'record'));
end
$function$

;
