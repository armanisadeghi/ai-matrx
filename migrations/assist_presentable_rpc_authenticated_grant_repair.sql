-- Restore the Data API execute contract for the authenticated assist reader.
-- Idempotent and deliberately leaves anon/public without execute authority.
REVOKE ALL ON FUNCTION platform.list_my_presentable_assists(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.list_my_presentable_assists(integer) FROM anon;
GRANT EXECUTE ON FUNCTION platform.list_my_presentable_assists(integer) TO authenticated;
