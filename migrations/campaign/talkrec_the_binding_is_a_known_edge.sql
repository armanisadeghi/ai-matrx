-- chair-step: platform.association_types is not on the additive allow-list's registry list (feature_knob, knob_override, knob_rung_lock, entity_types, entity_relationships, client_callable_door, build_lock, go_signal_capture), and it is the one table that says which edges may exist at all, so a lane cannot widen it unattended. This row declares ONE new pair, conversation -> custom_record, with container_side = 'none' so it conveys no access in either direction; it adds no column, changes no existing row and drops nothing.
--
-- THE BINDING IS A KNOWN EDGE, AND IT CONVEYS NOTHING.
--
-- Lane TALK-TO-RECORD, 2026-09-20. `platform.enforce_known_association` refuses any edge
-- whose (source_type, target_type) pair is not declared, which is the platform working:
-- measured live, `custom.conversation_scope_bind` was refused by name with
-- *"Unknown association type: conversation -> custom_record"*.
--
-- 🚨 `container_side = 'none'` IS THE WHOLE SECURITY ARGUMENT OF THIS ROW. A pair that
-- names a container side is a pair through which ACCESS FLOWS — a person who may open the
-- container may open what is in it. A conversation is not a container of the record it is
-- about: binding a chat to Acme Industrial must never hand Acme Industrial to anybody who
-- can open that chat, and it must stop reaching the record the moment the share is revoked.
-- `talkrec_green.sql` PART 6 is that clause: the share is revoked while the binding stays
-- live, and `custom.conversation_scope` answers `readable: false` with the reason while
-- `custom.conversation_scope_context` answers no context at all.
--
-- `conveys_max` is the lowest level the enum has; with no container side there is nothing
-- for it to bound, and it is set low so that a later change of `container_side` — which
-- would be a real decision — cannot silently convey more than viewer.
--
-- `label` is NULL on purpose: `platform.enforce_known_association` reads a NULL label as
-- "any label of this pair", and the label on the EDGE carries the record's title, which is
-- a name for a person reading the table and not a second kind of edge.

insert into platform.association_types
  (source_type, target_type, label, container_side, conveys_max, is_active, notes)
values
  ('conversation', 'custom_record', null, 'none', 'viewer', true,
   'AGT-N-9 / PRODUCTS row 11 (lane TALK-TO-RECORD, 2026-09-20): a conversation is ABOUT one '
   'record. Written only by custom.conversation_scope_bind, which decides the record on the '
   'store''s own ladder (custom.has_visibility at viewer) and the conversation on '
   'iam.has_access. container_side is none: the edge conveys NO access in either direction, '
   'so a chat bound to a record grants that record to nobody, and a revoked share stops the '
   'context assembling on the next turn.')
on conflict (source_type, target_type) do nothing;
