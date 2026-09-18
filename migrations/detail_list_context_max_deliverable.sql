-- detail_list_context_max_deliverable — make `ui.detail.list_context_max_ids` a
-- number the URL can actually deliver, and stop its basis text telling an
-- administrator something that is not true (VERIFY-U-P1-R4, NEW-19 + NEW-20).
-- METADATA AND THE STARTING VALUE ONLY: no organization or user override is
-- touched (`platform.feature_knob` holds the platform rung; overrides live
-- elsewhere and nothing here writes them).
--
-- WHAT WAS WRONG. The previous correction (`detail_list_context_max_ceiling.sql`,
-- applied 2026-09-17 20:48Z) set `max_value = 500` and a basis saying "200 uuid
-- entries = 8,406 characters… This number is the record ceiling inside that
-- budget". Round 4 measured what the browser really carries and neither half held:
--
--   * The 6,000-character budget was measured on the list VALUE, one escaping
--     layer too early. `UrlPanelManager` writes a detail window's `?panels=` token
--     through `new URLSearchParams(...).toString()`, which escapes every `%` the
--     token's own escaping already produced — a uuid's `-` goes `-` → `%2D` →
--     `%252D`. A deep link that measured 5,992 arrived in the address bar at
--     7,416, and a detail PAGE that also carried an open window was 13,433
--     characters: past the 8 KB request line, so the edge answers 414 and the
--     link is dead.
--   * Because the byte budget bit at ~139 uuid records, EVERY value an
--     administrator could set from 139 to 500 behaved identically — a setting that
--     did nothing — while the basis sentence read, to that administrator, as
--     "200 records will travel". They never did.
--
-- WHAT IS TRUE NOW (client side, this lane, `lib/detail/types.ts` +
-- `listContext.ts` + `presentation.ts`). There is ONE budget and it belongs to
-- the FINAL serialized URL: `DETAIL_URL_BUDGET_BYTES` = 8,000 characters, the
-- strictest request line in front of this platform. Every writer passes what the
-- rest of the address already costs (`reservedBytes` — the path, and for a window
-- the query it is being merged into, re-serialized) and measures the list as that
-- URL will carry it. So no combination of a detail page and an open detail window
-- can exceed the request line any more.
--
-- Inside that budget the knob decides, and this row makes it deliverable:
-- `max_value` and the starting value both become 100, which is
-- `DETAIL_LIST_CONTEXT_MAX_IDS_CEILING` in the client. Measured 2026-09-17
-- against the real encoders: 100 uuid `type.id` pairs under a short type token
-- cost ~6.7 KB in the window's `?panels=` token (the most expensive spelling,
-- ~66 characters per record after both escapings) and ~4.3 KB in the page query;
-- 150 costs ~10 KB in the token and does not fit. So every value from the minimum
-- of 10 up to 100 now changes what really travels. A LONGER type token still
-- trims below the cap — the budget is bytes and always will be — and the record
-- says so in its own words ("stepping through 100 of the 500 records in the list
-- this was opened from"), which is the honesty the cap exists for.
--
-- WHY 100 IS ENOUGH: it is the arrow keys' neighbourhood, not a page size. A
-- person stepping through a list with `[` / `]` passes a handful of records; 100 is
-- ~5× the most anyone has been observed to walk, and reaching the rest is one press
-- of the list the detail was opened from, which the record names.
--
-- Review due 2026-10-31, unchanged. Reversible: restore `max_value = 500`,
-- `default_value = 200` and the previous basis text; the client clamps to its own
-- ceiling either way, so no URL can break in the meantime.
--
-- 🚨 NOT APPLIED BY THIS LANE. Written 2026-09-17 by fix lane F-31, which does not
-- apply database files. Apply with `pnpm db:apply
-- migrations/detail_list_context_max_deliverable.sql`. Until it is applied the live
-- row still offers up to 500 and still carries the basis sentence corrected above,
-- while the CLIENT already clamps every value to 100 and to the final-URL budget —
-- so the failure mode in the meantime is a settings screen offering a number the
-- client quietly lowers, not a link anyone can break.

update platform.feature_knob
   set max_value = 100,
       value = case when value = default_value then to_jsonb(100) else value end,
       default_value = to_jsonb(100),
       basis =
         'The budget belongs to the FINAL URL, once: the client trims the list until the whole ' ||
         'address — path, existing query, the token''s own args and every escaping layer — fits 8,000 ' ||
         'characters (DETAIL_URL_BUDGET_BYTES, lib/detail/types.ts), and the record says so when it ' ||
         'trims. This number is the record ceiling inside that budget. Measured 2026-09-17 ' ||
         '(VERIFY-U-P1-R4, NEW-19 + NEW-20) against the real encoders: a uuid entry costs ~66 ' ||
         'characters in a detail window''s ?panels= token, because UrlPanelManager re-escapes the ' ||
         'token through URLSearchParams (a uuid''s "-" becomes "%252D"), and ~43 in the page query. So ' ||
         '100 entries travel in every presentation (~6.7 KB in the token, ~4.3 KB in the page query) ' ||
         'and 150 do not (~10 KB). The former max_value of 500 and default of 200 could not be ' ||
         'delivered at all: the byte budget stopped a uuid list at 139, so every value from 139 to 500 ' ||
         'behaved identically while this text told an administrator 200 records would travel. A longer ' ||
         'type token still trims below 100, and the record says so.',
       description =
         'How many of the records from a list a shared or bookmarked record link may step through at ' ||
         'most. A link is also limited by its own total length, so a long list is cut to the records ' ||
         'either side of the one the link points at — and the record says so when that happens.',
       updated_at = now()
 where feature = 'ui.detail'
   and key = 'list_context_max_ids';
