-- content_ir.resolve_kind_version ran SECURITY INVOKER over the
-- security_invoker kind_version_ref view (→ history.row_versions), so the
-- kind_example recompute TRIGGER 42501'd for every non-postgres writer
-- (service_role included) after the wf_017/wf_020 view recreation.
-- Fix: the resolver becomes SECURITY DEFINER (body is fully qualified,
-- search_path locked, read-only SQL) with execute restricted to the backend
-- role — pin resolution stays service_role-only (SHAPE_SYSTEM 2026-07-05).
alter function content_ir.resolve_kind_version(uuid, text, integer) security definer;
revoke execute on function content_ir.resolve_kind_version(uuid, text, integer) from public, anon, authenticated;
grant execute on function content_ir.resolve_kind_version(uuid, text, integer) to service_role;
