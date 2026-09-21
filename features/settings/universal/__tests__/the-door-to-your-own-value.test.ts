// 🚨 THE DOOR A MASKED ROW OPENS (feedback 7dc1e5ae, 2026-09-21).
//
// The row that says "your own setting overrides this for you" has to be able
// to SEND the person there — the report's part B was that the only way to
// clear the masking override was `knob_override_set` by hand. This pins the
// address, and the two ways a door can lie:
//
//   · WITHOUT THE ORGANIZATION it lands on the person's value in whatever
//     organization happens to be active, which is a different value than the
//     one doing the masking. A personal value is held per organization.
//   · UNFILED or not opened to people, and the personal surface has no row to
//     land on at all — the left nav is the taxonomy, so an unfiled key sits in
//     a bucket nobody navigates to.
//
// In both cases the door is CLOSED rather than opened at nothing (law 4: a
// control is absent or honest).

import { personalKnobHref } from "../configTree";
import type { ScopedKnob } from "@/lib/scoped-config/types";

const ORG = "0907939e-2b75-43e8-bfee-da758e5ea75b";

const escalationMode = {
  full_key: "personal_staff.escalation_mode",
  overridable_by: ["organization", "user"],
  taxonomy: {
    domain_slug: "communications",
    feature_slug: "personal-staff",
  },
} as unknown as ScopedKnob;

test("it lands on the person's own row, in the organization that is masking", () => {
  expect(personalKnobHref(escalationMode, ORG)).toBe(
    `/user-settings/config/communications/personal-staff?org=${ORG}#personal_staff.escalation_mode`,
  );
});

test("no organization, no door — it would name a different value than the one masking", () => {
  expect(personalKnobHref(escalationMode, null)).toBeNull();
});

test("a key the personal surface cannot render gets no door", () => {
  expect(
    personalKnobHref(
      { ...escalationMode, overridable_by: ["organization"] } as ScopedKnob,
      ORG,
    ),
  ).toBeNull();
  expect(
    personalKnobHref({ ...escalationMode, taxonomy: null } as ScopedKnob, ORG),
  ).toBeNull();
});

test("a domain-level key lands on its domain leaf, not on a feature that does not exist", () => {
  expect(
    personalKnobHref(
      {
        ...escalationMode,
        taxonomy: { domain_slug: "communications", feature_slug: null },
      } as unknown as ScopedKnob,
      ORG,
    ),
  ).toBe(
    `/user-settings/config/communications/communications?org=${ORG}#personal_staff.escalation_mode`,
  );
});
