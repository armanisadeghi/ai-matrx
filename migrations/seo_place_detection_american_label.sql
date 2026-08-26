-- The AI autonomy screen reads labels from seo.ai_capability. The place
-- detection row still said "Recognising" after the source seed was Americanized.
-- Idempotent: only rewrites the British label.
update seo.ai_capability
set label = 'Recognizing places in keywords',
    updated_at = now()
where slug = 'place_detection'
  and label is distinct from 'Recognizing places in keywords';
