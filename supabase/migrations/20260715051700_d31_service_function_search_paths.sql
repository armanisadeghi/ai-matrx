-- D31 advisor follow-up: server-only legacy functions must not inherit a
-- caller-controlled search_path even though browser execution is revoked.

alter function public.remove_sharing(uuid, uuid)
  set search_path = '';

alter function public.rename_storage_folder(text, text, text, uuid)
  set search_path = '';
