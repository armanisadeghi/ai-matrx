-- Task auto-ingest notify trigger referenced NEW.user_id (dropped) -> NEW.created_by.
CREATE OR REPLACE FUNCTION public._notify_auto_ingest_task()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    PERFORM pg_notify('auto_ingest', json_build_object(
        'source_kind', 'task',
        'source_id',   NEW.id::text,
        'user_id',     NEW.created_by::text,
        'organization_id', NEW.organization_id::text
    )::text);
    RETURN NULL;
END
$function$;
