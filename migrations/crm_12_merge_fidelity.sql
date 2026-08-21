-- ============================================================================
-- crm_12_merge_fidelity.sql — D219: the merge/unmerge round trip must be exact
-- ============================================================================
-- The defect (FOUND_DEFECTS.md D219, proven live 2026-08-20):
--   * merge set `is_primary = false` on EVERY moved contact point, address and
--     affiliation, unconditionally. When the winner had no primary+current
--     affiliation of its own, the affiliation→party mirror trigger
--     (crm._affiliation_edge) then NULLed the winner's `job_title` and
--     `primary_employer_party_id` — a merge that ERASED data on the winner.
--   * unmerge moved rows back but never restored `is_primary`; the
--     `crm.party_merge.moved` ledger stored ids only. An undone merge could
--     leave the loser with no primary email/phone — exactly what
--     crm.check_send_eligibility and the dialer read.
--
-- The fix:
--   1. Merge demotes a moved primary ONLY when the winner already holds a
--      primary in the same scope (contact point: (party, channel); address:
--      (party, purpose_code); affiliation: overlapping primary daterange).
--      Otherwise the winner INHERITS the loser's primary — the mirror trigger
--      then carries the title/employer forward instead of blanking it.
--   2. Every demotion is recorded in the ledger under
--      `primary_demoted_{table}` next to the existing id arrays (old ledger
--      rows simply have no such keys and unmerge treats them as empty).
--   3. Unmerge moves rows back preserving their flags (demoting only on a
--      genuine conflict at the loser), then restores the recorded demotions,
--      each guarded so a partial-unique index can never 23505.
--
-- Patched from the LIVE 2026-08-20 definitions (crm_11_deals_pipelines.sql §7).
-- Idempotent: pure `create or replace`.

create or replace function public.crm_merge_parties(
  p_winner uuid, p_loser uuid, p_method text default 'manual', p_reason text default null)
