-- chair-step: remove public.mnd_filled_by (undo mnd_filled_by_holders.sql); the agents and workflows lists' Fills mandates column reads it

set local lock_timeout = '2s';

drop function if exists public.mnd_filled_by(text, uuid[], uuid);
