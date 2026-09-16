-- cx_conversation_variable_authorship — A CONVERSATION REMEMBERS WHO WROTE ITS VARIABLES.
--
-- THE DEFECT (cold walk, jobs-bar-2026-09-16; the limit 09d06177f0 wrote into the selector
-- rather than hiding, reproduced live before this file).
-- ---------------------------------------------------------------------------------------
-- A purpose-built conversation hands its agent the whole job as named launch variables —
-- exactly right under THE USER-INPUT LAW. The Conductor sends `rulebook_id`, `attachments`
-- and the entire rendered `rulebook_document`; the Scout interview sends the mode, the
-- probes, the closing switch and the Expert's goal. `09d06177f0` recorded that authorship
-- in the browser (`hostValueNames`) so the first user bubble stopped reciting the host's
-- vocabulary back at the person who never typed a word of it.
--
-- `chat.conversation.variables` stores the MERGED payload and nothing else. It cannot tell
-- a host value from a typed one, by construction. So the moment a conversation was reopened
-- from the database the whole dict came back as values the person had supposedly supplied,
-- and her own message bubble said "Expert Goal: …" / "Rulebook: …" all over again. The
-- authorship only ever lived as long as the tab did.
--
-- THE SHAPE. Authorship belongs BESIDE the values it describes — one array of the variable
-- names the host wired, on the same row as `variables`, not buried in a UI metadata blob
-- that means nothing to anyone reading the conversation later.
--
-- AUTHORSHIP IS NOT DELIVERY. Nothing about resolution, the three-tier merge or the
-- outbound request changes: a host value still wins over scope and default and still ships.
-- This column decides only whose words they are, and it moves one way — the moment the
-- person edits one of these through the ordinary user path the name leaves the list.
--
-- ADDITIVE AND SAFE. `default '{}'` means every existing conversation reads back as "we
-- were never told", which renders exactly as it does today (a value with no claim attached)
-- rather than as a new claim about rows nobody recorded authorship for. The table's grants
-- are relation-level (`authenticated=arwd`), so the column is readable and writable by the
-- browser that knows the answer without any new grant. `get_cx_conversation_bundle` returns
-- the conversation as `to_jsonb(c.*)`, so the new column reaches the client with no RPC
-- change.

alter table chat.conversation
  add column if not exists host_value_names text[] not null default '{}'::text[];

comment on column chat.conversation.host_value_names is
  'The names in `variables` that the HOST (the launching surface) wired on the person''s '
  'behalf, rather than values she typed. Authorship only — resolution and delivery are '
  'unaffected. Empty means no authorship was recorded, never "all of it is hers by proof". '
  'Read by matrx-frontend''s loadConversation into the instance''s hostValueNames so a '
  'rehydrated conversation never prints the host''s launch values inside the person''s own '
  'message bubble. Cold walk jobs-bar-2026-09-16.';
