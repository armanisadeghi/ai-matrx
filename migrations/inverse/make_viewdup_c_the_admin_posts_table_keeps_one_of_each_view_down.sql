-- chair-step: the inverse of make_viewdup_c_the_admin_posts_table_keeps_one_of_each_view.sql — brings the six archived duplicate views back (deleted_at cleared). What it undoes: the Posts table lists "Approval board" four times again.
-- lock: platform
-- lane: MAKE-VIEWS-DEDUPE

set local lock_timeout = '2s';
set local statement_timeout = '60s';

update platform.saved_view set deleted_at = null
 where id in ('31bb7db0-ad5f-4d05-baa1-a2bb9581d4e8','bd3807b2-1bd7-4e76-99aa-35e1fd66f7a8','2c2e9961-729c-4207-a78c-a3445060b281','be35a650-519b-4a55-aea1-205de0e884cc','f3a68721-4565-4514-ab24-f30996aadee7','e1962cf0-3937-426f-babf-f6f3aa435b1f')
   and subject_id = '3f068f1d-35c2-44c4-9ec3-8ec264888e34' and surface_key = 'custom/records';