returns uuid language plpgsql security definer set search_path to 'public' as $fn$
declare v_org uuid; v_merge_id uuid; v_moved jsonb := '{}'::jsonb; v_ids uuid[]; v_demoted uuid[];
begin
  if p_winner = p_loser then
    raise exception 'crm_merge_parties: cannot merge a party into itself' using errcode = '22023';
  end if;
  select organization_id into v_org from crm.party where id = p_winner and deleted_at is null;
  if v_org is null then
    raise exception 'crm_merge_parties: winner party % not found', p_winner using errcode = 'P0002';
  end if;
  if not exists (select 1 from crm.party where id = p_loser and deleted_at is null and organization_id = v_org) then
    raise exception 'crm_merge_parties: loser party % not found in the same organization', p_loser using errcode = 'P0002';
  end if;
  if not (iam.has_access('party', p_winner, 'editor') and iam.has_access('party', p_loser, 'editor')) then
    raise exception 'crm_merge_parties: editor access required on both parties' using errcode = '42501';
  end if;
  if exists (select 1 from crm.party where id in (p_winner, p_loser) and canonical_id is not null) then
    raise exception 'crm_merge_parties: one of these parties is already merged - unmerge first' using errcode = '22023';
  end if;

  -- Contact points: keep a moved primary unless the winner already has a
  -- primary on that channel. Capture the demotions BEFORE the move (the only
  -- moment "was primary" is unambiguous), so unmerge can restore them exactly.
  select coalesce(array_agg(cp.id), '{}') into v_demoted
    from crm.party_contact_point cp
   where cp.party_id = p_loser and cp.deleted_at is null and cp.is_primary
     and exists (select 1 from crm.party_contact_point w
                  where w.party_id = p_winner and w.channel = cp.channel
                    and w.is_primary and w.deleted_at is null)
     and not exists (select 1 from crm.party_contact_point w
                      where w.party_id = p_winner and w.medium_id = cp.medium_id and w.deleted_at is null);
  with moved as (
    update crm.party_contact_point cp
       set party_id = p_winner,
           is_primary = cp.is_primary and not (cp.id = any (v_demoted))
     where cp.party_id = p_loser and cp.deleted_at is null
       and not exists (select 1 from crm.party_contact_point w
                        where w.party_id = p_winner and w.medium_id = cp.medium_id and w.deleted_at is null)
    returning cp.id)
  select coalesce(array_agg(id), '{}') into v_ids from moved;
  v_moved := v_moved || jsonb_build_object('party_contact_point', to_jsonb(v_ids),
                                           'primary_demoted_party_contact_point', to_jsonb(v_demoted));

  select coalesce(array_agg(a.id), '{}') into v_demoted
    from crm.address a
   where a.party_id = p_loser and a.deleted_at is null and a.is_primary
     and exists (select 1 from crm.address w
                  where w.party_id = p_winner and w.purpose_code = a.purpose_code
                    and w.is_primary and w.deleted_at is null);
  with moved as (
    update crm.address a
       set party_id = p_winner,
           is_primary = a.is_primary and not (a.id = any (v_demoted))
     where a.party_id = p_loser and a.deleted_at is null
    returning a.id)
  select coalesce(array_agg(id), '{}') into v_ids from moved;
  v_moved := v_moved || jsonb_build_object('address', to_jsonb(v_ids),
                                           'primary_demoted_address', to_jsonb(v_demoted));

  select coalesce(array_agg(a.id), '{}') into v_demoted
    from crm.affiliation a
   where a.party_id = p_loser and a.deleted_at is null and a.is_primary
     and exists (select 1 from crm.affiliation w
                  where w.party_id = p_winner and w.is_primary and w.deleted_at is null
                    and daterange(w.start_date, w.end_date, '[]') && daterange(a.start_date, a.end_date, '[]'));
  with moved as (
    update crm.affiliation a
       set party_id = p_winner,
           is_primary = a.is_primary and not (a.id = any (v_demoted))
     where a.party_id = p_loser and a.deleted_at is null
    returning a.id)
  select coalesce(array_agg(id), '{}') into v_ids from moved;
  v_moved := v_moved || jsonb_build_object('affiliation', to_jsonb(v_ids),
                                           'primary_demoted_affiliation', to_jsonb(v_demoted));

  with moved as (update crm.interaction set party_id = p_winner
                  where party_id = p_loser and deleted_at is null returning id)
  select coalesce(array_agg(id), '{}') into v_ids from moved;
  v_moved := v_moved || jsonb_build_object('interaction', to_jsonb(v_ids));

  with moved as (
    update crm.outreach_list_member cm set party_id = p_winner
     where cm.party_id = p_loser and cm.deleted_at is null
       and not exists (select 1 from crm.outreach_list_member w
                        where w.outreach_list_id = cm.outreach_list_id and w.party_id = p_winner and w.deleted_at is null)
    returning cm.id)
  select coalesce(array_agg(id), '{}') into v_ids from moved;
  v_moved := v_moved || jsonb_build_object('outreach_list_member', to_jsonb(v_ids));

  with moved as (update crm.deal set primary_party_id = p_winner
                  where primary_party_id = p_loser and deleted_at is null returning id)
  select coalesce(array_agg(id), '{}') into v_ids from moved;
  v_moved := v_moved || jsonb_build_object('deal_primary', to_jsonb(v_ids));

  with moved as (
    update platform.associations a set source_id = p_winner
     where a.source_type = 'party' and a.source_id = p_loser
       and not exists (select 1 from platform.associations_live w
                        where w.source_type = 'party' and w.source_id = p_winner
                          and w.target_type = a.target_type and w.target_id = a.target_id
                          and w.role is not distinct from a.role)
    returning a.id)
  select coalesce(array_agg(id), '{}') into v_ids from moved;
  v_moved := v_moved || jsonb_build_object('assoc_source', to_jsonb(v_ids));

  with moved as (
    update platform.associations a set target_id = p_winner
     where a.target_type = 'party' and a.target_id = p_loser
       and not exists (select 1 from platform.associations_live w
                        where w.target_type = 'party' and w.target_id = p_winner
                          and w.source_type = a.source_type and w.source_id = a.source_id
                          and w.role is not distinct from a.role)
    returning a.id)
  select coalesce(array_agg(id), '{}') into v_ids from moved;
  v_moved := v_moved || jsonb_build_object('assoc_target', to_jsonb(v_ids));

  update crm.party set canonical_id = p_winner where id = p_loser;

  insert into crm.party_merge (winner_id, loser_id, moved, method, reason, merged_by, organization_id)
  values (p_winner, p_loser, v_moved, p_method, p_reason, auth.uid(), v_org)
  returning id into v_merge_id;

  perform platform.log_activity(v_org, 'crm.party.merge', 'party', p_winner,
    jsonb_build_object('loser_id', p_loser, 'merge_id', v_merge_id, 'method', p_method));
  return v_merge_id;
end $fn$;

