# Communication-schema move — Phase 2 runbook

Phase 1 (canonicalize sms_*/dm_*/emails in place) is **done + committed** (`83f560b2c`). This is the
turnkey runbook for **Phase 2**: relocate all 13 tables `public.* → communication.*`. Execute as one
pass once the blocker clears.

## BLOCKER (only the user / mgmt-API can do this)
`communication` must be added to **PostgREST exposed schemas** (Supabase dashboard → Settings → API →
Exposed schemas, or `PATCH /v1/projects/txzxabzwovsujtloxrus/postgrest` preserving the current list).
Not MCP-reachable. The FE reads dm_*/sms_* directly via supabase-js + realtime, so the instant the
tables move into an unexposed schema they 404. **Expose first, confirm, then move.**

## Tables (13)
emails · dm_conversations · dm_messages · dm_conversation_participants · sms_consent ·
sms_conversations · sms_media · sms_messages · sms_notification_preferences · sms_notifications ·
sms_phone_numbers · sms_rate_limits · sms_webhook_logs

## Order of operations
1. **Register the move FIRST** (dead-relations guard is the checklist): for each table add to
   `scripts/dead-relations.json` (old `public.<t>` → `communication.<t>`) and
   `platform.deprecated_relations`. aidream parallel: `db/check_dead_relations.py`.
2. **DDL (one migration `communication_move_phase2.sql`):**
   ```sql
   ALTER TABLE public.emails                       SET SCHEMA communication;
   ALTER TABLE public.dm_conversations             SET SCHEMA communication;
   ALTER TABLE public.dm_messages                  SET SCHEMA communication;
   ALTER TABLE public.dm_conversation_participants SET SCHEMA communication;
   ALTER TABLE public.sms_consent                  SET SCHEMA communication;
   ALTER TABLE public.sms_conversations            SET SCHEMA communication;
   ALTER TABLE public.sms_media                    SET SCHEMA communication;
   ALTER TABLE public.sms_messages                 SET SCHEMA communication;
   ALTER TABLE public.sms_notification_preferences SET SCHEMA communication;
   ALTER TABLE public.sms_notifications            SET SCHEMA communication;
   ALTER TABLE public.sms_phone_numbers            SET SCHEMA communication;
   ALTER TABLE public.sms_rate_limits              SET SCHEMA communication;
   ALTER TABLE public.sms_webhook_logs             SET SCHEMA communication;
   -- registry schema_name
   UPDATE platform.entity_types SET schema_name='communication'
     WHERE token IN ('dm_conversation','dm_message','dm_participant','sms_conversation',
       'sms_message','sms_message_media','sms_consent','sms_notification','sms_notification_preference','sms_phone_number');
   UPDATE public.shareable_resource_registry SET schema_name='communication' WHERE resource_type='dm_conversation';
   ```
   Policies/triggers/constraints (incl. inbound FKs) follow automatically. `permissions`,
   `organizations`, `shareable_resource_registry` stay in public — `dm_participant_sync_grant` /
   `dm_default_org` need NO repoint.
3. **Repoint 5 functions** (`CREATE OR REPLACE`, swap `public.<t>`→`communication.<t>`):
   `get_ssr_shell_data`, `get_ssr_agent_shell_data`, `get_user_dashboard_metrics`,
   `sms_handle_opt_out_keywords` (→communication.sms_consent),
   `sms_update_conversation_on_message` (→communication.sms_conversations).
   (`sms_update_timestamp` is an orphan function — no trigger — optional drop.)
4. **Realtime:** confirm the tables stay in the `supabase_realtime` publication after the move
   (they follow `SET SCHEMA`; verify with `\dRp+` / pg_publication_tables). FE `postgres_changes`
   filters must set `schema: 'communication'`.
5. **FE types:** add `--schema communication` to the `db-types` script in `package.json`; `pnpm db-types`.
6. **FE callsites (~103 across ~20 files):** `.from('<t>')` → `.schema('communication').from('<t>')`,
   and realtime `{ schema:'public', table:'dm_*'/'sms_*' }` → `schema:'communication'`. Heaviest:
   `app/api/sms/admin/route.ts`(13), `lib/sms/send.ts`(11), `app/api/messages/conversations/[id]/route.ts`(11),
   `lib/sms/receive.ts`(9), `app/api/sms/conversations/route.ts`(6), `app/api/messages/[conversationId]/messages/route.ts`(6),
   `app/api/messages/[conversationId]/messages/[id]/route.ts`(6), `lib/sms/numbers.ts`(5),
   `hooks/useSupabaseMessaging.ts`(5), `features/messaging/components/MessagingInitializer.tsx`(4),
   `app/api/webhooks/twilio/status/route.ts`(4), `app/api/messages/conversations/route.ts`(4),
   `lib/services/feedback-assignment-notifier.ts`(3), `app/api/sms/send/route.ts`(3), `app/api/sms/preferences/route.ts`(3),
   `lib/supabase/messaging.ts`(2), `features/messaging/service/sendDirectActionMessage.ts`(2),
   `features/messaging/components/NewConversationDialog.tsx`(2), `app/api/sms/verify/route.ts`(2),
   `app/api/sms/messages/route.ts`(2). `pnpm sync-types`, fix TS, `pnpm check:dead-relations` green.
7. **aidream:** add `communication` to `db/matrx_orm.yaml` `additional_schemas` + generate block;
   `python db/generate.py`; repoint any sms/dm model imports + `package_integration.py`;
   `python db/detect_applied.py`; `python run.py` clean boot.
8. **Ledger** `communication_move_phase2.sql`; commit + push `main` on matrx-frontend + aidream.

## Verify
Per-table `SELECT count(*)` pre/post (unchanged); policies/triggers followed
(`pg_policy`/`pg_trigger` on `communication.<t>`); the 5 RPCs still run; `pnpm check:dead-relations`
green; messaging E2E (send/read DM + SMS) once the app is back up.
