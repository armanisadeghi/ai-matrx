-- Everyone-can-view means every AUTHENTICATED platform user — never the
-- anonymous internet. web_public_view_visibility.sql flipped brand/site to
-- visibility='public', which activated the previously-inert anon `pub_read`
-- policies: full-row reads (integrations refs, initialization errors,
-- settings, org ids) for anyone holding the publishable anon key. Close the
-- anon channel entirely; authenticated universal view flows through
-- std_select → iam.has_access (visibility='public' ⇒ viewer) and is
-- unaffected by this migration.

drop policy if exists pub_read on web.site;
drop policy if exists pub_read on web.brand;
revoke select on web.site from anon;
revoke select on web.brand from anon;
