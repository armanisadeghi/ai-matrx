-- chair-step: THE INVERSE of migrations/campaign/hr_rev_04_standard_review_knobs.sql (lane HR-REVIEWS). Archives nothing else; deletes the six standard_review_* knob rows of feature hr.performance (and any override rows on them). The hr_review doors then fall back to their coded defaults. Not yet rehearsed.
delete from platform.knob_override where feature = 'hr.performance' and key like 'standard\_review\_%';
delete from platform.feature_knob where feature = 'hr.performance' and key like 'standard\_review\_%';