create or replace function public.crm_unmerge_parties(p_merge_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $fn$
declare v_m crm.party_merge;
begin
  select * into v_m from crm.party_merge where id = p_merge_id and unmerged_at is null;
  if v_m.id is null then
    raise exception 'crm_unmerge_parties: merge record % not found or already undone', p_merge_id using errcode = 'P0002';
  end if;
  if not iam.has_access('party', v_m.winner_id, 'editor') then
    raise exception 'crm_unmerge_parties: editor access required' using errcode = '42501';
  end if;

  -- Move rows back PRESERVING their primary flags (a primary the winner
  -- inherited returns as the loser's primary), demoting only on a genuine
  -- conflict at the loser so the partial-unique indexes cannot 23505.
  update crm.party_contact_point cp
     set party_id = v_m.loser_id,
         is_primary = cp.is_primary and not exists (
           select 1 from crm.party_contact_point w
            where w.party_id = v_m.loser_id and w.channel = cp.channel
              and w.is_primary and w.deleted_at is null and w.id <> cp.id)
   where cp.id = any (array(select jsonb_array_elements_text(v_m.moved->'party_contact_point'))::uuid[]);
  update crm.address a
     set party_id = v_m.loser_id,
         is_primary = a.is_primary and not exists (
           select 1 from crm.address w
            where w.party_id = v_m.loser_id and w.purpose_code = a.purpose_code
              and w.is_primary and w.deleted_at is null and w.id <> a.id)
   where a.id = any (array(select jsonb_array_elements_text(v_m.moved->'address'))::uuid[]);
  update crm.affiliation a
     set party_id = v_m.loser_id,
         is_primary = a.is_primary and not exists (
           select 1 from crm.affiliation w
            where w.party_id = v_m.loser_id and w.is_primary and w.deleted_at is null
              and w.id <> a.id
              and daterange(w.start_date, w.end_date, '[]') && daterange(a.start_date, a.end_date, '[]'))
   where a.id = any (array(select jsonb_array_elements_text(v_m.moved->'affiliation'))::uuid[]);

  -- Restore the primaries THIS merge demoted (ledger keys absent on
  -- pre-crm_12 merges → empty sets, same behavior as before). Guarded: the
  -- flag comes back only if no other primary took the slot meanwhile.
  update crm.party_contact_point cp set is_primary = true
   where cp.id = any (array(select jsonb_array_elements_text(v_m.moved->'primary_demoted_party_contact_point'))::uuid[])
     and cp.deleted_at is null and not cp.is_primary
     and not exists (select 1 from crm.party_contact_point w
                      where w.party_id = cp.party_id and w.channel = cp.channel
                        and w.is_primary and w.deleted_at is null);
  update crm.address a set is_primary = true
   where a.id = any (array(select jsonb_array_elements_text(v_m.moved->'primary_demoted_address'))::uuid[])
     and a.deleted_at is null and not a.is_primary
     and not exists (select 1 from crm.address w
                      where w.party_id = a.party_id and w.purpose_code = a.purpose_code
                        and w.is_primary and w.deleted_at is null);
  update crm.affiliation a set is_primary = true
   where a.id = any (array(select jsonb_array_elements_text(v_m.moved->'primary_demoted_affiliation'))::uuid[])
     and a.deleted_at is null and not a.is_primary
     and not exists (select 1 from crm.affiliation w
                      where w.party_id = a.party_id and w.is_primary and w.deleted_at is null
                        and daterange(w.start_date, w.end_date, '[]') && daterange(a.start_date, a.end_date, '[]'));

  update crm.interaction set party_id = v_m.loser_id
   where id = any (array(select jsonb_array_elements_text(v_m.moved->'interaction'))::uuid[]);
  update crm.outreach_list_member set party_id = v_m.loser_id
   where id = any (array(select jsonb_array_elements_text(v_m.moved->'outreach_list_member'))::uuid[]);
  update crm.deal set primary_party_id = v_m.loser_id
   where id = any (array(select jsonb_array_elements_text(v_m.moved->'deal_primary'))::uuid[]);
  update platform.associations set source_id = v_m.loser_id
   where id = any (array(select jsonb_array_elements_text(v_m.moved->'assoc_source'))::uuid[]);
  update platform.associations set target_id = v_m.loser_id
   where id = any (array(select jsonb_array_elements_text(v_m.moved->'assoc_target'))::uuid[]);

  update crm.party set canonical_id = null where id = v_m.loser_id;
  update crm.party_merge set unmerged_at = now(), unmerged_by = auth.uid() where id = p_merge_id;

  perform platform.log_activity(v_m.organization_id, 'crm.party.unmerge', 'party', v_m.winner_id,
    jsonb_build_object('loser_id', v_m.loser_id, 'merge_id', p_merge_id));
end $fn$;
