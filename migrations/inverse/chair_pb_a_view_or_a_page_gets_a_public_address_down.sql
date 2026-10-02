-- INVERSE of migrations/campaign/chair_pb_a_view_or_a_page_gets_a_public_address.sql (lane
-- CHAIR-TEMPLATE-FAMILY). Removes iam.resolve_publish_binding_kind and custom.publish_bind and their
-- door rows. Bindings already made stay in iam.publish_binding and keep resolving through
-- iam.resolve_publish_binding (without their kind).
-- chair-step: removes the two publish-binding doors (resolver with kind, bind by kind); bindings stay.

set lock_timeout = '5s';
set statement_timeout = '60s';

delete from platform.client_callable_door
 where declared_by = 'chair_pb_a_view_or_a_page_gets_a_public_address.sql';

drop function if exists custom.publish_bind(uuid, text, uuid, text, text);
drop function if exists iam.resolve_publish_binding_kind(text);
