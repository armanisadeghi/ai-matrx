-- chair-step: CREATES one new table users.calendar_feed through platform.create_entity_table (organization data class, soft delete on, RLS by iam.apply_rls, certified in the same transaction; its policies take the supautils ACCESS EXCLUSIVE set on auth/storage/realtime until COMMIT, about 1.5 s), REVOKEs INSERT/UPDATE/DELETE on it from anon and authenticated (the doors write it), adds six functions and four platform.client_callable_door rows. No existing function, policy, grant or row is touched. Inverse: migrations/inverse/calfeed_b_a_calendar_feed_is_a_private_link_read_as_its_owner_down.sql.
-- additive: yes
-- guard: custom/system_enabled
-- lock: platform
-- lane: CAL-FEED-CHART
--
-- A CALENDAR IS SUBSCRIBABLE. A content manager keeps "Client content calendar" and wants the posts
-- in her phone's calendar, updating by themselves. Notion has "Subscribe to calendar"; this is that.
--
--   users.calendar_feed                       one row per link: the view, the title, the text field used
--                                              as the description, the person's time zone, the token's
--                                              SHA-256 (never the token), expiry, revocation, last read.
--   users.calendar_feed_create / _rotate      mint a token and answer it ONCE; the row keeps only its hash.
--   users.calendar_feed_list / _revoke        the person's own links, and the end of one.
--   users.calendar_feed_read(token)           service_role only. Resolves the token, then answers THE VIEW
--                                              AS THE PERSON WHO MADE THE LINK: the transaction takes that
--                                              person's identity and the `authenticated` role and the ordinary
--                                              door (custom.read_records_page, with the view) answers under
--                                              the normal wall and ladder. A person who lost access gets an
--                                              empty calendar, never a bypass.
--   users.calendar_feed_default_days()        the knob's starting value: a link lives 365 days.

do $cf$
begin
  if to_regclass('users.calendar_feed') is null then
    perform platform.create_entity_table(
      p_schema => 'users', p_table => 'calendar_feed',
      p_token => 'users_calendar_feed', p_label => 'Calendar subscription',
      p_fields => array[
        'table_id uuid NOT NULL',
        'view_id uuid',
        'title text NOT NULL',
        'date_field text',
        'end_field text',
        'description_field text',
        'time_zone text NOT NULL DEFAULT ''UTC''',
        'token_hash text NOT NULL',
        'token_prefix text NOT NULL',
        'expires_at timestamptz',
        'revoked_at timestamptz',
        'last_read_at timestamptz',
        'read_count integer NOT NULL DEFAULT 0'
      ],
      p_variant => 'entity',
      p_versioned => false, p_soft_delete => true,
      p_visibility => 'internal',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => array[]::text[],
      p_data_class => 'organization'::platform.data_class,
      p_default_list_scope => 'organization'::platform.list_scope);
  end if;
end
$cf$;

create unique index if not exists calendar_feed_token_hash_key on users.calendar_feed (token_hash);

revoke insert, update, delete, truncate on users.calendar_feed from anon, authenticated;

