-- chair-step: the inverse. Takes the client grant back off public.store_door_lane, which leaves the share dialog unable to say whether a record is published. Rule 27 only.
revoke execute on function public.store_door_lane(text, uuid) from authenticated;
