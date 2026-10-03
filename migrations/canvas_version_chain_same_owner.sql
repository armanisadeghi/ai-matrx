-- draft: canvas-chain-owner-lane proven on the clone only; held until the owning session applies it to live
-- window-class: adds a same-org trigger on canvas.canvas_items (supautils set: 23 auth/storage/realtime relations held to COMMIT) — apply 01:00-04:00 Pacific only
-- based-on: public.cx_canvas_get_version_history(uuid) e6d546c7ee4c8c1cf5e7b6e23e6ac2a527ad621c4a0ce6dd213aede3047c5a7d
-- based-on: public.cx_canvas_get_conversation_latest(uuid) 416717903f24dcd02b0006c84d4baecf9f863bebfc7d2d94a703c517f9b30fbd
--
-- A canvas version chain is ONE person's.
--
-- canvas.canvas_items.parent_canvas_id carried no owner check: insert RLS checks only the
-- row's own user_id, so anyone could insert THEIR row into another person's chain at any
-- version (a public v999 became the owner's "newest version" in every chain reader).
--
-- 1. The guard: a composite foreign key (user_id, parent_canvas_id) -> (user_id, id), on
--    the existing UNIQUE (user_id, id). A version's owner must equal its parent's owner,
--    so by induction every row of a chain belongs to the root's owner. MATCH SIMPLE: a
--    root (parent_canvas_id NULL) is unconstrained. Moving a chain to a new owner moves
--    every row in one statement (the check runs at statement end). Deleting a parent sets
--    only parent_canvas_id NULL, as the existing canvas_items_parent_canvas_id_fkey does.
-- 2. The two chain readers keep only the root owner's rows (rows planted before the guard).
--
-- Census on the 2026-10-03 clone: 1895 rows, 2 chain children, 0 violating, 0 orphaned,
-- 0 nested, 0 cross-organization. Locks: SHARE (index build) and SHARE ROW EXCLUSIVE (validation) on
-- canvas.canvas_items only, milliseconds at this size; no ACCESS EXCLUSIVE anywhere.

-- The covering index every foreign key needs (provision_shape_guard): a delete or owner
-- change of a parent finds its versions without a sequential scan.
create index if not exists canvas_items_user_id_parent_canvas_id_idx
  on canvas.canvas_items (user_id, parent_canvas_id);

alter table canvas.canvas_items
  add constraint canvas_items_version_chain_same_owner
  foreign key (user_id, parent_canvas_id)
  references canvas.canvas_items (user_id, id)
  on delete set null (parent_canvas_id);

-- A nullable foreign key into a tenant table also carries the validation-only same-org
-- check (provision_shape_guard): a version lives in its chain's organization, as every save
-- path already writes it (census: 0 cross-organization chain rows).
drop trigger if exists trg_same_org_canvas_canvas_items_parent_canvas_id on canvas.canvas_items;
create trigger trg_same_org_canvas_canvas_items_parent_canvas_id
  before insert or update of parent_canvas_id, organization_id on canvas.canvas_items
  for each row execute function platform.assert_same_org('parent_canvas_id', 'canvas.canvas_items');

comment on constraint canvas_items_version_chain_same_owner on canvas.canvas_items is
  'A version chain is one person''s: a version''s owner (user_id) must equal its parent''s owner. Without it anyone could insert their own row into another person''s chain.';

CREATE OR REPLACE FUNCTION public.cx_canvas_get_version_history(p_canvas_id uuid)
 RETURNS SETOF canvas.canvas_items
 LANGUAGE sql
 STABLE
AS $function$
  WITH RECURSIVE find_root AS (
    SELECT id, parent_canvas_id
    FROM canvas.canvas_items WHERE id = p_canvas_id
    UNION ALL
    SELECT ci.id, ci.parent_canvas_id
    FROM canvas.canvas_items ci
    JOIN find_root fr ON ci.id = fr.parent_canvas_id
  ),
  root AS (
    SELECT fr.id, ci.user_id
    FROM find_root fr
    JOIN canvas.canvas_items ci ON ci.id = fr.id
    WHERE fr.parent_canvas_id IS NULL
    LIMIT 1
  )
  -- Only the chain owner's rows are versions (canvas_items_version_chain_same_owner).
  SELECT ci.*
  FROM canvas.canvas_items ci, root r
  WHERE (ci.id = r.id OR ci.parent_canvas_id = r.id)
    AND ci.user_id = r.user_id
  ORDER BY ci.version;
$function$;

CREATE OR REPLACE FUNCTION public.cx_canvas_get_conversation_latest(p_conversation_id uuid)
 RETURNS SETOF canvas.canvas_items
 LANGUAGE sql
 STABLE
AS $function$
  WITH roots AS (
    -- All items that ARE roots (no parent) in this conversation
    SELECT id AS root_id, user_id AS root_owner
    FROM canvas.canvas_items
    WHERE conversation_id = p_conversation_id
      AND parent_canvas_id IS NULL
      AND is_archived = false
  ),
  latest AS (
    -- For each root, the highest-version row of the root OWNER's chain (or the root itself);
    -- a row another person put in the chain is not a version (canvas_items_version_chain_same_owner).
    SELECT DISTINCT ON (r.root_id)
      ci.*
    FROM roots r
    JOIN canvas.canvas_items ci
      ON (ci.id = r.root_id OR ci.parent_canvas_id = r.root_id)
     AND ci.user_id = r.root_owner
    WHERE ci.is_archived = false
    ORDER BY r.root_id, ci.version DESC
  )
  SELECT * FROM latest
  ORDER BY created_at;
$function$;
