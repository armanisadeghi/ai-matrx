-- War Room read RPCs: SECURITY DEFINER so authenticated callers can read
-- platform.associations (no direct client grant on that table).
-- Access gated by iam.has_access — same contract as assoc_for_*.

CREATE OR REPLACE FUNCTION public.war_room_threads(room_id uuid)
 RETURNS TABLE(thread_id uuid)
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'platform', 'iam'
AS $function$
  SELECT a.source_id
  FROM platform.associations a
  WHERE a.target_type = 'war_room'
    AND a.target_id = war_room_threads.room_id
    AND a.source_type = 'thread'
    AND iam.has_access('war_room', war_room_threads.room_id, 'viewer');
$function$;

CREATE OR REPLACE FUNCTION public.thread_contents(thread_id uuid)
 RETURNS TABLE(module_type text, module_id uuid, origin text, anchor_type text, anchor_id uuid)
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'platform', 'iam'
AS $function$
  SELECT a.source_type, a.source_id, 'thread'::text, NULL::text, NULL::uuid
  FROM platform.associations a
  WHERE a.target_type = 'thread'
    AND a.target_id = thread_contents.thread_id
    AND a.source_type NOT IN (
      'project', 'task', 'war_room', 'thread', 'scope', 'scope_type', 'organization'
    )
    AND iam.has_access('thread', thread_contents.thread_id, 'viewer')
  UNION ALL
  SELECT a.source_type, a.source_id, 'anchor'::text, t.anchor_type, t.anchor_id
  FROM workspace.threads t
  JOIN platform.associations a
    ON a.target_type = t.anchor_type AND a.target_id = t.anchor_id
  WHERE t.id = thread_contents.thread_id
    AND t.anchor_type IN ('project', 'task')
    AND t.anchor_id IS NOT NULL
    AND a.source_type NOT IN (
      'project', 'task', 'war_room', 'thread', 'scope', 'scope_type', 'organization'
    )
    AND iam.has_access('thread', thread_contents.thread_id, 'viewer');
$function$;

GRANT EXECUTE ON FUNCTION public.war_room_threads(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.thread_contents(uuid) TO authenticated;
