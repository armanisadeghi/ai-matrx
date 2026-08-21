-- D232 §D (part 2) — legal.wc_claim.is_public: STATE 1 of the bivalent sequence.
--
-- doctrine §8a-1: a live column that deployed code writes is cut in three states,
-- each individually valid. This file is state 1 — make the DB accept BOTH
-- generations. It drops nothing.
--
-- The column is real and written: aidream's WC router (`aidream/api/routers/
-- legal_wc_ratings.py` -> `knowledgebase/experts/ama_expert/pd_ratings/
-- registered_functions.py`) passes `is_public` straight into the insert/patch, and
-- matrx-frontend selects it in the saved-cases list. Measured live 2026-08-21:
-- 1 row, `is_public=false`, `visibility='internal'` — they agree today, and
-- nothing keeps them agreeing.
--
-- The mirror is the same shape `workbench._bridge_legacy_owner` already uses on
-- the four `udt_*` tables, reduced to the is_public <-> visibility half:
--   * legacy writer sets is_public       -> visibility is derived
--   * canonical writer sets visibility   -> is_public is mirrored down
-- so old code and new code are simultaneously correct. `organization_id` is
-- NOT NULL on this table, so the not-public case always lands on `internal`,
-- never silently demoting an org row to `personal`.
--
-- `is_public` also loses its NOT NULL here — doctrine §8d step 2, the whole trick:
-- while it is NOT NULL no repo can stop naming it, which is what forces a
-- simultaneous cross-repo cut. Nullable, each repo cuts over independently.
--
-- STATE 3 (the DROP) is filed separately and is gated on the DEPLOYED aidream SHA
-- carrying the repoint, not on it being pushed (§8a-1 corollary).
--
-- Idempotent.

alter table legal.wc_claim alter column is_public drop not null;

create or replace function legal._bridge_wc_claim_is_public()
returns trigger
language plpgsql
as $fn$
begin
  if TG_OP = 'INSERT' then
    if NEW.visibility is null then
      NEW.visibility := case
        when coalesce(NEW.is_public, false) then 'public'::platform.visibility
        else 'internal'::platform.visibility
      end;
    else
      NEW.is_public := (NEW.visibility = 'public'::platform.visibility);
    end if;
  else
    if NEW.visibility is null then
      NEW.visibility := OLD.visibility;
    end if;
    if NEW.visibility is distinct from OLD.visibility then
      -- canonical writer wins
      NEW.is_public := (NEW.visibility = 'public'::platform.visibility);
    elsif coalesce(NEW.is_public, false) is distinct from coalesce(OLD.is_public, false) then
      -- legacy writer toggled the boolean
      NEW.visibility := case
        when coalesce(NEW.is_public, false) then 'public'::platform.visibility
        else 'internal'::platform.visibility
      end;
    end if;
  end if;
  return NEW;
end;
$fn$;

comment on function legal._bridge_wc_claim_is_public() is
  'D232 §D bivalent bridge: keeps legal.wc_claim.is_public and .visibility in agreement so pre- and post-repoint code are both correct. DELETE this function together with the is_public column once the deployed aidream SHA writes visibility (doctrine §8a-1 state 3).';

drop trigger if exists _bridge_is_public on legal.wc_claim;
create trigger _bridge_is_public before insert or update on legal.wc_claim
  for each row execute function legal._bridge_wc_claim_is_public();
