-- chair-step: THE INVERSE of migrations/campaign/hr_rev_06_peer_knobs.sql (lane HR-REVIEWS). Deletes the two peer knob rows of feature hr.performance and their override rows; the peer doors then fall back to their coded defaults (peers off, anonymous on). Not yet rehearsed.
delete from platform.knob_override where feature = 'hr.performance' and key in ('standard_review_peers_enabled','standard_review_peer_anonymous');
delete from platform.feature_knob where feature = 'hr.performance' and key in ('standard_review_peers_enabled','standard_review_peer_anonymous');
