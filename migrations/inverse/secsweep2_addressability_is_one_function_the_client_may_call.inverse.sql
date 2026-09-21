-- chair-step: removes the addressability function the *_is_addressable_* policies call. Those
-- policies will then refuse EVERY client write to their tables, so run their inverses first.

revoke execute on function iam.may_address_user_in_org(uuid, uuid) from authenticated, anon;
drop function if exists iam.may_address_user_in_org(uuid, uuid);
