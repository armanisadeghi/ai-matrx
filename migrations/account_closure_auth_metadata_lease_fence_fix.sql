-- Corrective fence semantics for account closure. The original migration is ledgered.
-- based-on: public.account_closure_claim(uuid, uuid, jsonb) 5a6ca46e93f4e0dcf7a3f3199ad0dae85002ac59ddceb425f896572f3c7e3f99
-- based-on: public.account_closure_write(uuid, uuid, jsonb) c423124f16b208ecbcc87dad4fa8dc5ccfc93f438e8acfa273fd322cdd0a69c7
-- based-on: public.account_closure_release(uuid, uuid) 75f86a18ec13bb722bdf3ad44e821c73462b5976c970900678d9283637c2df40

create or replace function public.account_closure_claim(
  p_user_id uuid, p_token uuid, p_initial_journal jsonb default '{}'::jsonb
) returns jsonb
language plpgsql volatile security definer set search_path = '' as $fn$
declare v_metadata jsonb; v_journal jsonb; v_until timestamptz := pg_catalog.now() + interval '5 minutes'; v_held_until timestamptz;
begin
  if p_token is null then raise exception 'account_closure_token_required' using errcode = '22023'; end if;
  select raw_app_meta_data into v_metadata from auth.users where id = p_user_id for update;
  if not found then raise exception 'account_closure_user_not_found' using errcode = 'P0002'; end if;
  v_metadata := coalesce(v_metadata, '{}'::jsonb);
  v_journal := coalesce(v_metadata->'account_closure', p_initial_journal, '{}'::jsonb);
  if jsonb_typeof(v_journal) <> 'object' then raise exception 'account_closure_journal_invalid' using errcode = '22023'; end if;
  v_held_until := (v_journal #>> '{lease,expires_at}')::timestamptz;
  if v_held_until is not null and v_held_until > pg_catalog.now()
     and (v_journal #>> '{lease,token}') is distinct from p_token::text then return null; end if;
  v_journal := jsonb_set(v_journal, '{lease}', jsonb_build_object('token', p_token::text, 'expires_at', v_until), true);
  update auth.users set raw_app_meta_data = v_metadata || jsonb_build_object('account_closure', v_journal) where id = p_user_id;
  return v_journal;
end;
$fn$;

create or replace function public.account_closure_write(p_user_id uuid, p_token uuid, p_journal jsonb)
returns boolean language plpgsql volatile security definer set search_path = '' as $fn$
declare v_metadata jsonb; v_until timestamptz;
begin
  if p_token is null or jsonb_typeof(p_journal) <> 'object' then return false; end if;
  select raw_app_meta_data into v_metadata from auth.users where id = p_user_id for update;
  if not found then raise exception 'account_closure_user_not_found' using errcode = 'P0002'; end if;
  v_until := (v_metadata #>> '{account_closure,lease,expires_at}')::timestamptz;
  if v_until is null or v_until <= pg_catalog.now()
     or (v_metadata #>> '{account_closure,lease,token}') is distinct from p_token::text then return false; end if;
  p_journal := jsonb_set(p_journal, '{lease}', jsonb_build_object('token', p_token::text, 'expires_at', pg_catalog.now() + interval '5 minutes'), true);
  update auth.users set raw_app_meta_data = coalesce(v_metadata, '{}'::jsonb) || jsonb_build_object('account_closure', p_journal) where id = p_user_id;
  return true;
end;
$fn$;

create or replace function public.account_closure_release(p_user_id uuid, p_token uuid)
returns boolean language plpgsql volatile security definer set search_path = '' as $fn$
declare v_metadata jsonb; v_journal jsonb;
begin
  if p_token is null then return false; end if;
  select raw_app_meta_data into v_metadata from auth.users where id = p_user_id for update;
  if not found then raise exception 'account_closure_user_not_found' using errcode = 'P0002'; end if;
  if (v_metadata #>> '{account_closure,lease,token}') is distinct from p_token::text then return false; end if;
  v_journal := (v_metadata->'account_closure') - 'lease';
  update auth.users set raw_app_meta_data = v_metadata || jsonb_build_object('account_closure', v_journal) where id = p_user_id;
  return true;
end;
$fn$;
