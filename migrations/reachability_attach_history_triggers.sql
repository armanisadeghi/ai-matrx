-- Attach _history (version capture) — is_versioned=true for all three tokens; partition 2026_07 exists
DROP TRIGGER IF EXISTS _history ON files.files;
CREATE TRIGGER _history AFTER INSERT OR UPDATE OR DELETE ON files.files
  FOR EACH ROW EXECUTE FUNCTION platform._version_capture('file');

DROP TRIGGER IF EXISTS _history ON transcripts.transcripts;
CREATE TRIGGER _history AFTER INSERT OR UPDATE OR DELETE ON transcripts.transcripts
  FOR EACH ROW EXECUTE FUNCTION platform._version_capture('transcript');

DROP TRIGGER IF EXISTS _history ON transcripts.studio_sessions;
CREATE TRIGGER _history AFTER INSERT OR UPDATE OR DELETE ON transcripts.studio_sessions
  FOR EACH ROW EXECUTE FUNCTION platform._version_capture('studio_session');
