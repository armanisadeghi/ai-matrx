-- dd222_exemplar_is_closed_to_the_signed_out_reader — THE EXEMPLAR TABLE'S SIGNED-OUT COLUMN BOUND
-- (DD-222. db-rules §0/§6d/§9. GRANTS ONLY — no DDL, no policy, no row touched.)
--
-- ═══ WHAT IS LIVE, MEASURED 2026-09-14 ═════════════════════════════════════════════════════════
-- `agent.exemplar` is the ONE agent-level sample-input store (generalized from the mandate test
-- bench 2026-08-25). `anon` holds column-level SELECT on 22 of its 27 columns — DD-186's own
-- bound (`migrations/dd186_anon_columns_agent.sql`), declared in `lib/security/public-exposure.ts`
-- with the reason "no signed-out reader was found for it in the four-repository census — the bound
-- is what keeps a column added tomorrow from publishing itself".
--
-- Among those 22 are `user_input` and `variables`: the two columns THE USER-INPUT LAW reserves for
-- what a human actually typed, plus `reference_output` and `reference_artifact`, the run they were
-- kept for. The row gate is the generated `pub_read` = `deleted_at is null and visibility =
-- 'public'`.
--
-- Signed-out probe over HTTPS with the publishable key and NO JWT, before this file (live):
--   GET /rest/v1/exemplar?select=id,variables,user_input&limit=1   (Accept-Profile: agent)  -> 200 []
--   GET /rest/v1/exemplar?select=metadata&limit=1                                          -> 401 42501
-- 200 on `variables` is the finding: the empty array is the ROW gate, not the column gate. Of 876
-- exemplars not one is `visibility='public'` today (870 internal, 6 personal), so the door is
-- latent — and latent by an accident of data, not by a decision anybody made.
--
-- Proven live and rolled back in ONE transaction, `set local role anon` (the same stack PostgREST
-- assumes), one exemplar flipped to `public` inside the transaction:
--
--   AS ANON | current_user=anon | id=3f0d567d-3653-4a87-b364-e72efa3336d0 | label='Captured run 1'
--           | variables = {"focus": "AP Biology", "title": "Cell Respiration Review.pdf",
--                          "source_content": "Cellular respiration converts glucose into usable ATP
--                          through glycolysis, the ..."}
--
-- ROLLBACK; re-read after: 870 internal / 6 personal, that row still `internal`, `version` still 1.
-- The day someone marks ONE exemplar public — which is what that flag is FOR — every anonymous
-- visitor on the internet reads the prompt variables a human typed into the sample store.
--
-- ═══ THE BOUND, DECIDED FROM THE READERS ═══════════════════════════════════════════════════════
-- The bound of a signed-out surface is the columns that surface renders, and nothing else. Census
-- across all four repositories (matrx-frontend, aidream, matrx-extend, matrx-local):
--
--   * matrx-frontend — three readers, and every one of them is signed in:
--       features/agents/samples/service.ts       `@/utils/supabase/client` (browser session
--                                                client) behind the agent builder;
--       features/mandates/admin/service.ts       the same, plus
--                                                `requireAuthenticatedSupabaseSession`;
--       scripts/backfill-agent-exemplar-input-content.ts  `SUPABASE_SECRET_KEY` (service role).
--     `utils/permissions/publicLane.ts` — the register that decides which types get an indexable
--     signed-out page at `/p/e/<type>/<id>` — declares `note`, `message_template` and `fc_set`.
--     There is NO exemplar type in it, so no public exemplar page exists to be reached, and
--     `publicLaneSelect()` throws rather than inventing one. No `app/(public)/**` route, share
--     lens or unauthenticated API route names the relation.
--   * aidream — reads it as the service role / through matrx-orm (`services/agent_testing/**`,
--     `services/mandates/**`); its one publishable-key client always carries the caller's JWT.
--   * matrx-extend — no reader (`src/**`; the only exemplar strings in the repo are generated
--     API types and a built bundle in `.matrx/realbrowser-vault`).
--   * matrx-local — no reader (generated API types only).
--
-- ZERO signed-out readers. So the exact closed list is the empty list: there is no column a
-- signed-out surface renders for a public exemplar, `variables` and `user_input` least of all, and
-- keeping a rump of id/label/timestamps would be inventing a surface nobody serves.
--
-- This is not an exception carved for one table. Measured on this database today, the state this
-- file moves `agent.exemplar` INTO is the majority one: 199 relations already carry an anon SELECT
-- policy and zero anon column privileges, against 146 bounded and 4 unbounded. A policy without a
-- grant grants nothing, and the refusal is loud — Postgres answers 42501 with the exact GRANT that
-- would open it — so the day someone builds a public exemplar gallery they make the publishing
-- decision explicitly, on a register row, instead of inheriting it from a retrofit.
--
-- The column grants are revoked BY NAME. A table-level `REVOKE SELECT` does NOT remove
-- column-level grants (B-78 measured that on `docproc.processed_documents`), so a file that only
-- said `revoke select on agent.exemplar from anon` would have left all 22 columns exactly where
-- they are and asserted nothing.
--
-- ═══ WHAT THIS FILE DOES NOT DO ════════════════════════════════════════════════════════════════
-- It does not touch the ROW surface. `pub_read` is the generated DD-173 base contract and belongs
-- to that campaign; `iam.apply_rls` is the only thing that may write a policy (§6d). It does not
-- touch `authenticated`, which keeps every column — the builder's samples manager and the mandate
-- bench are signed-in surfaces and must not lose a byte. It changes no row.

-- agent.exemplar — CLOSED to the signed-out reader. Revoked by column name, then the table
-- privilege after it, so neither shape of grant can survive this file.
revoke select (
  id, mandate_id, label, variables, user_input, reference_output, reference_artifact, source,
  captured_agent_id, captured_model_id, position, is_active, created_at, updated_at, deleted_at,
  visibility, agent_id, status, agent_version, input_contract_hash, output_contract_hash,
  source_conversation_id
) on agent.exemplar from anon;
revoke select on agent.exemplar from anon;

do $$
declare
  v_anon_cols  int;
  v_auth_cols  int;
  v_total_cols int;
  v_rows       bigint;
  v_public     bigint;
begin
  select count(*) filter (where has_column_privilege('anon', a.attrelid, a.attnum, 'SELECT')),
         count(*) filter (where has_column_privilege('authenticated', a.attrelid, a.attnum, 'SELECT')),
         count(*)
    into v_anon_cols, v_auth_cols, v_total_cols
    from pg_attribute a
   where a.attrelid = 'agent.exemplar'::regclass and a.attnum > 0 and not a.attisdropped;

  if v_anon_cols <> 0 then
    raise exception 'dd222: anon still holds SELECT on % of the % column(s) of agent.exemplar. '
                    'The whole point of this file is that the number is zero.',
                    v_anon_cols, v_total_cols;
  end if;

  if has_table_privilege('anon', 'agent.exemplar'::regclass, 'SELECT') then
    raise exception 'dd222: anon still holds a table-level SELECT on agent.exemplar.';
  end if;

  -- The signed-in reader is the one this table exists for. Losing a column here is a defect, not
  -- a tightening: the builder samples manager and the mandate bench both read every column.
  if v_auth_cols <> v_total_cols then
    raise exception 'dd222: authenticated holds SELECT on only % of % column(s) of agent.exemplar. '
                    'This file may only close the signed-out door.', v_auth_cols, v_total_cols;
  end if;

  -- Not one row may move. This is a grants-only file.
  select count(*), count(*) filter (where visibility = 'public'::platform.visibility)
    into v_rows, v_public from agent.exemplar;
  if v_public <> 0 then
    raise exception 'dd222: % of % exemplars are visibility=public. That is a row-surface change '
                    'this file never makes — investigate before believing this bound.',
                    v_public, v_rows;
  end if;
  raise notice 'dd222: agent.exemplar closed to anon — 0 of % columns for anon, % of % for '
               'authenticated, % rows untouched (0 public).',
               v_total_cols, v_auth_cols, v_total_cols, v_rows;
end $$;

comment on table agent.exemplar is
  'The ONE agent-level sample-input store (agent_id is the subject; mandate_id is optional '
  'call-site context). CLOSED TO anon (DD-222, 2026-09-14): a four-repository census found no '
  'signed-out reader — every reader is the browser session client behind the builder or the '
  'mandate bench, or the service role — and the public lane (utils/permissions/publicLane.ts) has '
  'no exemplar type, so no signed-out page exists. `user_input`, `variables`, `reference_output` '
  'and `reference_artifact` are what a human typed and what it produced. A public exemplar '
  'surface is a publishing decision with its own register row; do not re-grant anon without one.';
