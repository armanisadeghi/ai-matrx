-- hindsight_canonicalize applied canonical RLS whose owner short-circuit reads
-- `created_by`, but every enrollment row had created_by NULL and the real owner in
-- the legacy `user_id`. The children were backfilled from the parent's created_by,
-- so they inherited the NULL. Nothing broke (aidream reaches these tables via the
-- ORM, which bypasses RLS, and the frontend never queries them) — but the owner
-- short-circuit was inert. Make the canonical column carry the truth.
UPDATE hindsight.enrollment SET created_by = user_id
WHERE created_by IS NULL AND user_id IS NOT NULL;

UPDATE hindsight.review c SET created_by = e.created_by
FROM hindsight.enrollment e WHERE e.id = c.enrollment_id AND c.created_by IS NULL;

UPDATE hindsight.finding c SET created_by = e.created_by
FROM hindsight.enrollment e WHERE e.id = c.enrollment_id AND c.created_by IS NULL;

UPDATE hindsight.replay c SET created_by = e.created_by
FROM hindsight.enrollment e WHERE e.id = c.enrollment_id AND c.created_by IS NULL;
