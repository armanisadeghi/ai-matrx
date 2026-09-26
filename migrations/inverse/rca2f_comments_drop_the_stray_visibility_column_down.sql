-- chair-step: rule-27 rehearsal inverse of rca2f_comments_drop_the_stray_visibility_column.sql — puts platform.comments.visibility back (not null, default 'internal'); the values are not recoverable and were all the default.

set local lock_timeout = '2s';

alter table platform.comments add column visibility platform.visibility not null default 'internal'::platform.visibility;
