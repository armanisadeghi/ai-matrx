-- workbench_product_capture_instant_run_pointer — never lose an instant-lane run.
--
-- THE DEFECT this closes: the INSTANT lane held its conversation id in React state only.
-- Tapping away, backgrounding the phone, or leaving the route unmounted the hook, which
-- destroyed the local instance and orphaned the run — the stream vanished, the `onResult`
-- persistence seam never fired, and a PAID analysis was gone with no way back to it.
--
-- The fix is a durable pointer: the item's run conversation id is written the MOMENT the
-- conversation is created (before a single token streams), so returning to the item can
-- rehydrate the transcript (`loadConversation`) and rejoin a still-running turn
-- (`reconnectServerOperation`) — and, when the run finished server-side while nobody was
-- watching, recover its JSON into the `instant_analysis` payload after the fact.
--
-- One change: `workbench.product_capture_payload.kind` gains 'instant_run' — the pointer
-- document (`{version, conversationId, startedAt}`, see pipeline-types.ts `InstantRunPointer`).
-- It is a POINTER, deliberately its own kind: the `instant_analysis` row stays the verbatim
-- agent-kind object and never carries client bookkeeping.
--
-- Applied live as `workbench_product_capture_instant_run_pointer`. Idempotent.

alter table workbench.product_capture_payload
  drop constraint if exists product_capture_payload_kind_check;
alter table workbench.product_capture_payload
  add constraint product_capture_payload_kind_check
  check (kind = any (array['analysis'::text, 'research'::text, 'grading'::text,
                           'listing'::text, 'instant_analysis'::text, 'instant_run'::text]));

do $verify$
begin
  if not exists (select 1 from pg_constraint
                  where conname = 'product_capture_payload_kind_check'
                    and pg_get_constraintdef(oid) like '%instant_run%') then
    raise exception 'instant_run_pointer: payload kind CHECK not extended';
  end if;
end
$verify$;
