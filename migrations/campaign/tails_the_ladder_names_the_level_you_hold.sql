-- additive: yes
--
-- chair-step: it REPLACES the live body of `custom.assert_client_may_change`. Nothing is
--   dropped, nothing is revoked, no row is touched, and no caller gains or loses a way
--   through: the four ways through and the order they are asked in are byte-identical.
--   What changes is the SENTENCE the one refusal says.
--
-- TAILS — THE LADDER'S REFUSAL NAMES THE LEVEL YOU HOLD AND THE LEVEL IT NEEDS.
--
-- THE DEFECT, named by lane DOORS-GREEN and left for whoever owns the ladder. This is the
-- shared refusal of every structural door in the store - `custom.form_declare`,
-- `custom.field_declare`, `custom.capture_sheet_declare` and the rest all speak through
-- this one body - and to an EDITOR of a Table it said:
--
--     "You do not have access to this table, so custom.capture_sheet_declare may not write to it."
--
-- He has access to the table. He opens it, he reads it, he writes rows in it. What he does
-- not have is the ADMIN rung that declaring a capture sheet needs - and that fact appeared
-- only in the hint, so the sentence a screen shows, a log keeps and a person repeats was
-- false while the small print under it was true. A screen never lies.
--
-- THE FIX. Before refusing, the body asks `custom.effective_level` - the ladder's own
-- highest-rung-admitted reader, so there is no second opinion about what somebody holds -
-- and says one of two true things:
--   · holds nothing: the original sentence, which was never wrong for that case;
--   · holds something: "You are a viewer of this table, and custom.field_declare needs the
--     admin level.", with the ladder and the remedy in the hint.
-- It costs one ladder walk on the REFUSAL path only; nothing about a permitted call moves.
--
-- based-on: custom.assert_client_may_change(uuid, uuid, text, permission_level, text) 2db06d6c929f6087f8020af74c446d7ab72b575989cbd1aa0a2d2b6c974db4b9

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

  raise exception 'You are a % of this %, and % needs the % level.',
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
