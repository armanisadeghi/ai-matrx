-- detail_list_context_max_ceiling — correct `ui.detail.list_context_max_ids` so the
-- ceiling cannot be configured into the very defect it guards (VERIFY-U-P1-R3,
-- NEW-12). METADATA ONLY: no value a human chose is touched.
--
-- WHAT WAS WRONG. The knob was applied 2026-09-17 with `max_value = 2000` and a
-- basis claiming "a uuid entry costs ~41 characters of URL, so 200 entries is
-- ~8.4 KB of query string — inside the request line every proxy in front of this
-- platform accepts". Two things in that sentence do not hold, both measured by
-- round 3 against the client's own encoder:
--
--   * 2,000 entries — the value this `max_value` PERMITTED an organization to set
--     — is an 84,006-character query string. That is four times the >20 KB href
--     the cap exists to prevent, so the guard could be configured into the defect.
--   * Even at the default 200, an entry is only ~41 characters when the TYPE token
--     is short: a 30-character type token gives 13,606 characters, past the 8 KB
--     request line nginx accepts by default. A record count was never the budget.
--
-- WHAT IS TRUE NOW. The budget is BYTES and the client enforces it:
-- `DETAIL_LIST_CONTEXT_URL_BUDGET_BYTES` (6,000 characters for the list value,
-- `lib/detail/types.ts`) is measured on the encoded list — the page query and the
-- window's `?panels=` token each measure their own spelling — and the list is
-- trimmed to the window around the current record until it fits, saying so
-- (`?lt=<total>` → the line under the record's id). 6,000 leaves ~2 KB of an 8 KB
-- request line for the method, the path and every other parameter.
--
-- So this knob is what it always should have been: how many neighbours a link may
-- carry AT MOST, inside a budget it cannot override. `max_value` drops to 500,
-- which is also `DETAIL_LIST_CONTEXT_MAX_IDS_CEILING` in the client — above it the
-- byte budget always trims first, so a larger setting would promise records the
-- URL can never carry. The default of 200 is unchanged and remains the right
-- starting value: for uuid entries the byte budget bites at ~142 records, and the
-- person is told when it does.
--
-- Review due 2026-10-31, unchanged. Reversible: restore the previous basis text
-- and `max_value`; nothing in the client depends on this row existing (the module
-- default answers when the knob does not).
--
-- 🚨 NOT APPLIED BY THIS LANE. Written 2026-09-17 by fix lane F-18, which does
-- not apply database files. Apply with `pnpm db:apply
-- migrations/detail_list_context_max_ceiling.sql`. Until then the live row still
-- says `max_value = 2000` and carries the old basis sentence, while the CLIENT
-- already clamps to 500 and to the byte budget — so the failure mode in the
-- meantime is a settings screen that offers a number the client quietly lowers,
-- not a URL anyone can break.

update platform.feature_knob
   set max_value = 500,
       basis =
         'The budget is BYTES, not records: the client trims the list until the encoded value fits ' ||
         '6,000 characters (DETAIL_LIST_CONTEXT_URL_BUDGET_BYTES, lib/detail/types.ts), which leaves ' ||
         '~2 KB of an 8 KB request line for the path and the rest of the URL, and it says so on the ' ||
         'record when it trims. This number is the record ceiling inside that budget. Measured ' ||
         '2026-09-17 (VERIFY-U-P1-R3, NEW-12): 200 uuid entries = 8,406 characters, 200 entries with a ' ||
         '30-character type token = 13,606, and 2,000 entries — which the former max_value of 2000 ' ||
         'permitted — = 84,006, four times the >20 KB href the cap was written to prevent. 500 is the ' ||
         'ceiling because above it the byte budget always trims first, so a larger value would promise ' ||
         'records the URL cannot carry. Default 200 is unchanged.',
       description =
         'How many of the records from a list a shared or bookmarked record link may step through at ' ||
         'most. A link is also limited by its own length, so a long list is cut to the records either ' ||
         'side of the one the link points at — and the record says so when that happens.',
       updated_at = now()
 where feature = 'ui.detail'
   and key = 'list_context_max_ids';
