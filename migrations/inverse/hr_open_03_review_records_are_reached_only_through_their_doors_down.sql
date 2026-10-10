-- chair-step: lane HR-SCHEMA-OPEN. GRANTs SELECT, INSERT, UPDATE, DELETE on hr.review, hr.review_response and hr.review_peer_nomination back to authenticated (the state before hr_open_03). This reopens direct org-wide reads of review rows over REST.
grant select, insert, update, delete on table hr.review, hr.review_response, hr.review_peer_nomination to authenticated;
