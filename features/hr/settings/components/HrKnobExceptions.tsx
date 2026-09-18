"use client";

// features/hr/settings/components/HrKnobExceptions.tsx
//
// 🚨 DD-203 — HR EXCEPTIONS ARE SET WHERE HR SETTINGS LIVE, WITH THE ONE PICKER.
//
// THE FACT THIS CLOSES. `platform.feature_knob` offers 194 `hr.*` keys at
// `employer_profile`, `pay_group` and `location` — the three rungs below the
// organization in SPEC-DATA-MODEL §19's ladder. Until today no screen in the
// product offered ANY of them (582 key-rung pairs, V-57 2026-09-13): the only
// surface that mounted the per-rung override picker is
// `/organizations/<id>/settings/configuration`, and that page excludes every
// `hr.*` key by its own first line, because HR settings live on their own page.
// This panel's predecessor — a dashed box on every HR key that said "a scope
// override is stored on the scope row itself, so it is set where that row is
// edited" — pointed at doors that do not set one, which is a dead end wearing
// a sentence.
//
// THE HOME, AND WHY IT IS THIS ONE. The exceptions to an HR setting belong
// beside that setting, not on a second screen: the org configuration page
// deliberately does not carry HR, and a person configuring pay groups is on
// `/hr/settings`. So the SAME component the organization page uses is mounted
// here, per key, under the key's own control.
//
// 🚨 NOTHING HERE IS A SECOND PICKER. `<KnobRungOverrides>` is imported whole —
// the same searchable row list through `platform.knob_scope_rows`, the same
// `knob_override_set` write, the same removal confirm that names the row, the
// same read-only behaviour for a person who may not write. The only thing this
// file adds is the bridge: HR's own editor reads `hr_knob_index` (an HR-shaped
// row), the picker reads `platform.knob_index` (a `ScopedKnob`), and the ladder
// wants the latter. `UniversalSettingsProvider` is mounted once by the HR
// settings chrome, so that read happens once for the whole surface.
//
// A key the provider does not carry renders NOTHING rather than a guess: the
// picker's whole contract is that the rung it offers is one the resolver will
// answer, and a knob we could not read is a knob whose `overridable_by` we do
// not know.

import { KnobRungOverrides } from "@/features/settings/universal/KnobRungOverrides";
import { useUniversalSettings } from "@/features/settings/universal/UniversalSettingsContext";
import { dispositionFor } from "@/features/settings/universal/disposition";

export function HrKnobExceptions({ fullKey }: { fullKey: string }) {
  const { knobByKey, organizationId } = useUniversalSettings();
  if (!organizationId) return null;
  const knob = knobByKey(fullKey);
  if (!knob) return null;
  // The same disposition the key's own row is given on the universal surface:
  // a key nothing reads gets no NEW exceptions at any rung (F1, V-57).
  return <KnobRungOverrides knob={knob} stateOnly={dispositionFor(fullKey, "organization")} />;
}
