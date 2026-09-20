-- chair-step: this puts `custom/external_principal_enabled`'s `overridable_by` back to `{}` — one platform switch, off, which is where W2-TRUST left it. Any organization override written in between STOPS RESOLVING the moment this runs, which is the point of holding the lane at the knob: every portal in the platform goes dark in one statement and every door refuses by name. The override ROWS are left where they are, so re-widening the rung brings those organizations straight back.
-- lane: PORTAL (the outsider portal, PRODUCTS row 2)

update platform.feature_knob
   set overridable_by = '{}'::text[],
       basis = 'W2-TRUST: one platform switch, off, while nothing consumes the external-principal lane.'
 where feature = 'custom' and key = 'external_principal_enabled';
