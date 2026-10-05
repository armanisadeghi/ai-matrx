-- A restored account begins a fresh closure journal under the same row lock.
-- based-on: public.account_closure_claim(uuid, uuid, jsonb) f6fdbf1ce5cf81729c053748894615d598ef9f5fb51e8a928ed0b6b5398e243c

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
  v_journal := v_metadata->'account_closure';
  if v_journal is not null and jsonb_typeof(v_journal) <> 'object' then raise exception 'account_closure_journal_invalid' using errcode = '22023'; end if;
  -- Server-only callers can request a new closure only after a completed restore.
  if coalesce(v_journal->>'state', '') = 'restored' and p_initial_journal->>'state' = 'closing' then
    v_journal := p_initial_journal;
  else
    v_journal := coalesce(v_journal, p_initial_journal, '{}'::jsonb);
  end if;
  if jsonb_typeof(v_journal) <> 'object' then raise exception 'account_closure_journal_invalid' using errcode = '22023'; end if;
  v_held_until := (v_journal #>> '{lease,expires_at}')::timestamptz;
  if v_held_until is not null and v_held_until > pg_catalog.now()
     and (v_journal #>> '{lease,token}') is distinct from p_token::text then return null; end if;
  v_journal := jsonb_set(v_journal, '{lease}', jsonb_build_object('token', p_token::text, 'expires_at', v_until), true);
  update auth.users set raw_app_meta_data = v_metadata || jsonb_build_object('account_closure', v_journal) where id = p_user_id;
  return v_journal;
end;
$fn$;
