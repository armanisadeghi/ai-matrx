-- The autonomy panel read as a novel because the copy IS the data. Each
-- capability carried a 130-190 character description plus an enforcement note
-- written as implementation commentary ("the nightly pass walks the shared
-- keyword dictionary, so it reads the PLATFORM setting - a waiting mode there
-- has no reviewer..."). Arman, 2026-08-25: "it's just novels. Use far fewer
-- words." Same facts, roughly half the words, no jargon, and the word "obey"
-- is gone. Idempotent: re-running sets the same text.
update seo.ai_capability set
  description = case slug
    when 'keyword_classifier'   then 'Works out who is searching and how ready they are to buy. Same answer for every site.'
    when 'topic_assigner'       then 'Decides which offering a keyword belongs to. Unsure ones wait for you.'
    when 'place_detection'      then 'Spots cities, states and "near me". Same words, same answer, every time.'
    when 'matcher_engine'       then 'Runs your rules over your keywords. Never touches one you ruled yourself.'
    when 'meaning_suggestions'  then 'An agent proposes a change instead of making it.'
    else description end,
  enforcement_note = case slug
    when 'keyword_classifier'   then 'A waiting mode stops the nightly run — no one can review a shared dictionary.'
    when 'topic_assigner'       then 'A waiting mode holds every placement for you. Off stops the run.'
    when 'place_detection'      then 'A waiting mode stops the run — no one can review a shared dictionary.'
    when 'matcher_engine'       then 'A waiting mode sends what it finds to Approvals. Off stops the run.'
    when 'meaning_suggestions'  then 'Always proposals. Nothing changes until you approve it.'
    else enforcement_note end,
  updated_at = now()
where slug in ('keyword_classifier','topic_assigner','place_detection','matcher_engine','meaning_suggestions');
