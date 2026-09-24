-- target: branch
-- Branch-only preparation to reapply the exact revised RC-A2 file after a prior
-- candidate applied. The revised up file re-adds this same CHECK constraint.
-- Never run on production; no comment rows or other schema objects change.
SET LOCAL lock_timeout = '2s';
ALTER TABLE platform.comments DROP CONSTRAINT comments_anchor_is_a_kind;
