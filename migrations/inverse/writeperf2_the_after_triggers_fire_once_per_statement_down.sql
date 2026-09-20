-- additive: yes
--
-- chair-step: THE INVERSE of writeperf2_the_after_triggers_fire_once_per_statement.sql. It drops
--   the thirteen statement-level triggers and puts the seven row-level ones back exactly as
--   `pg_get_triggerdef` held them before that file. The statement-level trigger FUNCTIONS are
--   left in the catalogue — nothing executes them once no trigger names them, and dropping them
--   here would make this file fail whenever a parity run has already restored them once.
--   It is run for real by scripts/campaign-tests/writeperf2_red.sql and by
--   scripts/campaign-tests/writeperf2_parity.sql, inside a transaction that rolls back.

drop trigger if exists io_record_changed_s_i             on custom.record;
drop trigger if exists io_record_changed_s_u             on custom.record;
drop trigger if exists io_record_changed_s_d             on custom.record;
drop trigger if exists zz_ckl_watch_s_i                  on custom.record;
drop trigger if exists zz_ckl_watch_s_u                  on custom.record;
drop trigger if exists zz_w2_containment_association_s_i on custom.record;
drop trigger if exists zz_w2_containment_association_s_u on custom.record;
drop trigger if exists zz_w2a_relation_association_s_i   on custom.record;
drop trigger if exists zz_w2a_relation_association_s_u   on custom.record;
drop trigger if exists zzz_history_capture_s_i           on custom.record;
drop trigger if exists zzz_history_capture_s_u           on custom.record;
drop trigger if exists zzz_history_capture_s_d           on custom.record;
drop trigger if exists _gc_assoc_softdelete_s            on custom.record;
drop trigger if exists _gc_assoc_harddelete_s            on custom.record;

drop trigger if exists _gc_assoc_harddelete on custom.record;
CREATE TRIGGER _gc_assoc_harddelete AFTER DELETE ON custom.record FOR EACH ROW EXECUTE FUNCTION platform._gc_entity_associations('record');

drop trigger if exists _gc_assoc_softdelete on custom.record;
CREATE TRIGGER _gc_assoc_softdelete AFTER UPDATE OF deleted_at ON custom.record FOR EACH ROW EXECUTE FUNCTION platform._gc_entity_associations('record');

drop trigger if exists io_record_changed on custom.record;
CREATE TRIGGER io_record_changed AFTER INSERT OR DELETE OR UPDATE ON custom.record FOR EACH ROW EXECUTE FUNCTION custom.io_record_changed();

drop trigger if exists zz_ckl_watch on custom.record;
CREATE TRIGGER zz_ckl_watch AFTER INSERT OR UPDATE ON custom.record FOR EACH ROW EXECUTE FUNCTION custom._checklist_watch();

drop trigger if exists zz_w2_containment_association on custom.record;
CREATE TRIGGER zz_w2_containment_association AFTER INSERT OR UPDATE ON custom.record FOR EACH ROW EXECUTE FUNCTION custom._containment_association();

drop trigger if exists zz_w2a_relation_association on custom.record;
CREATE TRIGGER zz_w2a_relation_association AFTER INSERT OR UPDATE ON custom.record FOR EACH ROW EXECUTE FUNCTION custom._relation_associations();

drop trigger if exists zzz_history_capture on custom.record;
CREATE TRIGGER zzz_history_capture AFTER INSERT OR DELETE OR UPDATE ON custom.record FOR EACH ROW EXECUTE FUNCTION history.record_capture();
