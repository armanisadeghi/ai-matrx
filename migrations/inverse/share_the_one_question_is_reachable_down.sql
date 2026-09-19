-- chair-step: the inverse of share_the_one_question_is_reachable.sql. Takes the client grant back off public.may_manage_sharing, which leaves the share dialog unable to ask whether to draw its controls. Rule 27 only.
revoke execute on function public.may_manage_sharing(text, uuid) from authenticated;
